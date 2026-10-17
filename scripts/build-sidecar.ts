import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PkgJson {
  name?: string
  dsh?: { client?: unknown }
}

function copyClientPlugins(targetDir: string, rootDir: string): number {
  function walk(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'target') {
          results.push(...walk(full))
        }
      } else if (entry.name === 'package.json') {
        results.push(full)
      }
    }
    return results
  }

  const pkgs = walk(join(rootDir, 'packages'))
  let count = 0
  for (const p of pkgs) {
    try {
      const json = JSON.parse(readFileSync(p, 'utf8')) as PkgJson
      if (json.dsh?.client && typeof json.name === 'string') {
        const srcDir = dirname(p)
        const destDir = join(targetDir, 'client-plugins', ...json.name.split('/'))
        mkdirSync(destDir, { recursive: true })
        cpSync(p, join(destDir, 'package.json'))
        if (existsSync(join(srcDir, 'lib'))) {
          cpSync(join(srcDir, 'lib'), join(destDir, 'lib'), { recursive: true })
        }
        if (existsSync(join(srcDir, 'locale'))) {
          cpSync(join(srcDir, 'locale'), join(destDir, 'locale'), { recursive: true })
        }
        count++
      }
    } catch {}
  }
  return count
}

function findRipgrepBinary(rootDir: string, isWin: boolean): string | undefined {
  const rgName = isWin ? 'rg.exe' : 'rg'

  // 1. Search in node_modules for @vscode ripgrep prebuilts
  try {
    const bunModules = join(rootDir, 'node_modules', '.bun')
    if (existsSync(bunModules)) {
      for (const entry of readdirSync(bunModules)) {
        if (entry.includes('ripgrep')) {
          const checkBin = join(bunModules, entry, 'node_modules', '@vscode')
          if (existsSync(checkBin)) {
            for (const sub of readdirSync(checkBin)) {
              const full = join(checkBin, sub, 'bin', rgName)
              if (existsSync(full)) return full
            }
          }
        }
      }
    }
  } catch {}

  const standardPaths = [
    join(rootDir, 'node_modules', '@vscode', 'ripgrep', 'bin', rgName),
    join(rootDir, 'node_modules', '@vscode', isWin ? 'ripgrep-win32-x64' : 'ripgrep-linux-x64', 'bin', rgName),
  ]
  for (const p of standardPaths) {
    if (existsSync(p)) return p
  }

  // 2. Check system PATH
  const pathDirs = (process.env.PATH ?? '').split(isWin ? ';' : ':')
  for (const dir of pathDirs) {
    if (!dir) continue
    const candidate = join(dir, rgName)
    if (existsSync(candidate)) return candidate
  }

  return undefined
}

