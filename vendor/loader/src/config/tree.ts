import { composeError, Context } from '@deepseek-ai/cordis'
import { isNonNullable, type Dict } from '@deepseek-ai/cosmokit'
import { Entry, type EntryOptions } from './entry.ts'
import { EntryGroup } from './group.ts'

/** Mutable tree of loader entries. Persistence is supplied by subclasses. */
export abstract class EntryTree {
  static readonly sep = ':'

  public ctx: Context
  public enableLogs?: boolean
  public root: EntryGroup
  public store: Dict<Entry> = Object.create(null)

  constructor(ctx: Context) {
    this.ctx = ctx.extend({ baseUrl: ctx.baseUrl })
    this.root = new EntryGroup(this.ctx, this)
    const entry = this.ctx.fiber.entry
    if (entry) entry.subtree = this
  }

  get context(): Context {
    return this.ctx
  }

  /** Iterate entries in this tree and any nested subtrees. */
  * entries(): Generator<Entry, void, void> {
    for (const entry of Object.values(this.store)) {
      yield entry
      if (!entry.subtree) continue
      yield* entry.subtree.entries()
    }
  }

  /** Return pending import and lifecycle tasks owned by this tree. */
  getTasks() {
    return [...this.entries()]
      .map(entry => entry._initTask || entry.fiber?.inertia)
      .filter(isNonNullable)
  }

  /** Wait until this tree has no pending import or lifecycle tasks. */
  async await() {
    while (true) {
      const tasks = this.getTasks()
      if (!tasks.length) return
      await Promise.allSettled(tasks)
    }
  }

  ensureId(options: Partial<EntryOptions>) {
    if (!options.id) {
      do {
        options.id = Math.random().toString(16).slice(2, 10)
      } while (this.store[options.id])
    }
    return options.id!
  }

  /** Resolve an entry by id, including nested ids separated by `EntryTree.sep`. */
  resolve(id: string) {
    const parts = id.split(EntryTree.sep)
    let tree: EntryTree | undefined = this
    const final = parts.pop()!
    for (const part of parts) {
      tree = tree.store[part]?.subtree
      if (!tree) throw new Error(`cannot resolve entry ${id}`)
    }
    const entry = tree.store[final]
    if (!entry) throw new Error(`cannot resolve entry ${id}`)
    return entry
  }

  resolveGroup(id: string | null) {
    if (!id) return this.root
    const entry = this.resolve(id)
    if (!entry.subgroup) throw new Error(`entry ${id} is not a group`)
    return entry.subgroup
  }

  /** Create an entry in the root group or a nested group. */
  async create(options: Omit<EntryOptions, 'id'>, parent: string | null = null, position = Infinity) {
    const group = this.resolveGroup(parent)
    group.data.splice(position, 0, options as EntryOptions)
    group.tree.write()
    return group.create(options)
  }

  /** Stop and remove an entry from its parent group. */
  remove(id: string) {
    const entry = this.resolve(id)
    entry.parent.remove(id)
    entry.parent.tree.write()
  }

  /** Update an entry and optionally move it to another group. */
  async update(id: string, options: Omit<EntryOptions, 'id' | 'name'>, parent?: string | null, position?: number) {
    const entry = this.resolve(id)
    const source = entry.parent
    if (parent !== undefined) {
      const target = this.resolveGroup(parent)
      source.unlink(entry.options)
      target.data.splice(position ?? Infinity, 0, entry.options)
      target.tree.write()
      entry.parent = target
    }
    source.tree.write()
    return entry.update(options, false, true)
  }

