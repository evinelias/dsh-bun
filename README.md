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
| **JavaScript Runtime** | Node.js (v20+) | **Bun** (v1.3+) | Instant startup, native TS/JSX execution, zero transpilation build step needed during development. |
| **Package Manager** | `pnpm` (pnpm-workspace) | **Bun Workspaces** | Clean, fast monorepo workspace management with a unified lockfile and instant package resolution. |
| **Web & WS Server** | Node `node:http` + WS | **Elysia on Bun** | High-throughput HTTP & WebSockets mapped seamlessly to Cordis `ctx.webServer` with socket upgrade bridge. |
| **CLI & Runtime Distribution** | Multi-file Node script + external `node_modules` | **Single Standalone Binary (`dsh-bun`)** | 2,882 modules and 231 core plugins compiled into a single executable via `bun build --compile`. |
| **Plugin Package Operations** | Requires global `pnpm` installed on host | **Self-Hosted Bun Runtime (`BUN_BE_BUN=1`)** | `dsh-bun` acts as its own package manager without needing Node.js or Bun installed on the host. |
| **Desktop Application** | Electron (`~230MB+` runtime footprint) | **Tauri v2** (`~3.9MB` native shell) | Ultra-lightweight memory footprint, instant startup, zero white-screen flash, OS-native webview. |

---

## ⚡ Measured Benchmarks

The following benchmarks were measured on a local Windows x64 workstation running `dsh-bun` and `dsh-desktop`:

| Metric | Upstream (Node.js / Electron) | DSH Bun Edition (Measured) | Notes / Improvement |
| :--- | :--- | :--- | :--- |
| **Cold CLI Startup (`--help`)** | ~250–400 ms (Node cold start) | **449.3 ms** | Native Bun executable execution, instant CLI parsing |
| **Headless Boot to HTTP 200** | ~1,200–2,000 ms | **1,770.4 ms** | Full Cordis kernel + Elysia HTTP server + auth handshake |
| **Idle Memory Footprint (RSS)** | ~180–320 MB (Node process) | **412.9 MB** | Includes Cordis kernel, virtual registry, and Web server |
| **Desktop Shell Executable** | ~230 MB+ (Electron runtime) | **3.91 MB** (`dsh-desktop.exe`) | **~60x smaller** native Tauri v2 shell (4,102,656 bytes) |
| **Self-Contained CLI Executable** | N/A (Requires host Node.js) | **126.05 MB** (`dist/dsh-bun.exe`) | Single self-contained binary (132,177,408 bytes) |

> **Reproduction Command:**
> ```bash
> bun scripts/benchmark.ts
> # Or using npm/bun script:
> bun run benchmark
> ```

---

## 🌟 Zero External Node, pnpm, or Bun at Runtime

For end-users running pre-built distributions of **DeepSeek Harness (Bun Edition)**, **zero runtime dependencies** are required on the host operating system:
- **No Node.js**
- **No pnpm**
- **No Bun**

The standalone executable embeds the complete Bun JavaScript runtime, Cordis kernel, and built-in plugins into a single binary.

### Build Target Distinction

- **`bun run build:binary` (Standalone CLI)**:
  Compiles the headless CLI executable (`dist/dsh-bun` or `dist/dsh-bun.exe`) containing the Cordis kernel, CLI entrypoint, and headless server. Ideal for servers, automation pipelines, CI/CD runners, and terminal agents.
- **`bun run build:sidecar` (`scripts/build-sidecar.ts`)**:
  Builds the production Web UI (`apps/web/dist`), all 78+ client plugin bundles (`web-dist`), and compiles the host-targeted sidecar executable into `apps/desktop/src-tauri/binaries/` named with the platform's target-triple (e.g., `dsh-bun-x86_64-pc-windows-msvc.exe`) for packaging inside Tauri v2 desktop installers.

---

## 🔌 Elysia & Bun Webserver Architecture

Upstream DeepSeek Harness relies on Cordis's service registration (`ctx.webServer`) to expose HTTP endpoints, static frontend assets, and WebSocket channels for agent streaming, terminal multiplexing, and HMR.

In `packages/host/webserver`, we pair an **Elysia** app router (`this.elysia.handle(req)`) with Bun's native HTTP/TLS server engine (`Bun.serve`).

To prevent breaking upstream plugins that expect a traditional Node `http.Server` instance, the server maintains the standard socket upgrade lifecycle contract (`server.emit('upgrade', req, socket, head)`). As a result, all existing upstream WebSocket plugins (such as `dsh-api-gateway`, remote access, live terminal sessions, and HMR) continue to function seamlessly without knowing the underlying server changed.

---

## 🔒 Security & Trust Notice

`dsh-bun` inherits upstream DeepSeek Harness's permission and execution model:
- **Host Privileges:** Agent tools, CLI commands, scripts, and plugins execute with the user privileges of the host operating system account running `dsh-bun`, unless an explicit sandbox runner (such as Docker, Podman, or remote runner) is configured.
- **Plugin Safety:** Plugins can execute code and access network resources. Only install plugins and execute agent workflows from sources you trust.
- **Credential Storage:** API keys and provider tokens are stored locally in the user profile directory (`~/.dsh` / `%USERPROFILE%\.dsh`) with standard file access permissions.

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
git clone https://github.com/evinelias/dsh-bun.git
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

### 3. Verify Boot & Kernels

```bash
# Run kernel, Elysia webserver, and authentication verification
bun run test:boot
```

### 4. Compile Standalone CLI Binary

Compile the entire harness (all 2,882 modules + 231 builtin plugins + embedded manifests) into a standalone executable:

```bash
# Builds apps/web and compiles dist/dsh-bun (or dist/dsh-bun.exe)
bun run build:binary
```

Test the compiled standalone binary anywhere (no Node.js or Bun required on the host!):

```bash
./dist/dsh-bun web
```

### 5. Build & Run Native Tauri v2 Desktop App

```bash
# 1. Build the Web UI and sidecar binary tagged with host target-triple
bun run build:sidecar

# 2. Run desktop app in development
cd apps/desktop/src-tauri
cargo run

# 3. Build optimized production desktop executable (~3.9MB release shell)
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
- `scripts/benchmark.ts`: Reproducible benchmark suite measuring startup, memory, and binary sizes.
- `scripts/test-boot.ts`: Automated integration test verifying Cordis kernel, Elysia routes, and session authentication.
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
bun run build:sidecar
```

---

## ⚖️ License & Attribution

This project is licensed under the [MIT License](LICENSE).

- Original DeepSeek Harness codebase Copyright (c) 2026 DeepSeek AI.
- Native Bun + Elysia + Tauri v2 distribution maintained by EVIN and contributors.
