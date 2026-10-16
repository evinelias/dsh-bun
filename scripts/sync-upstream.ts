/**
 * Upstream synchronization script for DeepSeek Harness (Bun + Elysia + Tauri v2 Edition).
 *
 * This script:
 * 1. Configures the upstream remote pointing to https://github.com/deepseek-ai/deepseek-harness.git.
 * 2. Fetches latest branches/tags from upstream.
 * 3. Can merge upstream changes into the current branch.
 * 4. Regenerates the embedded plugin registry (builtin-plugins.generated.ts).
 * 5. Documents all touched files across the Bun + Elysia + Tauri port to make merge conflicts trivial to resolve.
 */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const UPSTREAM_URL = 'https://github.com/deepseek-ai/deepseek-harness.git'

const TOUCHED_PORT_AREAS = [
  {
    component: 'Runtime & Workspace Root',
    files: [
      'package.json (converted to Bun workspaces, script updates)',
      'pnpm-workspace.yaml (kept for reference, handled by Bun)',
      '.gitignore (added Tauri target/binaries, dist/, *.exe)',
    ],
    notes: 'Preserves root workspace hierarchy under Bun.',
  },
  {
    component: 'Elysia HTTP/WS Host Adapter',
    files: [
      'packages/host/webserver/src/index.ts',
      'packages/host/webserver/package.json',
    ],
    notes: 'Replaces Node http.Server with Bun.serve/Elysia while maintaining Cordis ctx.webServer contract.',
  },
  {
    component: 'Embedded Standalone Plugin Registry & Loader',
    files: [
      'apps/cli/src/bin.ts (pre-registers in-memory builtins)',
      'apps/cli/src/builtin-plugins.generated.ts (231 core builtin plugins)',
      'scripts/generate-builtin-registry.ts (code generator)',
      'vendor/loader/src/config/tree.ts (checks builtins before filesystem)',
      'packages/typert/loader/src/index.ts (registers builtin typert schemas)',
    ],
    notes: 'Enables single-binary distribution with zero external node_modules needed.',
  },
  {
    component: 'Self-Hosted Bun Subprocess & Plugin Execution',
    files: [
      'packages/boot/plugin-manager/src/operations.ts (detects compiled binary, BUN_BE_BUN=1)',
      'apps/cli/src/plugin.ts (uses process.execPath with BUN_BE_BUN=1)',
    ],
    notes: 'Allows dsh-bun to act as its own package manager on machines without Bun or Node installed.',
  },
  {
    component: 'Safe Asset Resolution & Browser Fallbacks',
    files: [
      'packages/bundle/web-app/src/index.ts (resolves web-dist relative to executable or repo)',
      'packages/client/modules/src/index.ts (safe package.json fallback)',
      'packages/llm/llm/src/attribution.ts (safe package.json fallback)',
      'packages/session/session-telemetry-otel/src/index.ts (safe package.json fallback)',
    ],
    notes: 'Ensures compiled binaries never crash on missing disk files.',
  },
  {
    component: 'Tauri v2 Native Desktop Shell',
    files: [
      'apps/desktop/src-tauri/ (Tauri v2 application, Cargo.toml, src/main.rs)',
      'scripts/build-sidecar.ts (target-triple sidecar builder)',
    ],
    notes: 'Replaces Electron with a lightweight ~6MB Tauri v2 shell orchestrating dsh-bun sidecar.',
  },
]

function run(cmd: string, cwd: string = process.cwd(), inheritStdio: boolean = true): string {
  console.log(`> ${cmd}`)
  return execSync(cmd, {
    cwd,
    encoding: 'utf8',
    stdio: inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
}

async function main() {
  const root = resolve(import.meta.dir, '..')
  console.log('=== DeepSeek Harness Upstream Sync Utility ===\n')

  // 1. Verify or add upstream remote
  try {
    const remotes = run('git remote -v', root, false)
    if (!remotes.includes('upstream')) {
      console.log(`[+] Adding git remote 'upstream' -> ${UPSTREAM_URL}`)
      run(`git remote add upstream ${UPSTREAM_URL}`, root)
    } else {
      console.log('[✓] Git remote \'upstream\' is configured.')
    }
  } catch (err) {
    console.warn(`[!] Unable to inspect git remotes: ${String(err)}`)
  }

  // 2. Fetch upstream
  console.log('\n[1/3] Fetching latest commits and tags from upstream...')
  try {
    run('git fetch upstream --tags', root)
    console.log('[✓] Successfully fetched upstream.')
  } catch (err) {
    console.error(`[-] Failed to fetch upstream: ${String(err)}`)
  }

  // 3. Regenerate builtin plugin registry
  console.log('\n[2/3] Regenerating builtin plugin registry...')
  try {
    run('bun scripts/generate-builtin-registry.ts', root)
    console.log('[✓] Builtin registry generated successfully.')
  } catch (err) {
    console.error(`[-] Registry generation failed: ${String(err)}`)
  }

  // 4. Print touched architecture summary
  console.log('\n[3/3] Ported Architecture & Touchpoints Reference:')
  for (const section of TOUCHED_PORT_AREAS) {
    console.log(`\n* ${section.component}:`)
    for (const f of section.files) {
      console.log(`    - ${f}`)
    }
    console.log(`    Note: ${section.notes}`)
  }

  console.log('\n======================================================')
  console.log('To merge latest upstream into your active branch:')
  console.log('  git merge upstream/main')
  console.log('Then rebuild sidecar and desktop:')
  console.log('  bun run scripts/build-sidecar.ts')
  console.log('======================================================\n')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
