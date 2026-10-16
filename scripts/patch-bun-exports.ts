import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

let patched = 0
for (const pattern of ['vendor/*/package.json', 'packages/*/*/package.json']) {
  for (const f of new Bun.Glob(pattern).scanSync('.')) {
    const dir = dirname(f)
    if (existsSync(join(dir, 'src/index.ts'))) {
      const raw = readFileSync(f, 'utf8')
      try {
        const pkg = JSON.parse(raw)
        if (pkg.exports && pkg.exports['.']) {
          const dot = pkg.exports['.']
          if (typeof dot === 'object' && !dot.bun) {
            pkg.exports['.'] = {
              bun: './src/index.ts',
              ...dot,
            }
            writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n')
            patched++
          }
        }
      } catch (e) {}
    }
  }
}

console.log(`Added bun export condition to ${patched} packages!`)
