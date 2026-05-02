import { useState, useEffect, useCallback, useRef } from "react";

export type PostIt = {
  id: string;
  text: string;
  color: string;
  rotation: number;
  x: number;
  y: number;
  createdAt: number;
};

export type WallState = {
  wall: PostIt[];
  done: PostIt[];
};

const STORAGE_KEY = "sticky-wall:v1";

const DEFAULT_STATE: WallState = {
  wall: [],
  done: [],
};

function loadInitialState(): WallState {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (item) {
      return JSON.parse(item) as WallState;
    }
  } catch (e) {
    console.warn("Failed to load state from localStorage", e);
  }
  return DEFAULT_STATE;
}

export function usePostItStore() {
  const [state, setState] = useState<WallState>(loadInitialState);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save state to localStorage", e);
    }
  }, [state]);

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
          done: [...prev.done, { ...postIt, rotation: 0, x: 0, y: 0 }],
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

  return {
    state,
    stateRef,
    addPostIt,
    updatePostIt,
    deleteWallPostIt,
    retirePostIt,
    unretirePostIt,
    deleteDonePostIt,
  };
}
