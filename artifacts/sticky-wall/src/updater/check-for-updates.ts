// Stage C: launch-time auto-update check. Runs ONCE, ~3 seconds after
// the renderer mounts, and only inside the Tauri shell — the browser
// build at `/` on Replit never imports the updater plugin's
// `__TAURI_INTERNALS__`-gated APIs.
//
// Behavior:
//   * No `setInterval`. A user who keeps the app open for days won't
//     get badgered; the next launch is the next opportunity.
//   * Network errors / GitHub 404s / no-release-yet are swallowed
//     silently — an offline user shouldn't see a scary toast every
//     time they open the app.
//   * On update available, a `sonner` toast offers **Install now**
//     (downloadAndInstall -> relaunch) and **Later** (dismiss; will
//     re-prompt on next launch).
//   * The signature on `latest.json` is verified by the Rust side
//     against the embedded Ed25519 pubkey before the installer ever
//     touches disk; we don't re-verify here.
//   * On Windows the helper-process pattern is handled by
//     `tauri-plugin-updater` itself: it spawns a small detached
//     process that waits for the parent `.exe` to exit, runs the
//     NSIS installer in `passive` mode (silent UI, progress bar,
//     no prompts), then `relaunch()` brings the new version up.

import { toast } from "sonner";

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const LAUNCH_CHECK_DELAY_MS = 3000;

async function runCheck(): Promise<void> {
  // Dynamic imports keep the updater + process plugins out of the
  // browser bundle. Vite tree-shakes the whole module away when
  // `isTauri` is false at runtime, but the dynamic import also
  // guarantees no top-level `invoke()` runs in the browser build
  // (which would throw "window.__TAURI_INTERNALS__ is undefined").
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");

  const update = await check();
  if (!update) return;

  toast(`Sticky Wall ${update.version} is available`, {
    description: "Install now to get the latest version.",
    duration: Infinity,
    action: {
      label: "Install now",
      onClick: async () => {
        try {
          await update.downloadAndInstall();
          // On Windows, `downloadAndInstall` returns once the helper
          // process has been spawned and the parent is asked to exit.
          // `relaunch()` then re-launches the freshly installed
          // version. Notes live in `%APPDATA%`, so the NSIS installer
          // (which only touches `Program Files`) leaves them intact.
          await relaunch();
        } catch (err) {
          // Surface install errors — these aren't the silent-network
          // case, the user explicitly clicked Install.
          toast.error("Update failed", {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      },
    },
    cancel: {
      label: "Later",
      onClick: () => {
        // No-op. We deliberately do NOT persist a "skip this version"
        // flag — the next launch will re-check and re-prompt, which
        // is the simplest behavior that still respects the user's
        // wish not to update right now.
      },
    },
  });
}

export function checkForUpdatesOnLaunch(): void {
  if (!isTauri) return;
  window.setTimeout(() => {
    runCheck().catch(() => {
      // Swallow. Offline, GitHub 404 (no release yet), DNS failure,
      // signature mismatch, malformed `latest.json` — none of these
      // should bother the user at launch. Real problems will surface
      // on the next launch when the network/release is healthy.
    });
  }, LAUNCH_CHECK_DELAY_MS);
}
