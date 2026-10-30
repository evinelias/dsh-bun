import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensurePackageRootIndices } from '../packages/boot/app-boot/src/package-indices.ts'

test.skipIf(process.platform === 'win32')('compiled plugins resolve explicit and wildcard dependency exports without replacing files', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-compiled-exports-'))
  try {
    const modules = join(root, 'node_modules')
    const pkg = join(modules, 'exported')
    for (const dir of ['src/lib', 'dist/esm/client']) mkdirSync(join(pkg, dir), { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ type: 'module', exports: {
      './lib': { default: './src/lib/index.js' },
      './lib/auth': './src/lib/auth.js',
      './*': { node: { import: './dist/esm/*' } },
    } }))
    for (const file of ['src/lib/index.js', 'src/lib/auth.js', 'dist/esm/client/value.js']) {
      writeFileSync(join(pkg, file), 'export const value = 7\n')
    }
    for (const file of ['index.js', 'index.mjs']) writeFileSync(join(pkg, file), '// existing entry\n')
    const common = join(modules, 'common')
    mkdirSync(join(common, 'dist'), { recursive: true })
    writeFileSync(join(common, 'package.json'), JSON.stringify({ main: './dist/value.js' }))
    writeFileSync(join(common, 'dist/value.js'), 'module.exports = 7\n')
    writeFileSync(join(common, 'index.js'), 'const _mod = await import("./dist/value.js");\nexport default _mod.default ?? _mod;\nexport * from "./dist/value.js";\n')
    const conditional = join(modules, 'conditional')
    mkdirSync(join(conditional, 'dist'), { recursive: true })
    writeFileSync(join(conditional, 'package.json'), JSON.stringify({ type: 'module', exports: { '.': { node: { import: './dist/index.js' } } } }))
    writeFileSync(join(conditional, 'dist/index.js'), 'export const value = 7\n')
    const plugin = join(root, 'plugin.mjs')
    writeFileSync(plugin, 'import {createRequire} from \'node:module\'; import {value as a} from \'exported/lib\'; import {value as b} from \'exported/lib/auth\'; import {value as c} from \'exported/client/value.js\'; import {value as d} from \'conditional\'; const e=createRequire(import.meta.url)(\'common\'); if(a+b+c+d+e!==35) throw Error(\'wrong exports\')')
    const source = join(root, 'runner.ts')
    const executable = join(root, 'exports-check')
    writeFileSync(source, 'await import(process.argv[2])\n')
    const build = spawnSync('bun', ['build', source, '--compile', '--outfile', executable], { encoding: 'utf8' })
    expect(build.status, build.stderr).toBe(0)
    ensurePackageRootIndices(modules)
    ensurePackageRootIndices(modules)
    const run = spawnSync(executable, [plugin], { cwd: root, encoding: 'utf8', timeout: 10000 })
    expect(run.status, run.stderr).toBe(0)
    expect(readFileSync(join(pkg, 'index.js'), 'utf8')).toBe('// existing entry\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 30000)
