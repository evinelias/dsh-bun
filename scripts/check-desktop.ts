import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

console.log('=== Checking Tauri v2 Desktop App (Cargo Check) ===')
const root = resolve(import.meta.dir, '..')
const home = homedir()

// Build PATH including w64devkit and cargo
const mingwBin = join(home, 'w64devkit', 'bin')
const cargoBin = join(home, '.cargo', 'bin')
const extraPath = [mingwBin, cargoBin].join(process.platform === 'win32' ? ';' : ':')
const env = {
  ...process.env,
  PATH: `${extraPath}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
}

// On Windows, if path has spaces (e.g. 'DEEPSEEK HARNESS'), use drive X: alias if available
let desktopDir = join(root, 'apps', 'desktop', 'src-tauri')
if (process.platform === 'win32' && root.includes(' ')) {
  try {
    execSync(`subst X: "${root}"`, { stdio: 'ignore' })
  } catch {}
  desktopDir = 'X:\\apps\\desktop\\src-tauri'
}

try {
  execSync('cargo check', {
    cwd: desktopDir,
    env,
    stdio: 'inherit',
  })
  console.log('[+] Cargo check succeeded with 0 compilation errors!')
} catch (err) {
  console.error('[-] Cargo check failed:', err)
  process.exit(1)
}
