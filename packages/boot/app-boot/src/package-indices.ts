/**
 * Universal package root index generator for Bun standalone binaries.
 *
 * Bun standalone binaries (compiled via `bun build --compile`) cannot resolve
 * bare imports from external files when a package only specifies "main": "lib/..."
 * or subpath "exports" without an index.js/index.mjs directly at the package root.
 *
 * Materialize exported subpaths and root entries while preserving CommonJS require().
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'

function exportTarget(value: unknown, preferRequire = false): string | undefined {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return
  const conditions = value as Record<string, unknown>
  for (const condition of ['bun', ...preferRequire ? ['require'] : [], 'import', 'node', 'default', 'require']) {
    const target = exportTarget(conditions[condition], preferRequire)
    if (target !== undefined) return target
  }
}

function linkExport(pkgDir: string, subpath: string, target: string): void {
  if (!subpath.startsWith('./') || !target.startsWith('./') || subpath.split('/').includes('..') || target.split('/').includes('..')) return
  const source = join(pkgDir, target)
  if (!existsSync(source)) return
  const directory = statSync(source).isDirectory()
  const destination = join(pkgDir, !directory && !extname(subpath) ? `${subpath}.js` : subpath)
  if (source === destination || existsSync(destination)) return
  mkdirSync(dirname(destination), { recursive: true })
  symlinkSync(relative(dirname(destination), source), destination, directory ? 'dir' : 'file')
}

function fixPackageExports(pkgDir: string, exports: Record<string, unknown>): void {
  for (const [subpath, value] of Object.entries(exports)) {
    if (subpath === '.') continue
    const target = exportTarget(value)
    if (target === undefined) continue
    // shortcut: expand trailing-star directory exports; extend if a plugin needs another wildcard pattern.
    if (subpath.endsWith('*') && target.endsWith('*')) {
      const directory = join(pkgDir, target.slice(0, -1))
      if (!existsSync(directory)) continue
      for (const name of readdirSync(directory)) linkExport(pkgDir, subpath.replace('*', name), target.replace('*', name))
    } else if (!subpath.includes('*') && !target.includes('*')) {
      linkExport(pkgDir, subpath, target)
    }
  }
}

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
      type?: string
    }
    if (pkg.exports !== null && typeof pkg.exports === 'object') fixPackageExports(pkgDir, pkg.exports as Record<string, unknown>)
    const hasIndexJs = existsSync(join(pkgDir, 'index.js'))
    const hasIndexMjs = existsSync(join(pkgDir, 'index.mjs'))

    // Find the primary entry file
    let targetRel: string | undefined
    if (typeof pkg.exports === 'object' && pkg.exports !== null) {
      const exp = pkg.exports as Record<string, unknown>
      targetRel = exportTarget(exp['.'] ?? exp, true)
    } else if (typeof pkg.exports === 'string') {
      targetRel = pkg.exports
    }

    targetRel ??= (typeof pkg.bun === 'string' && pkg.bun)
      || (typeof pkg.main === 'string' && pkg.main)
      || (typeof pkg.module === 'string' && pkg.module)
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
    const commonJS = normalizedTarget.endsWith('.cjs') || (pkg.type !== 'module' && !normalizedTarget.endsWith('.mjs'))
    const generatedProxy =
      /^const _mod = await import\("(\.\/[^"\n]+)"\);\nexport default _mod.default \?\? _mod;\nexport \* from "\1";\n$/u
    if (!hasIndexJs || generatedProxy.test(readFileSync(join(pkgDir, 'index.js'), 'utf8'))) {
      writeFileSync(join(pkgDir, 'index.js'), commonJS ? `module.exports = require("./${normalizedTarget}");\n` : proxyContent, 'utf8')
    }
    if (!hasIndexMjs) {
      writeFileSync(join(pkgDir, 'index.mjs'), proxyContent, 'utf8')
    }
  } catch {}
}
