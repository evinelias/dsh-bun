import type { UserConfig } from 'tsdown'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { clientBundle } from '../../client/tsdown.client.ts'

function resolveCuaEntry(name: string): string {
  const libPath = `lib/types/${name}.js`
  if (existsSync(join(import.meta.dirname, libPath))) return libPath
  return `src/${name}.ts`
}

const runtime: UserConfig[] = Object.entries({
  'remote-types': resolveCuaEntry('remote-types'),
  api: resolveCuaEntry('api'),
  bridge: resolveCuaEntry('bridge'),
  'native-client': resolveCuaEntry('native-client'),
  protocol: resolveCuaEntry('protocol'),
}).map(([name, path]) => ({
  entry: { [name]: path },
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
}))

export default clientBundle(import.meta.dirname, ['lib/types/index.js'], { hostPhase: true, companions: runtime })
