# AGENTS.md — Official DeepSeek Harness Fork (Bun + Elysia + Tauri v2)

## Mission
We are converting a direct clone/fork of `https://github.com/deepseek-ai/deepseek-harness.git` to run 100% natively on **Bun + Elysia + Tauri v2**, completely eliminating Node.js, pnpm, and Electron.

## Strict Engineering Rules
1. **DO NOT invent a fake agent harness from scratch.** Work directly inside the cloned `deepseek-harness` repository structure and its real packages.
2. **Keep the Upstream Cordis Kernel & Official Web UI Intact:**
   - Do not break the upstream `cordis` context (`ctx`) or plugin interfaces—all existing `dsh` packages and the official Web UI must continue to work seamlessly.
3. **Eliminate Node.js & pnpm:**
   - Convert workspace management from `pnpm-workspace.yaml` to Bun workspaces (`package.json` `"workspaces"`).
   - Fix any malformed upstream `package.json` files (such as duplicate keys in `packages/host/apiproxy/package.json` or `python/sdk-runtime/package.json`) so `bun install` succeeds cleanly.
   - Replace Node-only APIs (`node:module.stripTypeScriptTypes` in `code-runtime-worker-thread`, Node ESM loader hooks in `profile-boot`) with Bun-native equivalents (`new Bun.Transpiler({ loader: "ts" })`).
4. **Replace Node HTTP Host with Elysia:**
   - Replace the Node HTTP/WebSocket host server with **Elysia** running on Bun (`Bun.serve` / Elysia routes & WebSockets), wiring it directly into the existing Cordis `ctx` service registration so upstream plugins and the official Web UI work without knowing the underlying server changed.
5. **Remove Electron & Replace with Tauri v2 Sidecar:**
   - Strip out any Electron packaging/dependencies.
   - Compile the Bun + Elysia CLI/host entrypoint into a standalone executable via `bun build --compile`.
   - Wrap the official Web UI and the compiled Bun binary inside a lightweight Tauri v2 shell (`src-tauri`) using `bundle.externalBin`.
6. **Strict Prohibition on `--minify` for Binary Builds:**
   - NEVER add `--minify` to `bun build --compile` in `package.json`, `scripts/build-sidecar.ts`, or CI release workflows.
   - *Reason:* Upstream Cordis and the Typert RPC Gateway use runtime parameter reflection (`Function.prototype.toString()`) to extract method argument names (e.g. across `SettingsController`, `AccountController`, `TerminalController`). Minifying mangles argument names into single characters (`e`, `t`), breaking RPC parameter binding and causing the UI to hang indefinitely on "Loading settings...".

## Upstream Repository Layout & Architecture

DeepSeek Harness is an all-plugin Cordis agent harness. Read [docs/architecture.md](docs/architecture.md) before changing `packages/`; follow [docs/AGENTS.md](docs/AGENTS.md) for documentation.

```
vendor/      Vendored Cordis (vendor/README.md)
packages/    @deepseek-ai/dsh-<pkg> workspaces at packages/<group>/<pkg>/
  core/                 agent/session API
  api/                  remote BFF
  typert/               type graphs
  llm/                  model providers
  shell/                command execution
  subprocess/           child-process management
  ssh/                  SSH execution providers
  terminal/             persistent terminals
  ptc-runtime/          PTC execution
  sandbox/              process confinement
  deliverables/         turn deliverables
  fs/                   filesystem access
  lsp/                  language servers
  skill/                skill loading
  web/                  search/fetch tools
  computer-use/         computer interaction
  browser-use/          browser interaction
  compaction/           context compaction
  context/              request context
  subagent/             delegation
  attachment/           attachment handling
  interaction/          user approval/questions
  diff/                 patch application
  storage/              persistence adapters
  telemetry/            traces and metrics
  security/             authorization
  test-support/         shared test utilities
  preset/               bundled presets
  bundle/               bundle layer definitions
  boot/                 launcher and runtime services
  host/                 platform host services
  client/               official Web UI packages
```
