# Sticky Wall — Desktop (Tauri / Windows x64)

This document describes the Tauri v2 packaging work for Sticky Wall on
Windows x64.  The browser build at `/` on Replit is unchanged.

Stages A (native shell), B (file-backed storage), C (auto-updater),
and D (Windows NSIS release pipeline) are all implemented.

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

## Stage C — auto-updater (implemented)

### How it works at runtime

- `src/updater/check-for-updates.ts` runs **once** on app launch, ~3
  seconds after the renderer mounts, and only when
  `window.__TAURI_INTERNALS__` is present (so the browser build at `/`
  on Replit never imports the updater plugin).  No `setInterval` —
  long-running sessions are not re-checked; the next launch is the
  next opportunity.
- The Rust side embeds the `tauri-plugin-updater` plugin (registered
  in `src-tauri/src/lib.rs`) plus `tauri-plugin-process` for
  `relaunch()`.  Renderer permissions are scoped to `updater:default`
  and `process:allow-restart` in `src-tauri/capabilities/default.json`.
- On update available, a `sonner` toast offers **Install now**
  (`downloadAndInstall()` → `relaunch()`) and **Later** (dismiss).
  Network failures, GitHub 404s, or signature mismatches are swallowed
  silently — an offline launch never shows a scary toast.
- Windows file-locking on the running `.exe` is handled by Tauri's
  helper-process pattern: the plugin spawns a small detached process
  that waits for the parent to exit, runs the NSIS installer in
  `passive` mode, then `relaunch()` brings the new version up.  Notes
  live in `%APPDATA%`, untouched by the installer.

### Updater config

`src-tauri/tauri.conf.json` declares:

```jsonc
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/TODO-OWNER/TODO-REPO/releases/latest/download/latest.json"
    ],
    "dialog": false,
    "pubkey": "<contents of sticky-wall.key.pub, single line>",
    "windows": { "installMode": "passive" }
  }
}
```

`TODO-OWNER/TODO-REPO` is intentionally a placeholder until Stage D
wires up the actual GitHub release repo.  The `pubkey` value is the
real, committed Ed25519 public key generated by `tauri signer
generate`; the matching private key is **not** in the repo and lives
only on Siyeon's machine (passed at build time via
`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
`bundle.createUpdaterArtifacts` is also `true` so `tauri build` emits
the `.sig` next to the NSIS installer.

### Signing keypair (one-time, on Siyeon's machine only)

```powershell
pnpm --filter @workspace/sticky-wall exec tauri signer generate -w sticky-wall.key
```

Outputs `sticky-wall.key` (private — **never commit, never email**)
and `sticky-wall.key.pub` (public).  Paste the contents of
`sticky-wall.key.pub` verbatim into `tauri.conf.json` `plugins.updater.pubkey`.
At build time, expose the private key + password via env vars:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw sticky-wall.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password used at generate time>"
pnpm --filter @workspace/sticky-wall run tauri:build
```

### Releasing v0.0.2 (the verification ritual)

See **Stage D** below for the canonical, scripted release ritual that
supersedes the by-hand `build:latest-json` invocation. Stage C only
needs you to know that *if* a `latest.json` is published next to the
`.exe`, the running app will pick it up on next launch.

## Stage D — Windows NSIS release pipeline (implemented)

Stage D bundles everything Stage C needs into a single
`pnpm run tauri:release` command, on Siyeon's Windows x64 machine,
that produces the **three files** uploaded verbatim to a GitHub
Release:

1. `Sticky Wall_<version>_x64-setup.exe`       — NSIS installer
2. `Sticky Wall_<version>_x64-setup.exe.sig`   — Tauri updater
   minisign signature (Ed25519)
3. `latest.json`                               — updater manifest the
   running app fetches on next launch

