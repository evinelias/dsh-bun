import type { UserConfig } from 'tsdown'
import { clientBundle } from '../../client/tsdown.client.ts'
import { profileWorkerBanner } from '../../tsdown.worker.ts'
import { buildDevtools } from './scripts/build-devtools.ts'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

const workerEntry = existsSync(join(import.meta.dirname, 'lib/types/worker/entry.js'))
  ? 'lib/types/worker/entry.js'
  : 'src/worker/entry.ts'

const worker: UserConfig = {
  entry: { worker: workerEntry },
  outDir: 'lib',
  format: ['esm'],
  banner: profileWorkerBanner('esm'),
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  outputOptions: { inlineDynamicImports: true },
  deps: { neverBundle: specifier => (
    specifier === 'ws' || specifier === '@deepseek-ai/dsh-app-boot/worker/profile-resolution-bootstrap'
  ) },
}

/** Build the Host plugin and Worker during the Host pass, and the dynamic Client plugin during the Client pass. */
export default clientBundle(
  import.meta.dirname,
  ['lib/types/index.js'],
  {
    hostPhase: true,
    companions: [worker],
    lib: {
      hooks: {
        'build:done': async () => { await buildDevtools() },
      },
    },
  },
)
