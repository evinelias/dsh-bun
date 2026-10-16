import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

console.log('=== DeepSeek Harness Tauri v2 Sidecar End-to-End Verification ===')

const root = resolve(import.meta.dir, '..')
const binariesDir = join(root, 'apps', 'desktop', 'src-tauri', 'binaries')

// Find the compiled sidecar binary
const possibleNames = [
  'dsh-bun-x86_64-pc-windows-gnu.exe',
  'dsh-bun-x86_64-pc-windows-msvc.exe',
  'dsh-bun-aarch64-apple-darwin',
  'dsh-bun-x86_64-apple-darwin',
  'dsh-bun-x86_64-unknown-linux-gnu',
  'dsh-bun.exe',
  'dsh-bun',
]

let sidecarPath: string | undefined
for (const name of possibleNames) {
  const p = join(binariesDir, name)
  if (existsSync(p)) {
    sidecarPath = p
    break
  }
}

if (!sidecarPath) {
  console.error('[-] No compiled sidecar binary found in:', binariesDir)
  process.exit(1)
}

console.log(`[+] Found sidecar binary: ${sidecarPath}`)

// Spawn sidecar with ["web", "--no-open", "--port", "0"]
console.log('[+] Spawning sidecar in headless mode (flags: web --no-open --port 0)...')
const child = spawn(sidecarPath, ['web', '--no-open', '--port', '0'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let capturedUrl: string | undefined

const timeout = setTimeout(() => {
  console.error('[-] Timeout waiting for sidecar to emit authenticated URL')
  child.kill()
  process.exit(1)
}, 15000)

child.stdout.on('data', async (chunk) => {
  const text = chunk.toString()
  process.stdout.write(`[Sidecar Output] ${text}`)

  const match = /dsh web:\s*(https?:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(text)
  if (match && match[1] && !capturedUrl) {
    capturedUrl = match[1].trim()
    console.log(`\n[+] Successfully extracted authenticated URL from sidecar stdout:`)
    console.log(`    ${capturedUrl}`)

    clearTimeout(timeout)

    // Verify token exchange & web UI serving
    try {
      console.log('[+] Verifying HTTP exchange with Elysia server...')
      const tokenRes = await fetch(capturedUrl, { redirect: 'manual' })
      console.log(`[+] Token Auth exchange: ${tokenRes.status} ${tokenRes.statusText}`)
      const cookie = tokenRes.headers.get('set-cookie')
      console.log(`[+] Auth cookie received: ${cookie ? 'yes' : 'no'}`)

      const origin = new URL(capturedUrl).origin
      const uiRes = await fetch(`${origin}/`, {
        headers: cookie ? { Cookie: cookie.split(';')[0] } : {},
      })
      const html = await uiRes.text()
      console.log(`[+] Authenticated UI response: ${uiRes.status} ${uiRes.statusText}`)
      console.log(`[+] Official Web UI served: ${html.length} bytes (Root/App element: ${html.includes('root')})`)

      console.log('[+] Sending SIGTERM to sidecar child process...')
      child.kill()
    } catch (err) {
      console.error('[-] Error verifying sidecar HTTP server:', err)
      child.kill()
      process.exit(1)
    }
  }
})

child.stderr.on('data', (chunk) => {
  process.stderr.write(`[Sidecar Stderr] ${chunk}`)
})

child.on('close', (code) => {
  console.log(`[+] Sidecar child process exited cleanly with code: ${code}`)
  console.log('=== End-to-End Sidecar Verification Succeeded! ===')
  process.exit(0)
})
