/**
 * Generates apps/cli/src/builtin-plugins.generated.ts by reading all official profile templates
 * and bundling their registered plugins and Typert schemas for standalone Bun builds.
 */

import { writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { loadProfile, readProfilePatches, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { INSTALL_ANCHOR } from '../apps/cli/src/profile-boot.ts'

const root = resolve(import.meta.dir, '..')
const outputFile = join(root, 'apps', 'cli', 'src', 'builtin-plugins.generated.ts')

console.log('Resolving builtin plugins from official profile templates...')

const allPlugins = new Set<string>()

// 1. Gather all plugins from official profiles
for (const profileName of Object.keys(PROFILE_TEMPLATES)) {
  try {
    const profile = loadProfile('dsh', profileName, INSTALL_ANCHOR)
    const patches = readProfilePatches('dsh', {
      name: profileName,
      dir: profile.dir,
      patchPath: profile.patchPath,
      installAnchor: INSTALL_ANCHOR,
      home: join(homedir(), '.dsh'),
      cwd: process.cwd(),
      overlays: [],
      startedBundles: profile.layers.map(l => l.packageName),
    }, profile)

    for (const p of patches) {
      for (const ins of p.insert || []) {
        if (ins.name && !ins.name.startsWith('cordis:')) {
          allPlugins.add(ins.name)
        }
      }
    }
  } catch (err) {
    console.warn(`Warning loading profile ${profileName}:`, err)
  }
}

// 2. Add native directory pickers and web startup essentials
const extraPlugins = [
  '@deepseek-ai/cordis-plugin-timer',
  '@deepseek-ai/dsh-host-directory-picker-native',
  '@deepseek-ai/dsh-client-ui-directory-picker-native',
  '@deepseek-ai/dsh-client-ui-directory-picker-browse',
  '@deepseek-ai/dsh-web-app/startup',
  '@deepseek-ai/dsh-web',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-workflow-ptc',
]

for (const extra of extraPlugins) {
  allPlugins.add(extra)
}

// 3. Check for companion /typert exports
for (const name of Array.from(allPlugins)) {
  const typertSpec = `${name}/typert`
  try {
    require.resolve(typertSpec)
    allPlugins.add(typertSpec)
  } catch {}
}

// 4. Verify all entries resolve cleanly in Bun
const validPlugins: string[] = []
for (const spec of allPlugins) {
  try {
    require.resolve(spec)
    validPlugins.push(spec)
  } catch {}
}

validPlugins.sort()

console.log(`Discovered ${validPlugins.length} builtin plugins. Generating ${outputFile}...`)

const lines = [
  '// Auto-generated builtin plugin registry for standalone Bun builds',
  'export const BUILTIN_PLUGINS: Record<string, () => Promise<any>> = {',
  ...validPlugins.map(name => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(name)}),`),
  '};\n',
]

writeFileSync(outputFile, lines.join('\n'), 'utf8')
console.log(`[✓] Generated ${outputFile} with ${validPlugins.length} verified plugins.`)
