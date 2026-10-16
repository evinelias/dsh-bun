/**
 * Generates apps/cli/src/builtin-plugins.generated.ts by scanning:
 * 1. All official profile templates (web, acp, headless, sdk, sdk-minimal)
 * 2. All official agent presets (standard, ptc, minimal, cordis) in packages/bundle/web-app/presets
 * 3. Essential host runtime and directory picker plugins
 *
 * NOTE: Companion /typert subpaths and frontend client packages are explicitly omitted.
 */

import { writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { loadProfile, readProfilePatches, PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'
import { INSTALL_ANCHOR } from '../apps/cli/src/profile-boot.ts'

const root = resolve(import.meta.dir, '..')
const outputFile = join(root, 'apps', 'cli', 'src', 'builtin-plugins.generated.ts')
const cliRequire = createRequire(join(root, 'apps', 'cli', 'package.json'))

console.log('Resolving builtin plugins from official profile templates and agent presets...')

const allPlugins = new Set<string>()

// 1. Gather plugins from official profiles
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

// 2. Scan preset patch files in packages/bundle/web-app/presets/
const presetsDir = join(root, 'packages', 'bundle', 'web-app', 'presets')
if (existsSync(presetsDir)) {
  for (const entry of readdirSync(presetsDir)) {
    if (entry.endsWith('.patch.yml')) {
      const text = readFileSync(join(presetsDir, entry), 'utf8')
      const regex = /name:\s*['"]?(@deepseek-ai\/[^\s'"]+|cordis-plugin-[^\s'"]+)['"]?/g
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        allPlugins.add(match[1])
      }
    }
  }
}

// 3. Add essential startup plugins and pickers
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

// 4. Verify all entries resolve cleanly in Bun / apps/cli without /typert errors
const validPlugins: string[] = []
for (const spec of allPlugins) {
  // Explicitly ignore any /typert subpaths or frontend packages that require Rolldown/Vite
  if (spec.endsWith('/typert')) continue
  try {
    cliRequire.resolve(spec)
    validPlugins.push(spec)
  } catch {
    try {
      require.resolve(spec)
      validPlugins.push(spec)
    } catch {}
  }
}

validPlugins.sort()

console.log(`Discovered ${validPlugins.length} verified builtin plugins. Generating ${outputFile}...`)

const lines = [
  '// Auto-generated builtin plugin registry for standalone Bun builds',
  'export const BUILTIN_PLUGINS: Record<string, () => Promise<unknown>> = {',
  ...validPlugins.map(name => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(name)}),`),
  '};\n',
]

writeFileSync(outputFile, lines.join('\n'), 'utf8')
console.log(`[✓] Generated ${outputFile} with ${validPlugins.length} verified plugins.`)