All three live under
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/` after a
successful build.

### Prerequisites (one-time, on the Windows x64 build machine)

These are the same as Stage A's `tauri:dev` prerequisites, repeated
here so this section stands on its own:

1. **Microsoft C++ Build Tools** — Visual Studio Installer →
   "Desktop development with C++" workload (provides `link.exe` and
   the Windows SDK that `tauri-build` needs).
2. **Rust toolchain** via <https://rustup.rs>.
   Confirm `x86_64-pc-windows-msvc` is installed:
   ```powershell
   rustup target list --installed
   ```
3. **WebView2 Runtime** — preinstalled on Windows 11. On Windows 10
   install the Evergreen Bootstrapper from Microsoft. Tauri does not
   bundle it.
4. **Node + pnpm** — already required by this monorepo.
5. **NSIS** is downloaded by Tauri on first build into
   `%LOCALAPPDATA%\tauri\NSIS\`. No manual install.

### First-time setup

1. **Pick the GitHub repo that will host releases** and replace
   `TODO-OWNER/TODO-REPO` in **two** places:
   - `src-tauri/tauri.conf.json` →
     `plugins.updater.endpoints[0]` (the URL the running app polls).
   - The `--owner` / `--repo` flags you pass to `pnpm tauri:release`
     (or rely on the script defaults, which still print
     `TODO-OWNER/TODO-REPO` until you override them).

2. **Generate the Tauri updater keypair** — once, on Siyeon's machine
   only, kept outside the repo:
   ```powershell
   pnpm --filter @workspace/sticky-wall exec tauri signer generate -w sticky-wall.key
   ```
   This emits `sticky-wall.key` (private — **never commit, never
   email, never paste into chat**) and `sticky-wall.key.pub` (public).

3. **Paste the public key** verbatim — the entire base64 blob,
   single line — into `src-tauri/tauri.conf.json` at
   `plugins.updater.pubkey`. Commit that file. Anyone who clones the
   repo and runs `tauri:release` without the matching private key
   will be loudly rejected by the script (see "Signing-key gate"
   below); the public key alone is harmless.

4. **Save the private key safely** — a password manager, or an
   encrypted USB stick, or both. If it is lost, every existing
   v0.0.x install will silently stop accepting updates forever
   (signature mismatch) and you must ship a new pubkey via a
   manually-installed `.exe`.

### The release ritual

Per release, in **PowerShell** at the repo root, on Siyeon's Windows
x64 machine:

```powershell
# 1. Bump BOTH versions to the new release. They MUST match exactly
#    or `tauri:release` hard-fails before any build runs.
#    src-tauri/tauri.conf.json                 ->  "version": "0.0.2"
#    artifacts/sticky-wall/package.json        ->  "version": "0.0.2"
#    src-tauri/Cargo.toml                      ->  version = "0.0.2"
#    (Cargo.toml is also checked best-effort; cargo will hard-fail
#    too if it drifts, just slower.)

# 2. Expose the signing key for this shell session only.
$env:TAURI_SIGNING_PRIVATE_KEY          = Get-Content -Raw sticky-wall.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password used at generate time>"

# 3. One command does the whole pipeline.
pnpm --filter @workspace/sticky-wall run tauri:release `
  --owner siyeonkang --repo sticky-wall `
  --notes "Bug fixes."
