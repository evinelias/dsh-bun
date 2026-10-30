import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test.skipIf(process.platform === 'win32')('compiled flock loads its packaged addon and enforces contention', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-compiled-flock-'))
  try {
    const source = join(root, 'check.ts')
    const executable = join(root, 'lock-check')
    writeFileSync(source, `
      import assert from 'node:assert/strict'
      import { openSync, closeSync } from 'node:fs'
      import { tryLockExclusive } from ${JSON.stringify(resolve('native/system/packages/entry/src/flock.ts'))}
      const first = openSync(${JSON.stringify(join(root, 'lock'))}, 'a+')
      const second = openSync(${JSON.stringify(join(root, 'lock'))}, 'a+')
      await tryLockExclusive(first)
      await assert.rejects(tryLockExclusive(second), error => ['EAGAIN', 'EWOULDBLOCK'].includes(error.code))
      closeSync(first)
      await tryLockExclusive(second)
      closeSync(second)
    `)
    const platformPackage = `@deepseek-ai/node-addon-system-${process.platform}-${process.arch}`
    mkdirSync(join(root, 'node_modules/@deepseek-ai'), { recursive: true })
    cpSync(join('dist/node_modules', platformPackage), join(root, 'node_modules', platformPackage), { recursive: true, dereference: true })
    const build = spawnSync('bun', ['build', source, '--compile', '--outfile', executable], { encoding: 'utf8' })
    expect(build.status, build.stderr).toBe(0)
    const run = spawnSync(executable, [], { encoding: 'utf8', cwd: root, timeout: 10000 })
    expect(run.status, run.stderr).toBe(0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30000)
