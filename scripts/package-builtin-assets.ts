import { cpSync, globSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { ensurePackageRootIndices } from '../packages/boot/app-boot/src/package-indices.ts'

const root = resolve(import.meta.dir, '..')
for (const file of globSync(['packages/*/*/package.json', 'vendor/*/package.json', 'native/system/packages/entry/package.json'], { cwd: root })) {
  const manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
  if (!manifest.name.startsWith('@deepseek-ai/')) continue
  const source = join(root, dirname(file))
  for (const output of process.argv.slice(2)) {
    const destination = resolve(output, 'node_modules', manifest.name)
    mkdirSync(destination, { recursive: true })
    cpSync(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      filter: path => !relative(source, path).split('/').some(part => ['node_modules', 'tests', 'test', '.git'].includes(part)) && !path.endsWith('.tsbuildinfo'),
    })
  }
}
for (const output of process.argv.slice(2)) ensurePackageRootIndices(resolve(output, 'node_modules'))
