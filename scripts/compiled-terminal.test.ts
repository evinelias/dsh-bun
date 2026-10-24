import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

test.skipIf(process.platform === 'win32')('compiled runtime opens a real PTY and loads its lazy dependencies and package metadata', () => {
  const source = resolve('dist/terminal-check.ts')
  const executable = resolve('dist/terminal-check')
  try {
    writeFileSync(source, `
      import assert from 'node:assert/strict'
      import { createRequire } from 'node:module'
      import { createLazyRequire } from ${JSON.stringify(resolve('packages/util/lazy-require/src/index.ts'))}
      const load = name => createLazyRequire(name, import.meta.url)()
      const pty = load('node-pty')
      assert.equal(typeof load('koffi').load, 'function')
      assert.equal(typeof load('@xterm/headless').Terminal, 'function')
      assert.equal(typeof load('@xterm/addon-serialize').SerializeAddon, 'function')
      assert.equal(typeof load('sharp'), 'function')
      const require = createRequire(process.execPath)
      for (const name of ['dsh-llm','dsh-skill','dsh-tools','dsh-experimental-auto-review','dsh-experimental-voice-input-bundle']) {
        assert.equal(require('@deepseek-ai/'+name+'/package.json').version, '0.2.1-rc.3')
      }
      let output = ''
      await new Promise((resolve, reject) => {
        const terminal = pty.spawn('/bin/sh', ['-c', 'test -t 0 && printf PTY_OK; read ack'], {cols:80,rows:24,env:process.env})
        const timer = setTimeout(() => {terminal.kill();reject(Error('PTY timed out'))}, 5000)
        terminal.onData(data => { output += data; if (output.includes('PTY_OK')) terminal.write('done\\n') })
        terminal.onExit(({exitCode}) => {clearTimeout(timer);exitCode===0 ? resolve() : reject(Error('PTY exit '+exitCode))})
      })
      assert.match(output, /PTY_OK/)
    `)
    const build = spawnSync('bun', ['build', source, '--compile', '--outfile', executable], { encoding: 'utf8' })
    expect(build.status, build.stderr).toBe(0)
    const run = spawnSync(executable, [], { cwd: '/tmp', encoding: 'utf8', timeout: 15000 })
    expect(run.status, run.stderr).toBe(0)
  } finally {
    rmSync(source, { force: true })
    rmSync(executable, { force: true })
  }
}, 30000)
