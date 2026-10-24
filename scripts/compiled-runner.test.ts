import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { cleanupLinuxLaunchFiles, createLinuxLaunchFiles } from '../packages/subprocess/subprocess-local/src/runner-protocol.ts'

test.skipIf(process.platform !== 'linux')('compiled runner executes its target without parsing CLI profile arguments', () => {
  const files = createLinuxLaunchFiles({ cwd: '/tmp', env: { PATH: '/usr/bin:/bin', RUNNER_MARKER: 'runner-ok' } })
  try {
    const result = spawnSync(resolve('dist/dsh-bun'), ['--', '/bin/sh', '-c', 'test -z "$DSH_SUBPROCESS_RUNNER" && printf "%s" "$RUNNER_MARKER"'], {
      cwd: '/',
      env: { PATH: process.env.PATH, DSH_SUBPROCESS_RUNNER: files.requestPath },
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toBe('runner-ok')
  } finally {
    cleanupLinuxLaunchFiles(files)
  }
}, 15000)
