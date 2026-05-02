import { useState, useEffect, useRef, useCallback } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import NotFound from "@/pages/not-found";
import { usePostItStore, PostIt } from "@/hooks/use-postit-store";
import { SketchBorder, SketchDefs } from "@/components/sketch-border";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Search, X, Move } from "lucide-react";

const queryClient = new QueryClient();

// Granola-friendly post-it palette: warm naturals that sit harmoniously
// next to the olive-green accent without competing with it.
const COLORS = ["#E8D9B4", "#D9E2B8", "#E9C9B7", "#C8D7CD", "#EBD7C5"];
const NOTE_SIZE = 192;
const PAD_INSET = 32;
const NUDGE_PX = 16;

const GRANOLA_GREEN = "#5B6F00";
const INK = "#0E0F0C";

function generatePostIt(x: number, y: number, text = ""): PostIt {
  return {
    id: crypto.randomUUID(),
    text,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 16 - 8,
    x,
    y,
    createdAt: Date.now(),
  };
}

type DraggablePostItProps = {
  postIt: PostIt;
  onOpenEditor: () => void;
  onPickRequested: () => void;
  onRetireFromKeyboard: () => void;
  onNudge: (dx: number, dy: number) => void;
  onFocusNote: () => void;
  onBlurNote: () => void;
  isFocused: boolean;
  isPicked: boolean;
  isSearchMatch: boolean;
  isFaded: boolean;
  isFreshlyCreated: boolean;
};

function DraggablePostIt({
  postIt,
  onOpenEditor,
  onPickRequested,
  onRetireFromKeyboard,
  onNudge,
  onFocusNote,
  onBlurNote,
  isFocused,
  isPicked,
  isSearchMatch,
  isFaded,
  isFreshlyCreated,
}: DraggablePostItProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: postIt.id,
      data: { type: "postit", postIt },
    });

  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = () => {
    longPressFired.current = false;
    cancelLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      onPickRequested();
    }, 450);
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    left: postIt.x,
    top: postIt.y,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={{
        ...style,
        position: "absolute",
        backgroundColor: postIt.color,
        rotate: postIt.rotation,
        zIndex: isDragging || isPicked ? 50 : isFocused ? 20 : 10,
      }}
      className={`
        w-48 h-48 shadow-sm flex flex-col p-4 cursor-grab active:cursor-grabbing touch-none
        transition-opacity duration-300
        ${isFaded ? "opacity-30" : "opacity-100"}
        ${isSearchMatch ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-black/10 animate-pulse" : ""}
        ${isFocused ? "outline outline-2 outline-offset-2 outline-foreground/40" : ""}
      `}
      animate={
        isDragging || isPicked
          ? { scale: 1.06, boxShadow: "0px 12px 24px rgba(0,0,0,0.18)" }
          : { scale: 1, boxShadow: "0px 2px 5px rgba(0,0,0,0.05)" }
      }
      whileHover={{ scale: isDragging ? 1.06 : 1.02 }}
      onPointerDown={handlePointerDown}
      onPointerMove={cancelLongPress}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onClick={() => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        if (!isDragging) onOpenEditor();
      }}
      {...listeners}
      {...attributes}
      onFocus={onFocusNote}
      onBlur={onBlurNote}
      aria-label={`Sticky note: ${postIt.text || "Empty"}. Click or press E to edit. Arrow keys nudge, Enter or Backspace retires, M picks up.`}
      onKeyDown={(e) => {
        switch (e.key) {
          case "Enter":
          case "Backspace":
          case "Delete":
            e.preventDefault();
            e.stopPropagation();
            onRetireFromKeyboard();
            return;
          case "e":
          case "E":
            e.preventDefault();
            e.stopPropagation();
            onOpenEditor();
            return;
          case "m":
          case "M":
            e.preventDefault();
            e.stopPropagation();
            onPickRequested();
            return;
          case "ArrowLeft":
            e.preventDefault();
            onNudge(-NUDGE_PX, 0);
            return;
          case "ArrowRight":
            e.preventDefault();
            onNudge(NUDGE_PX, 0);
            return;
          case "ArrowUp":
            e.preventDefault();
            onNudge(0, -NUDGE_PX);
            return;
          case "ArrowDown":
            e.preventDefault();
            onNudge(0, NUDGE_PX);
            return;
          case " ":
            e.preventDefault();
            return;
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenEditor();
      }}
    >
      {/* Pencil-sketched border. On a freshly-created post-it the stroke
          draws itself in; on settled notes (and the picked/selected state)
          it stays as a static rough outline. */}
      <SketchBorder
        color={isPicked ? GRANOLA_GREEN : INK}
        strokeWidth={isPicked ? 2.4 : 1.4}
        radius={2}
        inset={2}
        staticOnly={!isFreshlyCreated}
        animationKey={isFreshlyCreated ? postIt.id : undefined}
      />
      <div className="w-full h-full text-foreground/80 font-medium whitespace-pre-wrap overflow-hidden text-ellipsis text-lg leading-snug relative z-10">
        {postIt.text}
      </div>
      <button
        type="button"
        aria-label="Pick up to move"
        title="Pick up to move (M)"
        onClick={(e) => {
          e.stopPropagation();
          onPickRequested();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          cancelLongPress();
        }}
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/5 hover:bg-black/15 flex items-center justify-center text-foreground/40 hover:text-foreground/70 transition-colors z-20"
      >
        <Move size={14} />
      </button>
    </motion.div>
  );
}

