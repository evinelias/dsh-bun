# DeepSeek Harness (Bun + Elysia + Tauri v2 Edition)

> ⚡ **A high-performance, native distribution of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`deepseek-ai/deepseek-harness`) running natively on Bun, Elysia, and Tauri v2.**<br>
> Completely eliminates Node.js, pnpm, and Electron while preserving the upstream **Cordis** kernel, official Web UI, and plugin ecosystem compatibility.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun->=1.3.14-black?logo=bun)](https://bun.sh)
[![Elysia](https://img.shields.io/badge/Elysia-v1.4-blueviolet)](https://elysiajs.com)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri)](https://v2.tauri.app)

---

## 📋 System & Tooling Prerequisites

| Audience | Target | Prerequisite | Notes |
| :--- | :--- | :--- | :--- |
| **End-User (Desktop / Binary)** | Standalone App / CLI | **None** | Zero external Node.js, Bun, or pnpm required |
| **Contributor / Developer** | Source Build & CI | **Bun >= 1.3.14** | Tested on `Bun 1.3.x` / `latest` across Linux, macOS, Windows |
| **Desktop Shell Packager** | Tauri v2 Installer | **Rust >= 1.75** | Optional; only needed to compile the Tauri native shell |

---

## 🛠️ Bun Compatibility Engineering

`dsh-bun` addresses the exact failure modes that prevent standard upstream DSH from executing under Bun:

| Subsystem / Issue | Upstream Failure Mode Under Bun | `dsh-bun` Solution |
| :--- | :--- | :--- |
| **`node:module.stripTypeScriptTypes`** | Node 22 API missing in Bun; crashes worker thread | Replaced in `ptc-runtime-node` with native `new Bun.Transpiler({ loader: 'ts' })` |
| **JSC `[native code]` & Decorators** | JavaScriptCore method signatures break parameter reflection | Patched parameter parsing in `json-wire.ts`, `json-schema.ts`, `packages/api/gateway`, and `vendor/cordis` |
| **Virtual FS & Node HMR Hooks** | Compiled binary virtual path (`B:\~BUN` / `/$bunfs`) causes ENOENT on Node hooks | Guarded in `packages/boot/hmr`, `packages/boot/app-boot`, and `packages/boot/plugin-manager` with anchor verification |
| **Subprocess / PTY Execution** | Direct reliance on `koffi` C++ addon fails in compiled binaries | Migrated to native `bun:ffi` (`kernel32.dll`, `advapi32.dll`) with safe process fallbacks (`process.kill(pid, 0)`) and modern `IFileOpenDialog` |

---

## 🚀 Architectural Upgrades

| Upstream Component | Upstream Architecture | DSH Bun Edition | Advantages |
| :--- | :--- | :--- | :--- |
| **JavaScript Runtime** | Node.js (v20+) | **Bun** (>= 1.3.14) | Instant startup, native TS/JSX execution, zero transpilation build step needed during development. |
| **Package Manager** | `pnpm` (pnpm-workspace) | **Bun Workspaces** | Clean, fast monorepo workspace management with a unified lockfile and instant package resolution. |
| **Web & WS Server** | Node `node:http` + WS | **Elysia on Bun** | High-throughput HTTP & WebSockets mapped seamlessly to Cordis `ctx.webServer` with socket upgrade bridge. |
| **CLI & Runtime Distribution** | Multi-file Node script + external `node_modules` | **Single Standalone Binary (`dsh-bun`)** | 2,882 modules and 231 core plugins compiled into a single executable via `bun build --compile`. |
| **Plugin Package Operations** | Requires global `pnpm` installed on host | **Self-Hosted Bun Runtime (`BUN_BE_BUN=1`)** | `dsh-bun` acts as its own package manager without needing Node.js or Bun installed on the host. |
| **Desktop Application** | Electron (`~230MB+` runtime footprint) | **Tauri v2** (`~3.9MB` native shell) | Ultra-lightweight memory footprint, instant startup, zero white-screen flash, OS-native webview. |

---

## ⚡ Measured Benchmarks & Native Distribution Footprint

The following benchmarks demonstrate the measured runtime performance and distribution advantages of `dsh-bun` and `dsh-desktop`:

| Metric | dsh-bun (Measured) | Distribution & Architecture Advantage |
| :--- | :--- | :--- |
| **Cold CLI Startup (`--help`)** | **~400 ms** | Native compiled executable execution with instant CLI argument parsing |
| **Headless Boot to HTTP 200** | **~1,800–2,100 ms** | Full Cordis kernel + Elysia HTTP routing + auth token handshake |
| **Idle Memory Footprint (RSS)** | **~22–29 MB** | Post-sweep Working Set trimming via `Bun.gc(true)` + Win32 FFI trim hook |
| **HTTP Concurrency Throughput** | **~1,400–1,500 req/sec** | High-throughput Elysia routing on native Bun HTTP engine (500 parallel requests) |
| **Desktop Shell Executable** | **3.91 MB** (`dsh-desktop.exe`) | **~60x smaller** native Tauri v2 shell vs ~230 MB+ Electron runtime |
| **Self-Contained CLI Executable** | **120.36 MB** (`dist/dsh-bun.exe`) | Single self-contained binary embedding all 2,800+ modules and 230+ plugins |
| **Host Runtime Prerequisites** | **Zero host dependencies** | Zero Node.js, pnpm, or Bun required on user machines |

> *Note: Upstream Node/Electron benchmarks vary significantly across environments; dsh-bun metrics measured on Windows x64 (Bun 1.3.5).*
>
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

In `packages/host/webserver`, the server operates on the **Bun runtime with Elysia request routing, intentionally preserving a Node-compatible `http.Server` socket upgrade bridge for 100% compatibility with upstream Cordis plugins and WebSocket gateways**.

The server maintains the standard socket upgrade lifecycle contract (`server.emit('upgrade', req, socket, head)`). As a result, all existing upstream WebSocket plugins (such as `dsh-api-gateway`, remote access, live terminal sessions, and HMR) continue to function seamlessly without knowing the underlying server changed.

---

## 🔒 Security & Trust Notice

`dsh-bun` inherits upstream DeepSeek Harness's permission and execution model:
- **Host Privileges:** Agent tools, CLI commands, scripts, and plugins execute with the user privileges of the host operating system account running `dsh-bun`, unless an explicit sandbox runner (such as Docker, Podman, or remote runner) is configured.
- **Plugin Safety:** Plugins can execute code and access network resources. Only install plugins and execute agent workflows from sources you trust.
- **Credential Storage:** API keys and provider tokens are stored locally in the user profile directory (`~/.dsh` / `%USERPROFILE%\.dsh`) with standard file access permissions.

---

## 🌟 Upstream Fidelity & Compatibility

1. **Unbroken Cordis Kernel:** All Cordis services, context scopes (`ctx`), event buses, and plugin life-cycle hooks operate exactly as upstream designed.
2. **Official Web UI:** The production frontend (`apps/web`) is bundled directly alongside the binary, supporting hot-reload in dev and seamless embedded serving in production.
3. **Plugin Compatibility:** Designed for upstream Cordis plugin compatibility, verified against official core plugins and representative community plugin surfaces (see [`docs/PLUGIN_COMPATIBILITY.md`](./docs/PLUGIN_COMPATIBILITY.md)).

---

## 📦 Quickstart

### Prerequisites

- [Bun](https://bun.sh) (>= 1.3.14)
- (Optional for Desktop Shell build) [Rust](https://rustup.rs) (>= 1.75) and Tauri v2 prerequisites

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
