# DeepSeek Harness (Bun + Elysia + Tauri v2 Edition)

> ⚡ **A high-performance, native distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`deepseek-ai/deepseek-harness`) running 100% natively on Bun, Elysia, and Tauri v2.**  
> Completely eliminates Node.js, pnpm, and Electron while preserving the upstream **Cordis** kernel, official Web UI, and 100% of the plugin ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-v1.3.5-black?logo=bun)](https://bun.sh)
[![Elysia](https://img.shields.io/badge/Elysia-v1.4-blueviolet)](https://elysiajs.com)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri)](https://v2.tauri.app)

---

## 🚀 Architectural Upgrades

| Upstream Component | Upstream Architecture | DSH Bun Edition | Advantages |
| :--- | :--- | :--- | :--- |
| **JavaScript Runtime** | Node.js (v20+) | **Bun** (v1.3+) | 3–5x faster startup, native TS/JSX execution, zero build step needed for development. |
| **Package Manager** | `pnpm` (pnpm-workspace) | **Bun Workspaces** | Clean, fast monorepo workspace management with unified lockfile. |
| **Web & WS Server** | Node `node:http` + WS | **Elysia on Bun** | High-throughput HTTP & WebSockets mapped seamlessly to Cordis `ctx.webServer`. |
| **CLI & Runtime Distribution** | Multi-file Node script + external `node_modules` | **Single Standalone Binary (`dsh-bun`)** | 2,882 modules and 231 core plugins compiled into a single executable via `bun build --compile`. |
| **Plugin Package Operations** | Requires global `pnpm` installed on host | **Self-Hosted Bun Runtime (`BUN_BE_BUN=1`)** | `dsh-bun` acts as its own package manager without needing Node.js or Bun installed on the host. |
| **Desktop Application** | Electron (`~230MB+` runtime footprint) | **Tauri v2** (`~6MB` native shell) | Ultra-lightweight memory footprint, instant startup, zero white-screen flash, OS-native webview. |

---

## 🌟 Upstream Fidelity & Compatibility

1. **Unbroken Cordis Kernel:** All Cordis services, context scopes (`ctx`), event buses, and plugin life-cycle hooks operate exactly as upstream designed.
2. **100% Official Web UI:** The production frontend (`apps/web`) is bundled directly alongside the binary, supporting hot-reload in dev and seamless embedded serving in production.
3. **Plugin Ecosystem Ready:** Official and community `dsh-plugin` packages install and run without code modifications.

---

## 📦 Quickstart

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- (Optional for Desktop Shell build) [Rust](https://rustup.rs) (v1.75+) and Tauri v2 prerequisites

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/evin/dsh-bun.git
cd dsh-bun

# Install dependencies with Bun
bun install
```

### 2. Run in Development Mode

```bash
# Run the CLI / Web server in development mode
bun apps/cli/src/bin.ts web

# Or run with full Web UI frontend dev server
bun run dev:web
```

### 3. Compile Standalone CLI Binary

Compile the entire harness (all 2,882 modules + 231 builtin plugins + embedded manifests) into a standalone executable:

```bash
# Builds apps/web and compiles dist/dsh-bun (or dist/dsh-bun.exe)
bun run build:binary
```

Test the compiled standalone binary anywhere (no Node.js or Bun required on the host!):

```bash
./dist/dsh-bun web
```

### 4. Build & Run Native Tauri v2 Desktop App

```bash
# 1. Build the Web UI and sidecar binary tagged with host target-triple
bun run scripts/build-sidecar.ts

# 2. Run desktop app in development
cd apps/desktop/src-tauri
cargo run

# 3. Build optimized production desktop executable (~6MB release shell)
cargo build --release
```

---

## 🛠️ Repository & Architecture Map

- `apps/cli/`: Standalone entrypoint (`src/bin.ts`), built-in plugin registry generator, and CLI command processors.
- `apps/desktop/`: Lightweight Tauri v2 application orchestrating the headless `dsh-bun` sidecar.
- `apps/web/`: Official Vue 3 + Tailwind Web UI frontend.
- `packages/host/webserver/`: Elysia HTTP and WebSocket host implementing Cordis `ctx.webServer`.
- `packages/boot/plugin-manager/`: Package operations, compatibility exemptions, and self-hosted `BUN_BE_BUN` execution.
- `vendor/loader/`: Core Cordis plugin loader patched for in-memory virtual built-in plugin resolution.
- `scripts/sync-upstream.ts`: One-command utility to sync, merge, and regenerate builtins from official `deepseek-ai/deepseek-harness`.

---

## 🔄 Synchronizing with Upstream

To pull future releases and patches from the official `deepseek-ai/deepseek-harness` repository:

```bash
# Fetch latest upstream commits and regenerate plugin registry
bun run scripts/sync-upstream.ts

# Merge upstream changes
git merge upstream/main

# Rebuild sidecar
bun run scripts/build-sidecar.ts
```

---

## ⚖️ License & Attribution

This project is licensed under the [MIT License](LICENSE).

- Original DeepSeek Harness codebase Copyright (c) 2026 DeepSeek AI.
- Native Bun + Elysia + Tauri v2 distribution maintained by EVIN and contributors.
