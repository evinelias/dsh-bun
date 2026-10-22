/** Verify disk-loaded plugins share the standalone executable's core modules. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'dsh-external-plugin-'))
const packageDir = join(home, 'profiles', 'web', 'node_modules', '@fixture', 'external-probe')
const overlay = join(home, 'probe.patch.yml')
await mkdir(packageDir, { recursive: true })
await writeFile(join(packageDir, 'package.json'), JSON.stringify({
  name: '@fixture/external-probe', version: '1.0.0', type: 'module', main: './index.js',
}))
await writeFile(join(packageDir, 'index.js'), `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Context, Service } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
export const inject = ['tools']
export function apply(ctx) {
  assert(ctx instanceof Context, 'plugin must use the host Context class')
  assert(ctx.tools instanceof Service, 'plugin must use the host Service class')
  assert(ctx.tools instanceof ToolRuntime, 'plugin must use the host ToolRuntime class')
  const required = createRequire(import.meta.url)('@deepseek-ai/dsh-tools')
  assert.equal(required.default ?? required, ToolRuntime)
  assert.equal(createUserMessage({ content: [], source: { type: 'user' } }).role, 'user')
  console.log('external-plugin-ok')
}
`)
await writeFile(overlay, '- insert:\n  - id: external-probe\n    name: "@fixture/external-probe"\n    required: true\n')
const child = spawn(resolve('dist/dsh-bun' + (process.platform === 'win32' ? '.exe' : '')), [
  '--profile', 'web', '--patch', overlay, '--no-open', '--port', '0',
], { cwd: home, env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
try {
  await new Promise<void>((ready, reject) => {
    const timer = setTimeout(() => reject(new Error('external plugin boot timed out')), 20000)
    const read = (data: Buffer): void => {
      output += data.toString()
      if (output.includes('external-plugin-ok') && output.includes('dsh web:')) { clearTimeout(timer); ready() }
      else if (output.includes('external-probe (@fixture/external-probe):')) {
        clearTimeout(timer)
        reject(new Error('external plugin failed to activate'))
      }
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`external plugin process exited ${String(code)}`)) })
  })
  assert(!output.includes('failed to import'), 'external plugin must load without import failures')
  console.log('External ESM and CommonJS imports share the embedded host classes and subpath exports.')
} catch (error) {
  console.error(output.replace(/token=[^\s]+/gu, 'token=[redacted]'))
  throw error
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    await exited
    clearTimeout(timer)
  }
  await rm(home, { recursive: true, force: true })
}
