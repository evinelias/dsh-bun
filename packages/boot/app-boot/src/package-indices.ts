/**
 * Universal package root index generator for Bun standalone binaries.
 *
 * Bun standalone binaries (compiled via `bun build --compile`) cannot resolve
 * bare imports from external files when a package only specifies "main": "lib/..."
 * or subpath "exports" without an index.js/index.mjs directly at the package root.
 *
 * This utility ensures every package in a node_modules directory (including @scope/)
 * has a root index.js and index.mjs that re-exports its target entry.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Scan a node_modules directory and create root index.js / index.mjs proxies
 * for any package that only exposes subpath entries.
 *
 * @param nodeModulesDir Absolute path to a node_modules folder.
 */
export function ensurePackageRootIndices(nodeModulesDir: string): void {
  if (!existsSync(nodeModulesDir)) return
  try {
    const entries = readdirSync(nodeModulesDir)
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue
      const fullPath = join(nodeModulesDir, entry)
      try {
        if (!statSync(fullPath).isDirectory()) continue
      } catch {
        continue
      }
      if (entry.startsWith('@')) {
        // Scoped package directory, e.g. @deepseek-ai
        try {
          const subEntries = readdirSync(fullPath)
          for (const sub of subEntries) {
            fixPackageRoot(join(fullPath, sub))
          }
        } catch {}
      } else {
        fixPackageRoot(fullPath)
      }
    }
  } catch {}
}

function fixPackageRoot(pkgDir: string): void {
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
      exports?: unknown
      bun?: string
      module?: string
      main?: string
    }
    const hasIndexJs = existsSync(join(pkgDir, 'index.js'))
    const hasIndexMjs = existsSync(join(pkgDir, 'index.mjs'))
    if (hasIndexJs && hasIndexMjs) return

    // Find the primary entry file
    let targetRel: string | undefined
    if (typeof pkg.exports === 'object' && pkg.exports !== null) {
      const exp = pkg.exports as Record<string, unknown>
      const dot = exp['.']
      if (typeof dot === 'object' && dot !== null) {
        const dotRec = dot as Record<string, unknown>
        targetRel = (typeof dotRec.bun === 'string' && dotRec.bun)
          || (typeof dotRec.import === 'string' && dotRec.import)
          || (typeof dotRec.default === 'string' && dotRec.default)
          || (typeof dotRec.require === 'string' && dotRec.require)
          || undefined
      } else if (typeof dot === 'string') {
        targetRel = dot
      }
    }

    targetRel ??= (typeof pkg.bun === 'string' && pkg.bun)
      || (typeof pkg.module === 'string' && pkg.module)
      || (typeof pkg.main === 'string' && pkg.main)
      || (existsSync(join(pkgDir, 'lib', 'index.mjs')) ? 'lib/index.mjs' : undefined)
      || (existsSync(join(pkgDir, 'lib', 'index.js')) ? 'lib/index.js' : undefined)

    if (!targetRel || typeof targetRel !== 'string') return
    let normalizedTarget = targetRel.replace(/^[./\\]+/, '').replace(/\\/g, '/')
    if (normalizedTarget === 'index.js' || normalizedTarget === 'index.mjs') return
    if (!existsSync(join(pkgDir, normalizedTarget))) {
      // In Bun standalone, if a package was installed directly from source/git without prebuilt lib/,
      // fall back to src/*.ts since Bun executes TypeScript natively.
      if (normalizedTarget.startsWith('lib/')) {
        const srcFallback = normalizedTarget.replace(/^lib\//, 'src/').replace(/\.[cm]?js$/, '.ts')
        if (existsSync(join(pkgDir, srcFallback))) {
          normalizedTarget = srcFallback
        } else {
          return
        }
      } else {
        return
      }
    }

    const proxyContent = `const _mod = await import("./${normalizedTarget}");\nexport default _mod.default ?? _mod;\nexport * from "./${normalizedTarget}";\n`
    if (!hasIndexJs) {
      writeFileSync(join(pkgDir, 'index.js'), proxyContent, 'utf8')
    }
    if (!hasIndexMjs) {
      writeFileSync(join(pkgDir, 'index.mjs'), proxyContent, 'utf8')
    }
  } catch {}
}