  /** Import a plugin module from a specifier or `cordis:` builtin. */
  import(name: string, getOuterStack?: () => string[]) {
    if (name.startsWith('cordis:')) {
      return this.ctx.loader.builtins[name.slice(7)]
    }
    const builtin = this.ctx.loader.builtins[name]
    if (builtin !== undefined) {
      return typeof builtin === 'function' && !builtin.prototype ? builtin() : builtin
    }
    return composeError(async (info) => {
      // ModuleJob.run
      // onImport.tracePromise.__proto__
      // internal.import
      info.offset += 3
      if (this.ctx.loader.internal) {
        return await this.ctx.loader.internal.import(name, this.ctx.baseUrl!, {})
      } else if (name.startsWith('.')) {
        return await import(/* @vite-ignore */new URL(name, this.ctx.baseUrl).href)
      } else {
        try {
          return await import(/* @vite-ignore */name)
        } catch (origErr) {
          try {
            if (typeof window !== 'undefined' || typeof process === 'undefined' || typeof process.cwd !== 'function') {
              throw origErr
            }
            const fs = await import(/* @vite-ignore */'node:fs')
            const path = await import(/* @vite-ignore */'node:path')
            const url = await import(/* @vite-ignore */'node:url')
            const os = await import(/* @vite-ignore */'node:os')
            const cwd = process.cwd()
            const execDir = path.dirname(process.execPath)
            const candidateRoots = new Set<string>()

            // 1. DSH Home & Profile directories ($DSH_HOME, ~/.dsh, ~/.dsh/profiles/*)
            const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
            candidateRoots.add(dshHome)
            const profilesDir = path.join(dshHome, 'profiles')
            if (fs.existsSync(profilesDir)) {
              try {
                const profiles = fs.readdirSync(profilesDir)
                for (const prof of profiles) {
                  candidateRoots.add(path.join(profilesDir, prof))
                }
              } catch {}
            }

            if (this.ctx.baseUrl) {
              try {
                const baseDir = this.ctx.baseUrl.startsWith('file:') ? url.fileURLToPath(this.ctx.baseUrl) : this.ctx.baseUrl
                let d = fs.statSync(baseDir).isDirectory() ? baseDir : path.dirname(baseDir)
                for (let i = 0; i < 7; i++) {
                  candidateRoots.add(d)
                  const p = path.dirname(d)
                  if (p === d) break
                  d = p
                }
              } catch {}
            }
            let d = cwd
            for (let i = 0; i < 7; i++) {
              candidateRoots.add(d)
              const p = path.dirname(d)
              if (p === d) break
              d = p
            }
            d = execDir
            for (let i = 0; i < 7; i++) {
              candidateRoots.add(d)
              const p = path.dirname(d)
              if (p === d) break
              d = p
            }
            for (const root of candidateRoots) {
              const candidate = path.join(root, 'node_modules', name)
              if (fs.existsSync(candidate)) {
                const nodeModulesDir = path.join(root, 'node_modules')
                const pkgJsonPath = path.join(candidate, 'package.json')
                if (fs.existsSync(pkgJsonPath)) {
                  try {
                    const fixPkg = (dir: string) => {
                      const pj = path.join(dir, 'package.json')
                      if (!fs.existsSync(pj)) return
                      try {
                        const p = JSON.parse(fs.readFileSync(pj, 'utf8'))
                        const hasJs = fs.existsSync(path.join(dir, 'index.js'))
                        const hasMjs = fs.existsSync(path.join(dir, 'index.mjs'))
                        if (hasJs && hasMjs) return
                        const rel = (typeof p.exports === 'object' && p.exports?.['.']?.bun)
                          || (typeof p.exports === 'object' && p.exports?.['.']?.import)
                          || (typeof p.exports === 'object' && p.exports?.['.']?.default)
                          || (typeof p.exports?.['.'] === 'string' && p.exports['.'])
                          || p.bun || p.module || p.main
                          || (fs.existsSync(path.join(dir, 'lib', 'index.mjs')) ? 'lib/index.mjs' : undefined)
                          || (fs.existsSync(path.join(dir, 'lib', 'index.js')) ? 'lib/index.js' : undefined)
                        if (!rel || typeof rel !== 'string') return
                        const norm = rel.replace(/^[./\\]+/, '').replace(/\\/g, '/')
                        if (norm === 'index.js' || norm === 'index.mjs' || !fs.existsSync(path.join(dir, norm))) return
                        const code = `const _mod = await import("./${norm}");\nexport default _mod.default ?? _mod;\nexport * from "./${norm}";\n`
                        if (!hasJs) fs.writeFileSync(path.join(dir, 'index.js'), code, 'utf8')
                        if (!hasMjs) fs.writeFileSync(path.join(dir, 'index.mjs'), code, 'utf8')
                      } catch {}
                    }
                    fixPkg(candidate)
                    const scopeDir = path.join(nodeModulesDir, '@deepseek-ai')
                    if (fs.existsSync(scopeDir)) {
                      for (const s of fs.readdirSync(scopeDir)) fixPkg(path.join(scopeDir, s))
                    }
                  } catch {}

                  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
                  const entry = (typeof pkg.exports === 'object' && pkg.exports?.['.']?.bun)
                    || (typeof pkg.exports === 'object' && pkg.exports?.['.']?.import)
                    || (typeof pkg.exports === 'object' && pkg.exports?.['.']?.default)
                    || (typeof pkg.exports?.['.'] === 'string' && pkg.exports['.'])
                    || pkg.bun
                    || (typeof pkg.exports === 'string' && pkg.exports)
                    || pkg.module
                    || pkg.main
                    || './lib/index.js'
                    || './src/index.ts'
                  const target = path.resolve(candidate, entry)
                  if (fs.existsSync(target)) {
                    try {
                      return await import(/* @vite-ignore */url.pathToFileURL(target).href)
                    } catch (importErr) {
                      console.error(`[dsh:loader] Error importing "${name}" from "${target}":`, importErr)
                      throw importErr
                    }
                  }
                }
              }
            }
          } catch (scanErr) {
            console.error(`[dsh:loader] Candidate scan failed for "${name}":`, scanErr)
          }
          throw origErr
        }
      }
    }, getOuterStack)
  }

  /** Persist current tree state. In-memory trees may implement this as a no-op. */
  abstract write(): void
}