function DoneZone({
  count,
  isPickActive,
  isDraggingPostIt,
  onPickDrop,
}: {
  count: number;
  isPickActive: boolean;
  isDraggingPostIt: boolean;
  onPickDrop: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "done-zone" });

  // Re-trigger the pencil draw-in when the zone becomes "active" — i.e.
  // when a post-it is being dragged or picked up — so the outline feels
  // like it's being sketched fresh as the user approaches it.
  const activeKey = isOver
    ? "over"
    : isPickActive
      ? "pick"
      : isDraggingPostIt
        ? "drag"
        : "idle";

  const showHover = isOver || isPickActive;

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (isPickActive) {
          e.stopPropagation();
          onPickDrop();
        }
      }}
      className={`
        absolute bottom-8 right-8 w-56 h-56 rounded-2xl
        transition-colors duration-200 flex flex-col items-center justify-center
        ${isPickActive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}
        ${showHover ? "bg-primary/8" : "bg-transparent"}
      `}
      style={{
        backgroundColor: showHover ? "rgba(91, 111, 0, 0.08)" : undefined,
      }}
    >
      <SketchBorder
        color={showHover ? GRANOLA_GREEN : "rgba(14, 15, 12, 0.35)"}
        strokeWidth={showHover ? 2 : 1.5}
        radius={18}
        inset={4}
        dashed
        animationKey={activeKey}
      />
      <span
        className={`font-semibold text-lg tracking-wide uppercase relative z-10 transition-colors ${
          showHover ? "text-primary" : "text-foreground/40"
        }`}
      >
        {isPickActive ? "Tap to retire" : "Done"}
      </span>
      {count > 0 && !isPickActive && (
        <span className="text-foreground/30 text-sm mt-1 relative z-10">
          {count} items
        </span>
      )}
    </div>
  );
}

function Pad({ onClick }: { onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: "pad-source",
      data: { type: "pad" },
    });

  const dragStyle = transform
    ? { transform: CSS.Translate.toString(transform) }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="absolute bottom-8 left-8 w-48 h-48 cursor-grab active:cursor-grabbing touch-none hover:-translate-y-1 transition-transform duration-200"
      onClick={() => {
        if (!isDragging) onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      {...listeners}
      {...attributes}
      aria-label="New sticky note pad. Click or drag to create a new note. Press N for shortcut."
    >
      <div className="absolute inset-0 bg-[#E9C9B7] rotate-[-4deg] shadow-sm" />
      <div className="absolute inset-0 bg-[#D9E2B8] rotate-[-2deg] shadow-sm" />
      <div className="absolute inset-0 bg-[#E8D9B4] rotate-[2deg] shadow-sm flex items-center justify-center group">
        <span className="text-foreground/25 text-4xl group-hover:text-foreground/40 transition-colors">
          +
        </span>
      </div>
    </div>
  );
}

