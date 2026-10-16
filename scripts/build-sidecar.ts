import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

function getTargetTriple(): string {
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

async function main() {
  console.log('=== Building DeepSeek Harness Web UI & Tauri v2 Sidecar ===')
  const root = resolve(import.meta.dir, '..')

  // 1. Build apps/web
  console.log('[1/4] Building Web UI frontend (apps/web)...')
  execSync('bun run --cwd apps/web build', { cwd: root, stdio: 'inherit' })

  // 2. Resolve target triple
  const triple = getTargetTriple()
  console.log(`[2/4] Detected target triple: ${triple}`)

  const ext = process.platform === 'win32' ? '.exe' : ''
  const sidecarName = `dsh-bun-${triple}${ext}`
  const binariesDir = join(root, 'apps', 'desktop', 'src-tauri', 'binaries')
  mkdirSync(binariesDir, { recursive: true })
  const sidecarPath = join(binariesDir, sidecarName)

  // 3. Compile standalone sidecar binary
  console.log(`[3/4] Compiling Bun standalone sidecar binary to ${sidecarPath}...`)
  execSync(`bun build apps/cli/src/bin.ts --compile --outfile "${sidecarPath}"`, {
    cwd: root,
    stdio: 'inherit',
  })

  // Also create a local dist/dsh-bun copy for CLI use
  const distDir = join(root, 'dist')
  mkdirSync(distDir, { recursive: true })
  const distPath = join(distDir, `dsh-bun${ext}`)
  cpSync(sidecarPath, distPath)

  // 4. Copy web-dist adjacent to binaries so the sidecar is 100% self-contained
  console.log('[4/4] Bundling web-dist assets adjacent to binaries...')
  const webDistSrc = join(root, 'apps', 'web', 'dist')
  const sidecarWebDist = join(binariesDir, 'web-dist')
  const distWebDist = join(distDir, 'web-dist')

  cpSync(webDistSrc, sidecarWebDist, { recursive: true })
  cpSync(webDistSrc, distWebDist, { recursive: true })

  console.log(`[+] Sidecar successfully built: ${sidecarPath}`)
  console.log(`[+] Standalone binary: ${distPath}`)
  console.log('=== Sidecar build complete! ===')
}

main().catch((err) => {
  console.error('[-] Failed to build sidecar:', err)
  process.exit(1)
})
