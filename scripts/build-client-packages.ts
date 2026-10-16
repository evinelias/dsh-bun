import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'

function walk(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'target') {
        results.push(...walk(full))
      }
    } else if (entry.name === 'package.json') {
      results.push(full)
    }
  }
  return results
}

async function runTsdown(pkgDir: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('bun', ['x', 'tsdown'], {
      cwd: pkgDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    let stderr = ''
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: stderr.trim() || `Exit code ${code}` })
      }
    })
    proc.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

async function main() {
  const root = process.cwd()
  const pkgs = walk(join(root, 'packages'))
  const clientDirs: { name: string; dir: string }[] = []

  for (const p of pkgs) {
    try {
      const json = JSON.parse(readFileSync(p, 'utf8'))
      if (json.dsh && json.dsh.client) {
        const dir = dirname(p)
        if (existsSync(join(dir, 'tsdown.config.ts'))) {
          clientDirs.push({ name: json.name, dir })
        }
      }
    } catch {}
  }

  console.log(`[+] Found ${clientDirs.length} client packages to build.`)
  const concurrency = 6
  let completed = 0
  let failed = 0
  const total = clientDirs.length

  const pool = Array.from({ length: concurrency }).map(async () => {
    while (clientDirs.length > 0) {
      const item = clientDirs.shift()
      if (!item) break
      const start = Date.now()
      const res = await runTsdown(item.dir)
      const elapsed = Date.now() - start
      completed++
      if (res.success) {
        console.log(`[${completed}/${total}] Built ${item.name} (${elapsed}ms)`)
      } else {
        failed++
        console.error(`[${completed}/${total}] FAILED ${item.name}: ${res.error}`)
      }
    }
  })

  await Promise.all(pool)
  console.log(`\n=== Client build finished: ${completed - failed} succeeded, ${failed} failed. ===`)
  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
