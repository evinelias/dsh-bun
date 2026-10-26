/**
 * Generates apps/cli/src/builtin-plugins.generated.ts by scanning:
 * 1. All official profile templates (web, acp, headless, sdk, sdk-minimal)
 * 2. All official agent presets (standard, ptc, minimal, cordis) in packages/bundle/web-app/presets
 * 3. Essential host runtime and directory picker plugins
 *
 * Also embeds the runtime dependency exports external plugins import from the host.
 */

import { writeFileSync, existsSync, globSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { loadProfile, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
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

// 4. Also discover companion /typert manifests for all plugins
for (const spec of Array.from(allPlugins)) {
  const typertSpec = `${spec}/typert`
  try {
    cliRequire.resolve(typertSpec)
    allPlugins.add(typertSpec)
  } catch {
    try {
      require.resolve(typertSpec)
      allPlugins.add(typertSpec)
    } catch {}
  }
}

// 5. Verify all entries resolve cleanly in Bun / apps/cli
const validPlugins: string[] = []
for (const spec of allPlugins) {
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

const manifests = new Map(globSync(['vendor/*/package.json', 'packages/*/*/package.json'], { cwd: root }).map((file) => {
  const manifest = JSON.parse(readFileSync(join(root, file), 'utf8')) as {
    name: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    exports?: Record<string, string | Record<string, string>>
  }
  return [manifest.name, { manifest, directory: dirname(file) }] as const
}))
const runtimePackages = new Set(validPlugins.map(spec => spec.split('/').slice(0, 2).join('/')))
for (const name of runtimePackages) {
  const pkg = manifests.get(name)
  if (!pkg) continue
  for (const dependency of Object.keys({ ...pkg.manifest.dependencies, ...pkg.manifest.peerDependencies })) {
    if (manifests.has(dependency)) runtimePackages.add(dependency)
  }
}
const runtimeModules = new Map<string, string>()
for (const name of runtimePackages) {
  const pkg = manifests.get(name)
  if (!pkg) continue
  for (const [key, value] of Object.entries(pkg.manifest.exports ?? {})) {
    if (key.includes('*') || key === './client' || key.startsWith('./client/')) continue
    const target = typeof value === 'string' ? value : value.bun ?? value.import ?? value.default ?? value.require
    if (!target || !/\.(?:[cm]?js|tsx?)$/u.test(target) || target.endsWith('.d.ts')) continue
    let path = join(root, pkg.directory, target)
    if (!existsSync(path) && target.startsWith('./lib/')) {
      path = join(root, pkg.directory, target.replace(/^\.\/lib\/(?:types\/)?/u, './src/').replace(/\.[cm]?js$/u, '.ts'))
    }
    if (!existsSync(path)) continue
    const spec = key === '.' ? name : name + key.slice(1)
    runtimeModules.set(spec, relative(dirname(outputFile), path).replace(/\\/g, '/'))
  }
}

console.log(`Discovered ${validPlugins.length} verified builtin plugins. Generating ${outputFile}...`)

const lines = [
  '// Auto-generated builtin plugin registry for standalone Bun builds',
  'export const BUILTIN_PLUGINS: Record<string, () => Promise<unknown>> = {',
  ...validPlugins.map(name => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(name)}),`),
  '};\n',
  '/* oxlint-disable typescript/no-require-imports -- Bun object loaders need synchronous exports for require() consumers. */',
  'export const BUILTIN_MODULES: Record<string, () => Record<string, unknown>> = {',
  ...[...runtimeModules].sort(([a], [b]) => a.localeCompare(b)).map(([name, path]) => `  ${JSON.stringify(name)}: () => require(${JSON.stringify(path)}),`),
  '};\n',
  '/* oxlint-enable typescript/no-require-imports */\n',
]

writeFileSync(outputFile, lines.join('\n'), 'utf8')
console.log(`[✓] Generated ${outputFile} with ${validPlugins.length} verified plugins and ${runtimeModules.size} runtime module exports.`)
