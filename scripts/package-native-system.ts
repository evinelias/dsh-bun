import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ensurePackageRootIndices } from '../packages/boot/app-boot/src/package-indices.ts'

const [, platform = process.platform, targetArch = process.arch] = (process.env.BUN_TARGET ?? '').split('-')
const arch = targetArch === 'aarch64' ? 'arm64' : targetArch
const dependencies: Record<string, string> = {}
for (const [file, names] of [
  ['packages/subprocess/subprocess-local/package.json', ['node-pty', 'koffi']],
  ['packages/api/terminal-controller/package.json', ['@xterm/headless', '@xterm/addon-serialize']],
  ['packages/attachment/attachment-local/package.json', ['sharp']],
] as const) {
  const manifest = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
  for (const name of names) dependencies[name] = manifest.dependencies[name]
}
if (platform !== 'win32' && platform !== 'windows') {
  const manifest = JSON.parse(readFileSync(new URL(`../native/system/packages/${platform}-${arch}/package.json`, import.meta.url), 'utf8'))
  dependencies[manifest.name] = manifest.version
}
{
  const staging = mkdtempSync(join(tmpdir(), 'dsh-native-package-'))
  try {
    writeFileSync(join(staging, 'package.json'), JSON.stringify({ private: true, dependencies }))
    const installed = spawnSync('bun', ['install', '--production', '--ignore-scripts', `--os=${platform}`, `--cpu=${arch}`], { cwd: staging, stdio: 'inherit' })
    if (installed.error) throw installed.error
    if (installed.status !== 0) throw new Error(`Native system package install failed: ${installed.status}`)
    const unixTerminal = join(staging, 'node_modules/node-pty/lib/unixTerminal.js')
    const unixSource = readFileSync(unixTerminal, 'utf8')
    if (!unixSource.includes('new tty.ReadStream(term.fd)')) throw new Error('node-pty PTY stream construction changed')
    writeFileSync(unixTerminal, unixSource.replace(/new tty\.ReadStream\((term\.(?:fd|master|slave))\)/g,
      'process.versions.bun ? require("./bunReadStream").createReadStream($1) : new tty.ReadStream($1)'))
    cpSync(new URL('./node-pty-bun-readstream.cjs', import.meta.url), join(staging, 'node_modules/node-pty/lib/bunReadStream.js'))
    ensurePackageRootIndices(join(staging, 'node_modules'))
    const helper = join(staging, 'node_modules/node-pty/prebuilds', `${platform}-${arch}`, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
    for (const output of process.argv.slice(2)) {
      const destination = resolve(output, 'node_modules')
      mkdirSync(destination, { recursive: true })
      for (const entry of readdirSync(join(staging, 'node_modules'))) {
        if (entry.startsWith('.')) continue
        const names = entry.startsWith('@') ? readdirSync(join(staging, 'node_modules', entry)).map(name => join(entry, name)) : [entry]
        for (const name of names) rmSync(join(destination, name), { recursive: true, force: true })
      }
      cpSync(join(staging, 'node_modules'), destination, { recursive: true, verbatimSymlinks: true, filter: path => !path.split('/').includes('.bin') })
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