```

Or, equivalently, from `cmd.exe`:

```cmd
set TAURI_SIGNING_PRIVATE_KEY=<paste contents of sticky-wall.key>
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<password>
pnpm --filter @workspace/sticky-wall run tauri:release --owner siyeonkang --repo sticky-wall --notes "Bug fixes."
```

What `tauri:release` does, in order, with a hard-fail on any step:

1. **Signing-key gate** — if `TAURI_SIGNING_PRIVATE_KEY` is unset the
   script prints a help banner and exits non-zero before touching
   anything. (Without it, `tauri build` would silently produce a
   `.exe` with no `.sig` next to it, and every install would reject
   the next update forever.)
2. `pnpm build`                                   — Vite production
   build into `../dist/public`.
3. `pnpm exec tauri build --target x86_64-pc-windows-msvc`
   — NSIS installer + `.sig` (because
   `bundle.createUpdaterArtifacts = true` and
   `bundle.targets = ["nsis"]` — confirmed in `tauri.conf.json`).
4. `node scripts/build-latest-json.mjs` over the bundle dir, reading
   the version from `tauri.conf.json` so it byte-matches the
   installer filename. Writes `latest.json` next to the `.exe`.

On success, the script prints the three absolute paths to upload.

### Uploading the release

Create a GitHub Release tagged `v<version>` (e.g. `v0.0.2`), mark it
"latest", and upload exactly these three files as release assets:

1. `Sticky Wall_<version>_x64-setup.exe`
2. `Sticky Wall_<version>_x64-setup.exe.sig`
3. `latest.json`

The updater endpoint
`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`
resolves to whichever release is currently flagged "latest" — that's
the only piece of GitHub state the running app cares about.

### Bump-both-versions ritual

Per the Stage D spec, two version strings must stay in lockstep every
release, and the release script enforces this with a sub-second
pre-flight check before kicking off the 10-minute Rust compile:

| File | Field | Enforced by `tauri:release`? |
| --- | --- | --- |
| `src-tauri/tauri.conf.json`              | `"version"` (top-level)   | yes — hard-fails on mismatch |
| `artifacts/sticky-wall/package.json`     | `"version"` (top-level)   | yes — hard-fails on mismatch |
| `src-tauri/Cargo.toml`                   | `[package] version`       | yes — hard-fails on mismatch (best-effort regex) |

If `tauri.conf.json` and `package.json` drift, `tauri:release` exits
non-zero with both values printed, before touching the disk. If
`Cargo.toml` drifts, `cargo build` will also hard-fail (slower) — the
script's regex check is a friendlier pre-flight on top of that.

The NSIS bundle filename and `latest.json` URL are derived from
`tauri.conf.json`'s value, so a silently-mismatched Cargo.toml would
otherwise produce a wrong-named binary and a 404 on the updater
download URL.

### First-install SmartScreen ritual (every install, every update)

The Tauri updater key (Ed25519 minisign) and Microsoft Authenticode
are **independent** trust chains:

- Tauri's `.sig` proves the bundle came from whoever holds
  `sticky-wall.key`. The running app verifies it against the
  `pubkey` in `tauri.conf.json`. This is what keeps auto-updates
  safe.
- SmartScreen ("Windows protected your PC", blue dialog) is gated on
  Microsoft's Authenticode reputation. We do not have an Authenticode
  cert (~$200–400/year, explicitly out of scope), so SmartScreen
  fires every time a non-reputable `.exe` is run — both on first
  install and on every auto-update install — until the cert is
  bought.

The user-facing ritual on first install:

1. Double-click `Sticky Wall_<version>_x64-setup.exe`.
2. SmartScreen says *"Windows protected your PC"*. Click
   **More info**.
3. Click the now-revealed **Run anyway** button.
4. NSIS installer runs. App appears in Start menu under "Sticky Wall".

The same dialog appears for **every** auto-update install, because
the helper-process pattern launches a fresh `.exe` outside the
already-trusted parent process. This is annoying but expected — do
not interpret a SmartScreen prompt during update as a sign that
signing is broken; signing is what the `.sig` file proves and is
verified independently by the updater plugin before the installer is
ever launched.

### Canonical 8-step Windows auto-update flow

1. User launches installed Sticky Wall v0.0.1 from Start menu.
2. ~3 seconds after the renderer mounts,
   `src/updater/check-for-updates.ts` calls `check()` from
   `@tauri-apps/plugin-updater`.
3. Plugin GETs
   `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`,
   sees `version: "0.0.2"` > installed `0.0.1`, downloads the `.exe`
   to a temp dir, and verifies its `.sig` against the embedded
   `pubkey`. (Sig mismatch = silent reject, no toast.)
4. Sonner toast appears: *"Sticky Wall 0.0.2 is available — Install
   now / Later"*.
5. User clicks **Install now**. Renderer calls
   `update.downloadAndInstall()` followed by `relaunch()`.
6. Tauri's helper-process pattern: a tiny detached helper waits for
   the parent `.exe` to exit, runs the NSIS installer in `passive`
   mode (silent except for SmartScreen), then re-launches the new
   `.exe`.
7. SmartScreen click-through (see above) — every auto-update.
8. v0.0.2 launches from Start menu's existing shortcut. Notes are
   intact because they live in
   `%APPDATA%\com.siyeonkang.sticktoit\notes.json`, which the NSIS
   installer never touches.

### `%APPDATA%\com.siyeonkang.sticktoit\` file map

| File | Owner | Survives install/uninstall? |
| --- | --- | --- |
| `notes.json`           | Stage B file backend | yes — never touched by NSIS |
| `.window-state.json`   | `tauri-plugin-window-state` | yes — never touched by NSIS |

The NSIS installer's "Remove user data" toggle does not exist in our
config; uninstalling Sticky Wall leaves both files in place. Manual
cleanup means deleting the folder by hand.

### Verification gate

Per task #12: on Siyeon's Windows x64 machine, after a clean
`pnpm install`,

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY          = Get-Content -Raw sticky-wall.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password>"
pnpm --filter @workspace/sticky-wall run tauri:release
```

produces `Sticky Wall_<version>_x64-setup.exe`, the matching `.sig`,
and `latest.json` under `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`.
Running the installer (clicking through SmartScreen), launching from
Start menu, creating a note, quitting, and relaunching shows the
note still there. End-of-stage commit per "Commit hygiene".

### Files added / changed in Stage D

- `artifacts/sticky-wall/src-tauri/icons/{32x32.png,128x128.png,128x128@2x.png,icon.ico,icon.png}`
  — replaced the olive-green Stage A placeholders with a real Sticky
  Wall yellow-post-it icon set generated from the 1024×1024
  `icon.png` source. To regenerate from a new source on Windows:
  `pnpm --filter @workspace/sticky-wall exec tauri icon src-tauri/icons/icon.png`.
- `artifacts/sticky-wall/scripts/tauri-release.mjs` — Stage D
  pipeline runner (signing-key gate → build → tauri build →
  build-latest-json).
- `artifacts/sticky-wall/package.json` — added `tauri:release`
  script.
