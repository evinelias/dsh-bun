import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [, platform = process.platform, targetArch = process.arch] = (process.env.BUN_TARGET ?? '').split('-')
const arch = targetArch === 'aarch64' ? 'arm64' : targetArch
if (platform !== 'win32' && platform !== 'windows') {
  const manifest = JSON.parse(readFileSync(new URL(`../native/system/packages/${platform}-${arch}/package.json`, import.meta.url), 'utf8'))
  const staging = mkdtempSync(join(tmpdir(), 'dsh-native-package-'))
  try {
    writeFileSync(join(staging, 'package.json'), JSON.stringify({ private: true, dependencies: { [manifest.name]: manifest.version } }))
    const installed = spawnSync('bun', ['install', '--production', '--ignore-scripts', `--os=${platform}`, `--cpu=${arch}`], { cwd: staging, stdio: 'inherit' })
    if (installed.error) throw installed.error
    if (installed.status !== 0) throw new Error(`Native system package install failed: ${installed.status}`)
    for (const output of process.argv.slice(2)) {
      const destination = resolve(output, 'node_modules', manifest.name)
      mkdirSync(destination, { recursive: true })
      cpSync(join(staging, 'node_modules', manifest.name), destination, { recursive: true, dereference: true })
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