function getTargetTriple(): string {
  if (process.env.TARGET_TRIPLE) {
    return process.env.TARGET_TRIPLE.trim()
  }
  // Try rustc first
  const rustcCandidates = [
    'rustc',
    join(homedir(), '.cargo', 'bin', 'rustc.exe'),
    join(homedir(), '.cargo', 'bin', 'rustc'),
  ]

  for (const cmd of rustcCandidates) {
    try {
      const output = execSync(`"${cmd}" -vV`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const match = /host:\s*([^\r\n]+)/.exec(output)
      if (match && match[1]) {
        return match[1].trim()
      }
    } catch {}
  }

  // Fallback based on process.platform & process.arch
  const platform = process.platform
  const arch = process.arch

  if (platform === 'win32') {
    return arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc'
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu'
  }

  throw new Error(`Unsupported platform/architecture: ${platform}/${arch}`)
}

function main(): void {
  console.log('=== Building DeepSeek Harness Web UI & Tauri v2 Sidecar ===')
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const root = resolve(scriptDir, '..')

  // 1. Generate Typert manifests so host builtins resolve companion manifests
  console.log('[1/6] Generating Typert manifests...')
  execSync('bun scripts/generate-typert.ts', { cwd: root, stdio: 'inherit' })

  // 2. Build client plugin packages
  console.log('[2/6] Building client packages (78 plugins)...')
  execSync('bun scripts/build-client-packages.ts', { cwd: root, stdio: 'inherit' })

  console.log('[2.5/6] Regenerating builtin plugins registry...')
  execSync('bun scripts/generate-builtin-registry.ts', { cwd: root, stdio: 'inherit' })

  // 2. Build apps/web
  console.log('[2/5] Building Web UI frontend (apps/web)...')
  execSync('bun run --cwd apps/web build', { cwd: root, stdio: 'inherit' })

  // 3. Resolve target triple
  const triple = getTargetTriple()
  console.log(`[3/5] Detected target triple: ${triple}`)

  const isWindows = triple.includes('windows')
  const ext = (process.env.EXT !== undefined && process.env.EXT !== '')
    ? process.env.EXT
    : (isWindows ? '.exe' : '')
  const sidecarName = `dsh-bun-${triple}${ext}`
  const binariesDir = join(root, 'apps', 'desktop', 'src-tauri', 'binaries')
  mkdirSync(binariesDir, { recursive: true })
  const sidecarPath = join(binariesDir, sidecarName)

  // 4. Compile standalone sidecar binary
  const targetFlag = process.env.BUN_TARGET ? `--target=${process.env.BUN_TARGET}` : ''
  console.log(`[4/5] Compiling Bun standalone sidecar binary to ${sidecarPath} ${targetFlag}...`)
  execSync(`bun build apps/cli/src/bin.ts --compile --minify ${targetFlag} --outfile "${sidecarPath}"`, {
    cwd: root,
    stdio: 'inherit',
  })

  function safeCp(src: string, dest: string, opts?: { recursive?: boolean }): void {
    if (resolve(src) === resolve(dest)) return
    cpSync(src, dest, opts)
  }

  // Also create a local dist/dsh-bun copy for CLI use
  const distDir = join(root, 'dist')
  mkdirSync(distDir, { recursive: true })
  const distPath = join(distDir, `dsh-bun${ext}`)
  safeCp(sidecarPath, distPath)

  if (isWindows) {
    const msvcPath = join(binariesDir, 'dsh-bun-x86_64-pc-windows-msvc.exe')
    const gnuPath = join(binariesDir, 'dsh-bun-x86_64-pc-windows-gnu.exe')
    const bareWinPath = join(binariesDir, 'dsh-bun.exe')
    safeCp(sidecarPath, msvcPath)
    safeCp(sidecarPath, gnuPath)
    safeCp(sidecarPath, bareWinPath)
    console.log('[+] Synchronized MSVC, GNU and bare dsh-bun Windows binaries')

    // Also update installed Desktop AppData if present
    const installedDir = join(homedir(), 'AppData', 'Local', 'DeepSeek Harness (Bun Edition)')
    if (existsSync(installedDir)) {
      try {
        safeCp(sidecarPath, join(installedDir, 'dsh-bun.exe'))
        console.log(`[+] Updated installed sidecar binary in ${installedDir}`)
      } catch (e) {
        console.warn(`[!] Could not update installed sidecar binary (in use?): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  // Bundle single ripgrep executable adjacent to binaries so glob/grep search works 100% out of the box
  const rgSource = findRipgrepBinary(root, isWindows)
  const rgName = isWindows ? 'rg.exe' : 'rg'
  if (rgSource) {
    console.log(`[+] Bundling ripgrep from: ${rgSource}`)
    safeCp(rgSource, join(binariesDir, rgName))
    safeCp(rgSource, join(distDir, rgName))
    if (isWindows) {
      const installedDir = join(homedir(), 'AppData', 'Local', 'DeepSeek Harness (Bun Edition)')
      if (existsSync(installedDir)) {
        try {
          safeCp(rgSource, join(installedDir, rgName))
          console.log(`[+] Updated installed ripgrep binary in ${installedDir}`)
        } catch {}
      }
    }
  } else {
    console.warn('[!] Ripgrep binary not found; glob/grep tools will search system PATH')
  }

  // 5. Copy web-dist adjacent to binaries so the sidecar is 100% self-contained
  console.log('[5/5] Bundling web-dist assets and client plugins adjacent to binaries...')
  const webDistSrc = join(root, 'apps', 'web', 'dist')
  const sidecarWebDist = join(binariesDir, 'web-dist')
  const distWebDist = join(distDir, 'web-dist')

  cpSync(webDistSrc, sidecarWebDist, { recursive: true })
  cpSync(webDistSrc, distWebDist, { recursive: true })

  const sidecarClientCount = copyClientPlugins(sidecarWebDist, root)
  copyClientPlugins(distWebDist, root)
  console.log(`[+] Bundled ${sidecarClientCount} client plugins into web-dist/client-plugins`)

  // Copy installation package.json so standalone/packaged runtimes have an install anchor
  const cliPkgSrc = join(root, 'apps', 'cli', 'package.json')
  cpSync(cliPkgSrc, join(sidecarWebDist, 'package.json'))
  cpSync(cliPkgSrc, join(distWebDist, 'package.json'))
  cpSync(cliPkgSrc, join(binariesDir, 'package.json'))
  cpSync(cliPkgSrc, join(distDir, 'package.json'))
  console.log('[+] Bundled package.json into web-dist and binaries directories')

  if (isWindows) {
    const installedDir = join(homedir(), 'AppData', 'Local', 'DeepSeek Harness (Bun Edition)')
    if (existsSync(installedDir)) {
      try {
        cpSync(webDistSrc, join(installedDir, 'web-dist'), { recursive: true })
        cpSync(webDistSrc, join(installedDir, 'binaries', 'web-dist'), { recursive: true })
        console.log(`[+] Updated installed web-dist assets in ${installedDir}`)
      } catch (e) {
        console.warn(`[!] Could not update installed web-dist (in use?): ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  console.log(`[+] Sidecar successfully built: ${sidecarPath}`)
  console.log(`[+] Standalone binary: ${distPath}`)
  console.log('=== Sidecar build complete! ===')
}

try {
  main()
} catch (err: unknown) {
  console.error('[-] Failed to build sidecar:', err)
  process.exit(1)
}
