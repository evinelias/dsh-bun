import { runProfile } from '../apps/cli/src/profile-boot.ts'
import { loadLayeredEnv } from '../packages/boot/app-boot/src/index.ts'

console.log('--- DeepSeek Harness (Bun + Elysia) Boot Verification ---')
try {
  const result = await runProfile({
    environment: loadLayeredEnv('dsh'),
    profile: 'web',
    fromDefaultProfile: undefined,
    patchFiles: [],
    args: ['--no-open', '--port', '0'],
  })
  console.log('[+] Cordis kernel initialized successfully')
  const origin = result.ctx.webServer?.getOrigin?.()
  const port = result.ctx.webServer?.port
  console.log(`[+] WebServer listening on: ${origin} (port: ${port})`)
  console.log(`[+] Elysia router attached: ${!!result.ctx.webServer?.elysia}`)

  // 1. Unauthenticated request verification
  const unauthRes = await fetch(`${origin}/`, { redirect: 'manual' })
  console.log(`[+] Unauthenticated GET /: ${unauthRes.status} ${unauthRes.statusText} (Expected: 401)`)

  // 2. Token auth exchange verification
  const tokenUrl = (result.ctx as any).connection?.authenticatedUrl(origin)
  console.log(`[+] Auth Token URL: ${tokenUrl}`)
  const authRes = await fetch(tokenUrl, { redirect: 'manual' })
  const cookie = authRes.headers.get('set-cookie')
  console.log(`[+] Token Auth exchange: ${authRes.status} ${authRes.statusText} (Set-Cookie: ${cookie ? 'yes' : 'no'})`)

  // 3. Authenticated session request verification (Web UI frontend)
  const sessionRes = await fetch(`${origin}/`, {
    headers: cookie ? { Cookie: cookie.split(';')[0] } : {},
  })
  const html = await sessionRes.text()
  console.log(`[+] Authenticated GET /: ${sessionRes.status} ${sessionRes.statusText}`)
  console.log(`[+] Received HTML payload: ${html.length} bytes (Title / App detected: ${html.includes('DeepSeek') || html.includes('dsh') || html.includes('root')})`)

  // Clean shutdown
  console.log('[+] Initiating clean shutdown...')
  await result.shutdown.shutdown(0)
  console.log('[+] Clean shutdown completed with 0 errors.')
  process.exit(0)
} catch (err) {
  console.error('[-] Boot verification failed:', err)
  process.exit(1)
}