function DraggableDoneCard({ postIt }: { postIt: PostIt }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `done-${postIt.id}`,
      data: { type: "done-card", postIt },
    });

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        transform: CSS.Translate.toString(transform),
        backgroundColor: postIt.color,
        zIndex: isDragging ? 60 : "auto",
      }}
      className="shrink-0 snap-center w-72 h-72 shadow-lg p-6 flex flex-col relative cursor-grab active:cursor-grabbing touch-none"
      {...listeners}
      {...attributes}
    >
      <SketchBorder color={INK} strokeWidth={1.5} radius={2} inset={2} staticOnly />
      <div className="flex-1 text-foreground/80 font-medium text-xl overflow-hidden text-ellipsis whitespace-pre-wrap pointer-events-none relative z-10">
        {postIt.text}
      </div>
      <div className="text-foreground/40 text-xs font-medium pt-2 pointer-events-none relative z-10">
        Drag onto the wall to bring it back
      </div>
    </motion.div>
  );
}

function RestoreZone({ visible }: { visible: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: "wall-restore" });
  if (!visible) return null;
  return (
    <div
      ref={setNodeRef}
      className="absolute inset-x-8 top-24 bottom-32 rounded-2xl pointer-events-none transition-colors flex items-center justify-center"
    >
      <SketchBorder
        color={isOver ? GRANOLA_GREEN : "rgba(14, 15, 12, 0.25)"}
        strokeWidth={isOver ? 2 : 1.5}
        radius={18}
        inset={4}
        dashed
        animationKey={isOver ? "over" : "idle"}
      />
      <span
        className={`font-semibold text-lg tracking-wide uppercase relative z-10 transition-colors ${
          isOver ? "text-primary" : "text-foreground/40"
        }`}
      >
        Drop on the wall
      </span>
    </div>
  );
}

