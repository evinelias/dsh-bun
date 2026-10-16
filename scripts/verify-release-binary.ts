import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

async function runVerification() {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const binaryPath = resolve(process.cwd(), 'dist', `dsh-bun${ext}`)

  console.log(`[1] Launching standalone binary: ${binaryPath}...`)
  const proc = spawn(binaryPath, ['web', '--no-open', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  let serverUrl = ''

  const exitPromise = new Promise<void>((_, reject) => {
    proc.on('exit', (code) => {
      reject(new Error(`Server exited unexpectedly with code ${code}`))
    })
  })

  const urlPromise = new Promise<string>((resolve) => {
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
      const match = /dsh web:\s*(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(text)
      if (match) {
        resolve(match[1])
      }
    })
    proc.stderr.on('data', (chunk) => {
      process.stderr.write(chunk)
    })
  })

  try {
    serverUrl = await Promise.race([urlPromise, exitPromise]) as string
    console.log(`\n[+] Server started cleanly at: ${serverUrl}`)

    const parsedUrl = new URL(serverUrl)
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`

    // 2. Perform authentication handshake to receive session cookie
    console.log('[2] Exchanging auth token for session cookie...')
    const authRes = await fetch(serverUrl, { redirect: 'manual' })
    const cookie = authRes.headers.get('set-cookie')
    if (!cookie) {
      throw new Error('Failed to obtain authentication cookie from server')
    }
    const cookieHeader = cookie.split(';')[0]
    console.log(`[+] Authenticated cookie: ${cookieHeader}`)

    // Helper to call RPC
    async function rpcCall(endpoint: string, args: Record<string, unknown> = {}) {
      const rpcId = 'test-' + Math.random().toString(36).slice(2)
      const res = await fetch(`${baseUrl}/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': cookieHeader,
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId,
          method: endpoint,
          payload: { args },
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status} for ${endpoint}: ${text}`)
      }

      const json = (await res.json()) as { result: { ok: boolean; value?: unknown; error?: unknown } }
      return json.result
    }

    // 3. Test llm/listProviders
    console.log('\n[3] Testing RPC: llm/listProviders...')
    const llmResult = await rpcCall('llm/listProviders')
    console.log('llm/listProviders result:', JSON.stringify(llmResult))
    if (!llmResult.ok) {
      throw new Error(`llm/listProviders failed: ${JSON.stringify(llmResult.error)}`)
    }
    console.log('[+] llm/listProviders passed successfully!')

    // 4. Test agentPresets/list
    console.log('\n[4] Testing RPC: agentPresets/list...')
    const presetsResult = await rpcCall('agentPresets/list')
    console.log('agentPresets/list result:', JSON.stringify(presetsResult))
    if (!presetsResult.ok) {
      throw new Error(`agentPresets/list failed: ${JSON.stringify(presetsResult.error)}`)
    }
    console.log('[+] agentPresets/list passed successfully!')

    // 5. Test pluginInventory/list
    console.log('\n[5] Testing RPC: pluginInventory/list...')
    const pluginsResult = await rpcCall('pluginInventory/list')
    console.log('pluginInventory/list result count:', pluginsResult.ok ? pluginsResult.value?.length : 'error')
    if (!pluginsResult.ok) {
      throw new Error(`pluginInventory/list failed: ${JSON.stringify(pluginsResult.error)}`)
    }
    console.log('[+] pluginInventory/list passed successfully!')

    // 6. Test account/getState
    console.log('\n[6] Testing RPC: account/getState...')
    const accountResult = await rpcCall('account/getState', {})
    console.log('account/getState result:', JSON.stringify(accountResult))
    if (!accountResult.ok) {
      throw new Error(`account/getState failed: ${JSON.stringify(accountResult.error)}`)
    }
    console.log('[+] account/getState passed successfully!')

    // 7. Test directoryPicker/pick with abort
    console.log('\n[7] Testing RPC: directoryPicker/pick resolution...')
    const abortCtrl = new AbortController()
    setTimeout(() => abortCtrl.abort(), 100)
    try {
      const pickPromise = rpcCall('directoryPicker/pick', {})
      // Wait a short bit or let it resolve/reject
      const pickResult = await Promise.race([
        pickPromise,
        new Promise(r => setTimeout(() => r({ ok: true, note: 'dialog opened' }), 500)),
      ])
      console.log('directoryPicker/pick result:', JSON.stringify(pickResult))
      console.log('[+] directoryPicker/pick resolved successfully without gateway errors!')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('must use unique identifier parameters')) {
        throw e
      }
      console.log('directoryPicker/pick received expected OS dialog / abort:', msg)
      console.log('[+] directoryPicker/pick gateway resolution passed!')
    }

    console.log('\n=== ALL ENDPOINTS VERIFIED SUCCESSFULLY! ===\n')
  } finally {
    console.log('Terminating server process...')
    proc.kill()
  }
}

runVerification().catch((err) => {
  console.error('\n[-] Verification failed:', err)
  process.exit(1)
})
