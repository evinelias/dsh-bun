import { symlinkSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const patterns = [
  'vendor/*/package.json',
  'packages/*/*/package.json',
  'apps/*/package.json',
  'native/system/packages/*/package.json',
]

mkdirSync(resolve('node_modules/@deepseek-ai'), { recursive: true })

let linked = 0
for (const pattern of patterns) {
  for (const f of new Bun.Glob(pattern).scanSync('.')) {
    try {
      const manifest = JSON.parse(readFileSync(f, 'utf8'))
      const name = manifest.name
      if (!name || !name.startsWith('@deepseek-ai/')) continue
      const targetDir = resolve(dirname(f))
      const linkPath = resolve('node_modules', name)
      if (!existsSync(linkPath)) {
        symlinkSync(targetDir, linkPath, 'junction')
        linked++
      }
    } catch (e) {
      // ignore
    }
  }
}

console.log(`Linked ${linked} workspace packages into node_modules/@deepseek-ai!`)
