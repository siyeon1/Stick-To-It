import type { WallState } from "@/hooks/use-postit-store";

export interface NoteStorage {
  load(): Promise<WallState | null>;
  save(state: WallState): Promise<void>;
}

const STORAGE_KEY = "sticky-wall:v1";

const DEFAULT_STATE: WallState = { wall: [], done: [] };

// Backfill `retiredAt` on legacy done items so sort-by-retired-at works
// without a separate migration step. Falls back to `createdAt`, then to
// a synthesised "now" so newer/older still produces a stable order.
function migrate(parsed: unknown): WallState {
  if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;
  const obj = parsed as Partial<WallState>;
  const now = Date.now();
  const wall = Array.isArray(obj.wall) ? obj.wall : [];
  const done = (Array.isArray(obj.done) ? obj.done : []).map((p) =>
    p.retiredAt != null ? p : { ...p, retiredAt: p.createdAt ?? now },
  );
  return { wall, done };
}

export const localStorageBackend: NoteStorage = {
  async load() {
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      if (!item) return null;
      return migrate(JSON.parse(item));
    } catch (e) {
      console.warn("Failed to load state from localStorage", e);
      return null;
    }
  },
  async save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save state to localStorage", e);
    }
  },
};

// `notes.json` lives in the per-user app-data dir. On Windows that's
// `%APPDATA%\com.siyeonkang.sticktoit\notes.json`. The atomic write
// pattern (write tmp → rename) maps to Rust's `std::fs::rename`, which
// on Windows uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`.
const FILE_NAME = "notes.json";
const TMP_NAME = "notes.json.tmp";

function makeTauriFsBackend(): NoteStorage {
  // Lazy-resolve so the dynamic imports only happen under Tauri.
  //
  // Note on @tauri-apps/plugin-path: there is no separate npm package
  // by that name in Tauri v2 — the path APIs (`appDataDir`, `join`)
  // ship inside `@tauri-apps/api/path`. The corresponding capability
  // permission `path:default` is granted alongside the fs scopes.
  type FsModule = typeof import("@tauri-apps/plugin-fs");
  type PathModule = typeof import("@tauri-apps/api/path");
  let cached: Promise<{
    fs: FsModule;
    target: string;
    tmp: string;
  }> | null = null;

  async function init() {
    if (cached) return cached;
    cached = (async () => {
      const fs: FsModule = await import("@tauri-apps/plugin-fs");
      const path: PathModule = await import("@tauri-apps/api/path");
      const appDataDir = await path.appDataDir();
      const target = await path.join(appDataDir, FILE_NAME);
      const tmp = await path.join(appDataDir, TMP_NAME);
      // The app-data dir is created in the Rust `.setup()` step before
      // the renderer loads (see src-tauri/src/lib.rs). We deliberately
      // do NOT call mkdir / exists from here — the renderer's
      // capability set is locked to scoped read/write/rename on the
      // two note files only, with no fs:allow-mkdir.
      return { fs, target, tmp };
    })();
    return cached;
  }

  return {
    async load() {
      try {
        const { fs, target } = await init();
        const text = await fs.readTextFile(target);
        if (!text) return null;
        return migrate(JSON.parse(text));
      } catch (e) {
        // First-launch ENOENT lands here too — treat any read failure
        // (missing file, permission glitch, parse error) as "no
        // persisted state" so the app boots into a clean wall instead
        // of refusing to start.
        return null;
      }
    },
    async save(state) {
      try {
        const { fs, target, tmp } = await init();
        const text = JSON.stringify(state);
        await fs.writeTextFile(tmp, text);
        await fs.rename(tmp, target);
      } catch (e) {
        console.warn("Failed to save notes.json", e);
      }
    },
  };
}

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const noteStorage: NoteStorage = isTauri
  ? makeTauriFsBackend()
  : localStorageBackend;