function StickyWall() {
  const {
    state,
    addPostIt,
    updatePostIt,
    deleteWallPostIt,
    retirePostIt,
    unretirePostIt,
    deleteDonePostIt,
  } = usePostItStore();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [editingPostIt, setEditingPostIt] = useState<PostIt | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDonePileOpen, setIsDonePileOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Tracks post-its created within the last ~1.2s so their pencil border
  // animates in. Cleared via timeout once the draw-in finishes.
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
  );

  const markFresh = useCallback((id: string) => {
    setFreshIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setFreshIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1200);
  }, []);

  const createAt = useCallback(
    (x: number, y: number) => {
      if (stateRef.current.wall.length >= 25) {
        toast(
          "Your wall is getting full. Consider retiring some notes to the done pile.",
          { position: "top-center" },
        );
      }
      const newPostIt = generatePostIt(x, y);
      addPostIt(newPostIt);
      markFresh(newPostIt.id);
      setEditingPostIt(newPostIt);
    },
    [addPostIt, markFresh],
  );

  const handleCreateNew = useCallback(() => {
    createAt(
      window.innerWidth / 2 - NOTE_SIZE / 2,
      window.innerHeight / 2 - NOTE_SIZE / 2,
    );
  }, [createAt]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as
      | { type: "postit"; postIt: PostIt }
      | { type: "pad" }
      | { type: "done-card"; postIt: PostIt }
      | undefined;
    if (data?.type === "postit") {
      setActiveDragId(data.postIt.id);
    } else {
      setActiveDragId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta, over } = event;
    setActiveDragId(null);
    const data = active.data.current as
      | { type: "postit"; postIt: PostIt }
      | { type: "pad" }
      | { type: "done-card"; postIt: PostIt }
      | undefined;
    if (!data) return;

    if (data.type === "pad") {
      const padTop = window.innerHeight - PAD_INSET - NOTE_SIZE;
      const padLeft = PAD_INSET;
      createAt(padLeft + delta.x, padTop + delta.y);
      return;
    }

    if (data.type === "postit") {
      if (over && over.id === "done-zone") {
        retirePostIt(data.postIt.id);
        toast("Sent to the done pile", { position: "bottom-center" });
      } else {
        updatePostIt(data.postIt.id, {
          x: data.postIt.x + delta.x,
          y: data.postIt.y + delta.y,
        });
      }
      return;
    }

    if (data.type === "done-card") {
      if (over && over.id === "wall-restore") {
        unretirePostIt(
          data.postIt.id,
          window.innerWidth / 2 - NOTE_SIZE / 2,
          window.innerHeight / 2 - NOTE_SIZE / 2,
        );
        setIsDonePileOpen(false);
        toast("Back on the wall", { position: "top-center" });
      }
      return;
    }
  };

  const handleWallClickForPick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pickedId) return;
    if (e.target !== e.currentTarget) return;
    const x = e.clientX - NOTE_SIZE / 2;
    const y = e.clientY - NOTE_SIZE / 2;
    updatePostIt(pickedId, { x, y });
    toast("Note placed", { position: "top-center" });
    setPickedId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setSearchQuery("");
        setEditingPostIt(null);
        setIsAboutOpen(false);
        setIsDonePileOpen(false);
        setPickedId(null);
        return;
      }

      if (editingPostIt) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          retirePostIt(editingPostIt.id);
          setEditingPostIt(null);
        }
        return;
      }

      if (isSearchOpen || isAboutOpen || isDonePileOpen) return;

      if (e.key === "n" || e.key === "N") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        handleCreateNew();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    editingPostIt,
    isSearchOpen,
    isAboutOpen,
    isDonePileOpen,
    retirePostIt,
    handleCreateNew,
  ]);

  return (
    <div
      className="fixed inset-0 w-full h-full bg-background overflow-hidden select-none"
      onClick={handleWallClickForPick}
    >
      <SketchDefs />
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {state.wall.length === 0 && state.done.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-foreground/40 text-xl font-medium tracking-wide">
              Pull a note to start thinking...
            </p>
          </div>
        )}

        <Pad onClick={handleCreateNew} />
        <DoneZone
          count={state.done.length}
          isPickActive={!!pickedId}
          isDraggingPostIt={!!activeDragId}
          onPickDrop={() => {
            if (!pickedId) return;
            retirePostIt(pickedId);
            toast("Sent to the done pile", { position: "bottom-center" });
            setPickedId(null);
          }}
        />

        {state.wall.map((postIt) => {
          const isMatch =
            searchQuery &&
            postIt.text.toLowerCase().includes(searchQuery.toLowerCase());
          const isFaded = isSearchOpen && searchQuery.length > 0 && !isMatch;
          return (
            <DraggablePostIt
              key={postIt.id}
              postIt={postIt}
              onOpenEditor={() => {
                if (pickedId === postIt.id) {
                  setPickedId(null);
                  return;
                }
                setEditingPostIt(postIt);
              }}
              onPickRequested={() => {
                setPickedId(postIt.id);
                toast(
                  "Picked up. Tap the wall to place, or the done area to retire.",
                  { position: "top-center" },
                );
              }}
              onRetireFromKeyboard={() => {
                retirePostIt(postIt.id);
                setFocusedId((cur) => (cur === postIt.id ? null : cur));
                toast("Sent to the done pile", { position: "bottom-center" });
              }}
              onNudge={(dx, dy) => {
                const fresh = stateRef.current.wall.find(
                  (p) => p.id === postIt.id,
                );
                if (!fresh) return;
                updatePostIt(postIt.id, {
                  x: fresh.x + dx,
                  y: fresh.y + dy,
                });
              }}
              onFocusNote={() => setFocusedId(postIt.id)}
              onBlurNote={() =>
                setFocusedId((cur) => (cur === postIt.id ? null : cur))
              }
              isFocused={focusedId === postIt.id}
              isPicked={pickedId === postIt.id}
              isSearchMatch={!!isMatch}
              isFaded={!!isFaded}
              isFreshlyCreated={freshIds.has(postIt.id)}
            />
          );
        })}

        <AnimatePresence>
          {isDonePileOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
            >
              <div className="p-8 flex justify-between items-center">
                <h2 className="text-3xl font-bold text-foreground">
                  The Done Pile
                </h2>
                <button
                  onClick={() => setIsDonePileOpen(false)}
                  aria-label="Close done pile"
                  className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <RestoreZone visible={state.done.length > 0} />

              <div className="flex-1 overflow-x-auto p-8 flex items-center gap-8 snap-x relative z-10">
                {state.done.length === 0 ? (
                  <div className="w-full text-center text-foreground/40 text-xl">
                    Nothing here yet.
                  </div>
                ) : (
                  state.done.map((postIt) => (
                    <div key={postIt.id} className="relative group">
                      <DraggableDoneCard postIt={postIt} />
                      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            unretirePostIt(
                              postIt.id,
                              window.innerWidth / 2 - NOTE_SIZE / 2,
                              window.innerHeight / 2 - NOTE_SIZE / 2,
                            );
                          }}
                          className="bg-secondary text-secondary-foreground px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-secondary/80 transition-colors"
                        >
                          Un-retire
                        </button>
                        <button
                          onClick={() => deleteDonePostIt(postIt.id)}
                          className="bg-destructive/10 text-destructive px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-destructive/20 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DndContext>

      {state.done.length > 0 && !isDonePileOpen && (
        <div
          className={`absolute bottom-12 right-12 w-48 h-48 cursor-pointer hover:scale-105 transition-transform ${pickedId ? "pointer-events-none" : ""}`}
          onClick={() => {
            if (pickedId) return;
            setIsDonePileOpen(true);
          }}
          role="button"
          tabIndex={0}
          aria-label="Open the done pile"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !pickedId) setIsDonePileOpen(true);
          }}
        >
          {state.done.slice(-5).map((postIt, i) => (
            <div
              key={postIt.id}
              className="absolute inset-0 shadow-sm"
              style={{
                backgroundColor: postIt.color,
                transform: `rotate(${Math.sin(i * 123) * 3}deg) translate(${i * 2}px, ${-i * 2}px)`,
                zIndex: i,
              }}
            >
              <div className="w-full h-full p-4 text-foreground/40 font-medium text-sm overflow-hidden blur-[1px]">
                {postIt.text}
              </div>
            </div>
          ))}
          <div className="absolute inset-0 z-10 flex items-center justify-center opacity-0 hover:opacity-100 bg-black/5 transition-opacity">
            <span className="bg-white/90 text-foreground px-4 py-1 rounded-full text-sm font-semibold backdrop-blur-sm shadow-sm">
              Open Pile
            </span>
          </div>
        </div>
      )}

      {pickedId && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 bg-primary text-primary-foreground px-5 py-2 rounded-full shadow-lg text-sm font-semibold pointer-events-none">
          Tap the wall to place, the done area to retire, or press Esc to
          cancel.
        </div>
      )}

      <div className="absolute top-8 right-8 flex gap-3 z-40">
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          aria-label="Search notes"
          className="h-11 w-11 bg-white rounded-full flex items-center justify-center text-foreground/60 hover:text-primary hover:bg-secondary transition-colors border border-border"
        >
          <Search size={18} />
        </button>
        <button
          onClick={() => setIsAboutOpen(true)}
          aria-label="About this wall"
          className="h-11 w-11 bg-white rounded-full flex items-center justify-center text-foreground/60 hover:text-primary hover:bg-secondary transition-colors border border-border"
        >
          <Info size={18} />
        </button>
      </div>

      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 right-8 z-40 bg-white p-2 rounded-2xl shadow-xl border border-border w-72"
          >
            <input
              autoFocus
              type="text"
              placeholder="Find a thought..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-foreground px-4 py-2 text-base placeholder:text-muted-foreground font-medium"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingPostIt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/40 backdrop-blur-sm cursor-pointer"
              onClick={() => {
                if (!editingPostIt.text.trim()) {
                  deleteWallPostIt(editingPostIt.id);
                }
                setEditingPostIt(null);
              }}
            />
            <motion.div
              initial={{ scale: 0.8, rotate: editingPostIt.rotation }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.8, rotate: editingPostIt.rotation, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-96 h-96 shadow-2xl p-8 flex flex-col"
              style={{ backgroundColor: editingPostIt.color }}
              onClick={(e) => e.stopPropagation()}
            >
              <SketchBorder
                color={INK}
                strokeWidth={1.6}
                radius={2}
                inset={3}
                staticOnly
              />
              <textarea
                autoFocus
                className="w-full h-full bg-transparent border-none outline-none resize-none text-foreground font-medium text-2xl leading-relaxed placeholder:text-foreground/30 relative z-10"
                placeholder="Type something..."
                value={editingPostIt.text}
                maxLength={200}
                onChange={(e) => {
                  const newText = e.target.value;
                  setEditingPostIt({ ...editingPostIt, text: newText });
                  updatePostIt(editingPostIt.id, { text: newText });
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !(e.metaKey || e.ctrlKey)
                  ) {
                    e.preventDefault();
                    setEditingPostIt(null);
                  }
                }}
              />
              <div className="absolute bottom-4 right-6 flex items-center gap-4 text-foreground/50 font-medium text-sm z-10">
                <span>{editingPostIt.text.length}/200</span>
                <button
                  onClick={() => {
                    retirePostIt(editingPostIt.id);
                    setEditingPostIt(null);
                  }}
                  className="bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors"
                  title="Retire (Cmd+Enter)"
                >
                  Retire
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAboutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setIsAboutOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-[480px] bg-white rounded-3xl shadow-2xl p-10 z-10 text-foreground"
            >
              <h2 className="text-2xl font-semibold mb-6 tracking-tight">
                About this wall
              </h2>
              <div className="space-y-5 text-base text-foreground/80 font-normal leading-relaxed">
                <p>
                  Welcome to your wall. This is a place for thoughts, not
                  tasks.
                </p>
                <ul className="space-y-3">
                  <li>
                    <Kbd>Click</Kbd> the pad bottom-left to spawn a note in the
                    middle, or <Kbd>drag</Kbd> from the pad to drop one
                    wherever you want. (Or press <Kbd>N</Kbd>.)
                  </li>
                  <li>
                    <Kbd>Drag</Kbd> notes anywhere. On touch, long-press a note
                    or tap its <em>move</em> handle, then tap the wall to
                    place it.
                  </li>
                  <li>
                    With a note Tab-focused, the <Kbd>arrow keys</Kbd> nudge
                    it, <Kbd>Enter</Kbd> (or <Kbd>Backspace</Kbd>) retires it,{" "}
                    <Kbd>E</Kbd> opens the editor, and <Kbd>M</Kbd> picks it
                    up to move.
                  </li>
                  <li>
                    <Kbd>Retire</Kbd> a note by dragging it onto the
                    bottom-right pile. Open the pile and{" "}
                    <Kbd>drag a card back onto the wall</Kbd> to bring it
                    back.
                  </li>
                  <li>
                    <Kbd>Find</Kbd> notes instantly with{" "}
                    <Kbd>Cmd</Kbd>/<Kbd>Ctrl</Kbd>+<Kbd>F</Kbd>.
                  </li>
                </ul>
                <p className="pt-2 text-muted-foreground text-sm">
                  Everything stays right where you leave it.
                </p>
              </div>
              <button
                onClick={() => setIsAboutOpen(false)}
                aria-label="Close about"
                className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X size={18} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-sm font-semibold align-baseline">
      {children}
    </span>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={StickyWall} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          className:
            "bg-white border border-border text-foreground rounded-xl shadow-md font-sans",
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
