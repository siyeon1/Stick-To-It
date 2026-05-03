# Sticky Wall — Desktop (Tauri / Windows x64)

This document describes the **Stage A** state of the Tauri v2 packaging
work for Sticky Wall on Windows x64.  The browser build at `/` on Replit
is unchanged.

Storage migration (Stage B), auto-updater (Stage C), and the release
build pipeline (Stage D) are **not yet implemented**.  They will be
added in follow-up tasks once Stage A is verified on a real Windows
machine.

## What Stage A delivers

A native Tauri v2 shell that wraps the existing Sticky Wall web build.
On Windows the app:

- Opens in a 1200×800 native window (min 600×400, resizable, centered,
  title "Sticky Wall").
- Persists window position and size across launches via
  `tauri-plugin-window-state` at
  `%APPDATA%\com.siyeonkang.sticktoit\.window-state.json`.
- Uses notes still in **localStorage** (the WebView2-managed one inside
  the Tauri app) — Stage B is what moves them to a real file.
- Has no native menu.  WebView2 handles standard editing shortcuts
  inside text inputs (Ctrl+C / Ctrl+V / Ctrl+X / Ctrl+Z / Ctrl+Y /
  Ctrl+A) natively.
- Closes when the X button is pressed (default Windows behavior, no
  custom close handler).  Alt+F4 also closes cleanly.

## Pinned configuration

| Key | Value |
| --- | --- |
| App identifier | `com.siyeonkang.sticktoit` |
| Tauri major | v2 (latest stable at install time) |
| Bundle target | `nsis` (Windows `.exe` installer) — only used in Stage D |
| Build target | `x86_64-pc-windows-msvc` |
| App data dir | `%APPDATA%\com.siyeonkang.sticktoit\` |

## Prerequisites for `pnpm tauri:dev` on Windows x64

You need each of these installed once on the Windows machine:

1. **Microsoft C++ Build Tools** — install via the *Visual Studio
   Installer*, picking the **Desktop development with C++** workload.
   (The Tauri/webview2-com Rust crates require `link.exe` and the
   Windows SDK.)
2. **Rust toolchain** — run `rustup-init.exe` from
   <https://rustup.rs>.  The `x86_64-pc-windows-msvc` target is the
   default on a Windows install; verify with
   `rustup target list --installed`.
3. **Tauri CLI (Rust)** — `cargo install tauri-cli --version "^2"`.
   The JS-side `@tauri-apps/cli` is also installed via pnpm and is
   what the npm script invokes; the Rust install is optional but
   handy for diagnostics.
4. **WebView2 Runtime** — preinstalled on Windows 11.  On Windows 10
   you may need the *Evergreen Bootstrapper* from Microsoft.  Tauri
   does not bundle it.
5. **pnpm + Node** — already required by this monorepo.

## Running it

From the repo root, on Windows:

```powershell
pnpm install
pnpm --filter @workspace/sticky-wall tauri:dev
```

> **First build is slow.** The first `tauri:dev` compiles the entire
> Rust dependency tree (Tauri + windows-rs + webview2-com + hundreds of
> crates) and on a typical Windows x64 machine takes **5–15 minutes**
> with long stretches of no output.  **Do not kill the process.**
> Subsequent builds finish in seconds.

`pnpm tauri:dev` automatically runs `pnpm dev` first (Vite serves the
React app at `http://localhost:1420`) and then opens a native Tauri
window pointed at it with hot reload.

## What is NOT in Stage A

| Stage | Item |
| --- | --- |
| B | Notes persisted to `%APPDATA%\com.siyeonkang.sticktoit\notes.json` instead of localStorage |
| B | `NoteStorage` interface + `localStorageBackend` / `tauriFsBackend` |
| B | `hydrated` gate in `usePostItStore` to prevent flash-of-empty-wall |
| C | Tauri updater configured with GitHub Releases endpoint |
| C | `check-for-updates.ts` that prompts via `sonner` toast on launch |
| C | `build-latest-json.mjs` |
| D | Real app icons (the `icons/` folder currently has flat olive-green placeholders generated with ImageMagick — use `pnpm tauri icon <source.png>` to replace) |
| D | `tauri:release` script + signing env-var ergonomics |
| D | Documented PowerShell release ritual |

## Known risks (already on file, not changes for this stage)

- **Windows SmartScreen** will prompt "Windows protected your PC" on
  every unsigned installer (first install in Stage D, every auto-update
  in Stage C).  Click *More info → Run anyway*.  Eliminated only by
  buying an Authenticode certificate (~$200–400/year), which is
  explicitly out of scope.
- **In-place self-update on Windows** uses Tauri's helper-process
  pattern (download to temp, exit app, run installer, relaunch).  Must
  be verified end-to-end before Stage C is declared done.

## Files added / changed in Stage A

- `artifacts/sticky-wall/src-tauri/Cargo.toml`
- `artifacts/sticky-wall/src-tauri/tauri.conf.json`
- `artifacts/sticky-wall/src-tauri/build.rs`
- `artifacts/sticky-wall/src-tauri/src/main.rs`
- `artifacts/sticky-wall/src-tauri/src/lib.rs`
- `artifacts/sticky-wall/src-tauri/capabilities/default.json`
- `artifacts/sticky-wall/src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.ico}` (placeholders)
- `artifacts/sticky-wall/src-tauri/.gitignore`
- `artifacts/sticky-wall/vite.config.ts` — falls back to `PORT=1420` and
  `BASE_PATH=/` only when `TAURI_ENV_PLATFORM` is set; Replit behavior
  unchanged.
- `artifacts/sticky-wall/package.json` — added `tauri:dev` and
  `tauri:build` scripts and three dev deps:
  `@tauri-apps/api`, `@tauri-apps/cli`,
  `@tauri-apps/plugin-window-state`.
