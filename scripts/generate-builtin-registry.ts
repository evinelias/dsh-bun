/**
 * Regenerates apps/cli/src/builtin-plugins.generated.ts by scanning packages/ and vendor/
 * for all Cordis plugins and Typert modules.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const outputFile = join(root, 'apps', 'cli', 'src', 'builtin-plugins.generated.ts')

function findPackages(dir: string, list: { name: string; exports: string[] }[] = []): { name: string; exports: string[] }[] {
  if (!statSync(dir).isDirectory()) return list
  const entries = readdirSync(dir)
  const pkgPath = join(dir, 'package.json')

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.name && (pkg.name.startsWith('@deepseek-ai/') || pkg.name.startsWith('cordis-plugin-'))) {
      const expList: string[] = ['']
      if (pkg.exports && typeof pkg.exports === 'object') {
        for (const key of Object.keys(pkg.exports)) {
          if (key === '.' || key === './package.json') continue
          const sub = key.replace(/^\.\/?/, '')
          if (sub && !sub.includes('*') && !sub.endsWith('.d.ts')) {
            expList.push(sub)
          }
        }
      }
      list.push({ name: pkg.name, exports: expList })
    }
  } catch {}

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'target' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    try {
      if (statSync(full).isDirectory()) {
        findPackages(full, list)
      }
    } catch {}
  }
  return list
}

console.log('Scanning packages for Cordis plugins and Typert definitions...')
const packages = findPackages(join(root, 'packages'))
findPackages(join(root, 'vendor'), packages)

// Read current generated file to preserve any manual/curated entries if needed
const existingKeys: string[] = []
try {
  const currentContent = readFileSync(outputFile, 'utf8')
  const matches = currentContent.matchAll(/"([^"]+)":/g)
  for (const m of matches) {
    existingKeys.push(m[1])
  }
} catch {}

const allEntries = new Set<string>(existingKeys)

for (const pkg of packages) {
  for (const sub of pkg.exports) {
    const spec = sub ? `${pkg.name}/${sub}` : pkg.name
    allEntries.add(spec)
  }
}

const sortedKeys = Array.from(allEntries).sort()

console.log(`Discovered ${sortedKeys.length} builtin plugin and Typert specs. Generating ${outputFile}...`)

const lines: string[] = [
  '// Auto-generated builtin plugin registry for standalone Bun builds',
  'export const BUILTIN_PLUGINS: Record<string, () => Promise<any>> = {',
]

for (const key of sortedKeys) {
  lines.push(`  "${key}": () => import("${key}"),`)
}

lines.push('};\n')

writeFileSync(outputFile, lines.join('\n'), 'utf8')
console.log(`[✓] Successfully generated ${sortedKeys.length} entries in builtin-plugins.generated.ts`)
