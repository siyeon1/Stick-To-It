import { useState, useEffect, useCallback, useRef } from "react";
import { noteStorage } from "@/storage/storage";

export type PostIt = {
  id: string;
  text: string;
  color: string;
  rotation: number;
  x: number;
  y: number;
  createdAt: number;
  // Stamped when the note is retired (moved to the Done pile). Optional
  // for forward-compat with data written before this field existed —
  // the storage migration backfills missing values.
  retiredAt?: number;
};

export type WallState = {
  wall: PostIt[];
  done: PostIt[];
};

const DEFAULT_STATE: WallState = {
  wall: [],
  done: [],
};

// Debounce window for persistent saves once we are hydrated. Keeps
// us from hammering disk on every keystroke / drag-frame update.
const SAVE_DEBOUNCE_MS = 250;

export function usePostItStore() {
  const [state, setState] = useState<WallState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Load persisted state once on mount. Until this resolves, `hydrated`
  // stays false and the App holds the wall back so we don't render an
  // empty wall before flashing in the real one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await noteStorage.load();
      if (cancelled) return;
      if (loaded) setState(loaded);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced save. Only runs after hydration so the initial empty
  // state never overwrites the user's persisted notes between mount
  // and load completion.
  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => {
      void noteStorage.save(state);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [state, hydrated]);

  // Best-effort flush on unload so a fast quit (X button on Tauri,
  // tab close in browser) still persists pending edits within the
  // debounce window. Fire-and-forget; the OS terminates us shortly
  // after either way.
  useEffect(() => {
    if (!hydrated) return;
    const flush = () => {
      void noteStorage.save(stateRef.current);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [hydrated]);

  const update = useCallback((updater: (prev: WallState) => WallState) => {
    setState((prev) => updater(prev));
  }, []);

  const addPostIt = useCallback((postIt: PostIt) => {
    update((prev) => ({ ...prev, wall: [...prev.wall, postIt] }));
  }, [update]);

  const updatePostIt = useCallback(
    (id: string, updates: Partial<PostIt>) => {
      update((prev) => ({
        ...prev,
        wall: prev.wall.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    },
    [update],
  );

  const deleteWallPostIt = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        wall: prev.wall.filter((p) => p.id !== id),
      }));
    },
    [update],
  );

  const retirePostIt = useCallback(
    (id: string) => {
      update((prev) => {
        const postIt = prev.wall.find((p) => p.id === id);
        if (!postIt) return prev;
        return {
          wall: prev.wall.filter((p) => p.id !== id),
          done: [
            ...prev.done,
            {
              ...postIt,
              rotation: 0,
              x: 0,
              y: 0,
              retiredAt: Date.now(),
            },
          ],
        };
      });
    },
    [update],
  );

  const unretirePostIt = useCallback(
    (id: string, x: number, y: number) => {
      update((prev) => {
        const postIt = prev.done.find((p) => p.id === id);
        if (!postIt) return prev;
        const newRotation = Math.random() * 16 - 8;
        return {
          done: prev.done.filter((p) => p.id !== id),
          wall: [...prev.wall, { ...postIt, rotation: newRotation, x, y }],
        };
      });
    },
    [update],
  );

  const deleteDonePostIt = useCallback(
    (id: string) => {
      update((prev) => ({
        ...prev,
        done: prev.done.filter((p) => p.id !== id),
      }));
    },
    [update],
  );

  // Apply a clamp function to every wall post-it in a single batched
  // update — used by the safe-area resize handler so a viewport shrink
  // doesn't strand any notes off-screen or under the overlays.
  const clampWall = useCallback(
    (clamp: (p: PostIt) => { x: number; y: number }) => {
      update((prev) => {
        let changed = false;
        const wall = prev.wall.map((p) => {
          const c = clamp(p);
          if (c.x === p.x && c.y === p.y) return p;
          changed = true;
          return { ...p, x: c.x, y: c.y };
        });
        return changed ? { ...prev, wall } : prev;
      });
    },
    [update],
  );

  // Replace every wall post-it's position (and optionally rotation) in a
  // single batched update. Used by the auto-organize action, which needs
  // to write all new positions at once so they animate from old → new in
  // sync rather than as a cascade of N successive renders.
  const setWallPositions = useCallback(
    (
      compute: (
        p: PostIt,
        index: number,
      ) => { x: number; y: number; rotation?: number },
    ) => {
      update((prev) => ({
        ...prev,
        wall: prev.wall.map((p, i) => ({ ...p, ...compute(p, i) })),
      }));
    },
    [update],
  );

  return {
    state,
    stateRef,
    hydrated,
    addPostIt,
    updatePostIt,
    deleteWallPostIt,
    retirePostIt,
    unretirePostIt,
    deleteDonePostIt,
    clampWall,
    setWallPositions,
  };
}
