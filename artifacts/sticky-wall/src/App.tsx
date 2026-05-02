import { useState, useEffect, useRef, useCallback } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import NotFound from "@/pages/not-found";
import { usePostItStore, PostIt } from "@/hooks/use-postit-store";
import { SketchBorder, SketchDefs } from "@/components/sketch-border";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { Info, Search, X } from "lucide-react";

const queryClient = new QueryClient();

// Granola-friendly post-it palette: warm naturals that sit harmoniously
// next to the olive-green accent without competing with it.
const COLORS = ["#E8D9B4", "#D9E2B8", "#E9C9B7", "#C8D7CD", "#EBD7C5"];
const NOTE_SIZE = 192;
const PAD_INSET = 32;
const NUDGE_PX = 16;
const PAD_SPAWN_THRESHOLD = 24;

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

type Point = { x: number; y: number };

type DraggablePostItProps = {
  postIt: PostIt;
  onOpenEditor: () => void;
  onRetireFromKeyboard: () => void;
  onNudge: (dx: number, dy: number) => void;
  onFocusNote: () => void;
  onBlurNote: () => void;
  onDragStart: () => void;
  onDrag: (point: Point) => void;
  onDragEnd: (offset: Point, point: Point) => void;
  isFocused: boolean;
  isSearchMatch: boolean;
  isFaded: boolean;
  isFreshlyCreated: boolean;
};

function DraggablePostIt({
  postIt,
  onOpenEditor,
  onRetireFromKeyboard,
  onNudge,
  onFocusNote,
  onBlurNote,
  onDragStart,
  onDrag,
  onDragEnd,
  isFocused,
  isSearchMatch,
  isFaded,
  isFreshlyCreated,
}: DraggablePostItProps) {
  // Drive position purely through framer-motion's motion values, seeded
  // from the persisted state. We deliberately do NOT also set
  // `style.left/top` from postIt.x/y — keeping two sources of truth caused
  // a one-frame snap-back flicker on drag-release (motion values reset to
  // 0 synchronously while the React commit to the new postIt.x lagged a
  // paint behind). The useEffect below pulls in external position changes
  // (keyboard nudge, restore-from-done-pile) by writing back into the
  // motion values directly.
  const x = useMotionValue(postIt.x);
  const y = useMotionValue(postIt.y);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    x.set(postIt.x);
    y.set(postIt.y);
  }, [postIt.x, postIt.y, x, y]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => {
        setIsDragging(true);
        onDragStart();
      }}
      onDrag={(_, info) => onDrag({ x: info.point.x, y: info.point.y })}
      onDragEnd={(_, info) => {
        setIsDragging(false);
        const offset = { x: info.offset.x, y: info.offset.y };
        const point = { x: info.point.x, y: info.point.y };
        // Commit the dropped absolute position straight from the motion
        // values — they already reflect where the note was released.
        onDragEnd(offset, point);
      }}
      onTap={() => {
        if (!isDragging) onOpenEditor();
      }}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        x,
        y,
        rotate: postIt.rotation,
        backgroundColor: postIt.color,
        zIndex: isDragging ? 50 : isFocused ? 20 : 10,
      }}
      className={`
        w-48 h-48 shadow-sm flex flex-col p-4 cursor-grab active:cursor-grabbing touch-none
        transition-opacity duration-300
        ${isFaded ? "opacity-30" : "opacity-100"}
        ${isSearchMatch ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-black/10 animate-pulse" : ""}
        ${isFocused ? "outline outline-2 outline-offset-2 outline-foreground/40" : ""}
      `}
      whileDrag={{
        scale: 1.05,
        boxShadow: "0 12px 24px rgba(0,0,0,0.18)",
      }}
      whileHover={{ scale: 1.02 }}
      tabIndex={0}
      role="button"
      onFocus={onFocusNote}
      onBlur={onBlurNote}
      aria-label={`Sticky note: ${postIt.text || "Empty"}. Click or press E to edit. Arrow keys nudge, Enter or Backspace retires.`}
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
          draws itself in; on settled notes it stays as a static rough
          outline. */}
      <SketchBorder
        color={INK}
        strokeWidth={1.4}
        radius={2}
        inset={2}
        staticOnly={!isFreshlyCreated}
        animationKey={isFreshlyCreated ? postIt.id : undefined}
      />
      <div className="w-full h-full text-foreground/80 font-medium whitespace-pre-wrap overflow-hidden text-ellipsis text-lg leading-snug relative z-10">
        {postIt.text}
      </div>
    </motion.div>
  );
}

function DoneZone({
  count,
  isOver,
  isDraggingPostIt,
  nodeRef,
}: {
  count: number;
  isOver: boolean;
  isDraggingPostIt: boolean;
  nodeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const activeKey = isOver ? "over" : isDraggingPostIt ? "drag" : "idle";
  const showHover = isOver;

  return (
    <div
      ref={nodeRef}
      className={`
        absolute bottom-8 right-8 w-56 h-56 rounded-2xl
        transition-colors duration-200 flex flex-col items-center justify-center
        pointer-events-none
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
        Done
      </span>
      {count > 0 && !isDraggingPostIt && (
        <span className="text-foreground/30 text-sm mt-1 relative z-10">
          {count} items
        </span>
      )}
    </div>
  );
}

function SketchPlus({ size = 36, color = INK, opacity = 0.35 }: {
  size?: number;
  color?: string;
  opacity?: number;
}) {
  // A small hand-drawn-feeling "+" rendered as two SVG strokes that pass
  // through the same roughen filter as SketchBorder, so it visually
  // matches the rest of the sketched UI rather than a crisp glyph.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible", opacity }}
    >
      <g
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        style={{ filter: `url(#${"sticky-pencil-roughen"})` }}
      >
        <line x1="18" y1="6" x2="18" y2="30" />
        <line x1="6" y1="18" x2="30" y2="18" />
      </g>
    </svg>
  );
}

/**
 * Decorative illustration shown above the empty-state text. Three small
 * overlapping post-its in the Granola palette, lightly rotated and passed
 * through the same pencil-roughen filter as the rest of the sketched UI.
 * Purely decorative — `aria-hidden` so screen readers ignore it.
 */
function EmptyStateIllustration() {
  return (
    <svg
      width="140"
      height="92"
      viewBox="0 0 140 92"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <g style={{ filter: `url(#${"sticky-pencil-roughen"})`, opacity: 0.7 }}>
        {/* Back note — peach, tilted left */}
        <g transform="translate(20 18) rotate(-10 22 22)">
          <rect
            width="44"
            height="44"
            fill="#E9C9B7"
            stroke={INK}
            strokeWidth="1.2"
          />
          <line
            x1="7"
            y1="16"
            x2="34"
            y2="16"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="7"
            y1="25"
            x2="28"
            y2="25"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
        {/* Middle note — olive-green, slight right tilt */}
        <g transform="translate(76 12) rotate(6 22 22)">
          <rect
            width="44"
            height="44"
            fill="#D9E2B8"
            stroke={INK}
            strokeWidth="1.2"
          />
          <line
            x1="7"
            y1="16"
            x2="34"
            y2="16"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="7"
            y1="25"
            x2="30"
            y2="25"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="7"
            y1="34"
            x2="22"
            y2="34"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
        {/* Front note — sand, nudged forward and down */}
        <g transform="translate(50 38) rotate(-2 22 22)">
          <rect
            width="44"
            height="44"
            fill="#E8D9B4"
            stroke={INK}
            strokeWidth="1.2"
          />
          <line
            x1="7"
            y1="16"
            x2="34"
            y2="16"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="7"
            y1="25"
            x2="32"
            y2="25"
            stroke={INK}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}

function Pad({
  onTap,
  onDragEnd,
}: {
  onTap: () => void;
  onDragEnd: (offset: Point) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      dragSnapToOrigin
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(_, info) => {
        setIsDragging(false);
        onDragEnd({ x: info.offset.x, y: info.offset.y });
      }}
      onTap={() => {
        if (!isDragging) onTap();
      }}
      whileDrag={{ scale: 1.05, boxShadow: "0 12px 24px rgba(0,0,0,0.18)" }}
      style={{
        x,
        y,
        zIndex: isDragging ? 50 : "auto",
      }}
      className="absolute bottom-8 left-8 w-48 h-48 cursor-grab active:cursor-grabbing touch-none"
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === "Enter") onTap();
      }}
      aria-label="New sticky note pad. Click or drag to create a new note. Press N for shortcut."
    >
      <div className="absolute inset-0 bg-[#E9C9B7] rotate-[-4deg] shadow-sm">
        <SketchBorder color={INK} strokeWidth={1.2} radius={2} inset={2} staticOnly />
      </div>
      <div className="absolute inset-0 bg-[#D9E2B8] rotate-[-2deg] shadow-sm">
        <SketchBorder color={INK} strokeWidth={1.2} radius={2} inset={2} staticOnly />
      </div>
      <div className="absolute inset-0 bg-[#E8D9B4] rotate-[2deg] shadow-sm flex items-center justify-center group">
        <SketchBorder color={INK} strokeWidth={1.2} radius={2} inset={2} staticOnly />
        <div className="relative z-10 transition-opacity duration-200 group-hover:opacity-100 opacity-80">
          <SketchPlus size={36} color={INK} opacity={0.55} />
        </div>
      </div>
    </motion.div>
  );
}

function DraggableDoneCard({
  postIt,
  onDragEnd,
}: {
  postIt: PostIt;
  onDragEnd: (point: Point) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      dragSnapToOrigin
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(_, info) => {
        setIsDragging(false);
        onDragEnd({ x: info.point.x, y: info.point.y });
      }}
      whileDrag={{ scale: 1.05, boxShadow: "0 12px 24px rgba(0,0,0,0.18)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        x,
        y,
        backgroundColor: postIt.color,
        zIndex: isDragging ? 60 : "auto",
      }}
      className="shrink-0 snap-center w-72 h-72 shadow-lg p-6 flex flex-col relative cursor-grab active:cursor-grabbing touch-none"
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

function RestoreZone({
  visible,
  isOver,
  nodeRef,
}: {
  visible: boolean;
  isOver: boolean;
  nodeRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!visible) return null;
  return (
    <div
      ref={nodeRef}
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

function pointInRect(point: Point, rect: DOMRect | null | undefined): boolean {
  if (!rect) return false;
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
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
  // Tracks post-its created within the last ~1.2s so their pencil border
  // animates in. Cleared via timeout once the draw-in finishes.
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [isAnyPostItDragging, setIsAnyPostItDragging] = useState(false);
  const [isOverDoneZone, setIsOverDoneZone] = useState(false);
  const [isOverWallRestore, setIsOverWallRestore] = useState(false);

  const doneZoneRef = useRef<HTMLDivElement>(null);
  const wallRestoreRef = useRef<HTMLDivElement>(null);

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

  const handlePostItDragStart = useCallback(() => {
    setIsAnyPostItDragging(true);
  }, []);

  const handlePostItDrag = useCallback((point: Point) => {
    setIsOverDoneZone(
      pointInRect(point, doneZoneRef.current?.getBoundingClientRect()),
    );
  }, []);

  const handlePostItDragEnd = useCallback(
    (postIt: PostIt, offset: Point, point: Point) => {
      setIsAnyPostItDragging(false);
      setIsOverDoneZone(false);
      const rect = doneZoneRef.current?.getBoundingClientRect();
      if (pointInRect(point, rect)) {
        retirePostIt(postIt.id);
        setFocusedId((cur) => (cur === postIt.id ? null : cur));
        toast("Sent to the done pile", { position: "bottom-center" });
        return;
      }
      updatePostIt(postIt.id, {
        x: postIt.x + offset.x,
        y: postIt.y + offset.y,
      });
    },
    [retirePostIt, updatePostIt],
  );

  const handlePadDragEnd = useCallback(
    (offset: Point) => {
      // Only spawn if the user actually dragged the pad somewhere; small
      // micro-movements that activate the drag gesture should fall through
      // to the onTap handler instead of producing a note on top of the pad.
      if (
        Math.hypot(offset.x, offset.y) < PAD_SPAWN_THRESHOLD
      ) {
        return;
      }
      const padTop = window.innerHeight - PAD_INSET - NOTE_SIZE;
      const padLeft = PAD_INSET;
      createAt(padLeft + offset.x, padTop + offset.y);
    },
    [createAt],
  );

  const handleDoneCardDragEnd = useCallback(
    (postIt: PostIt, point: Point) => {
      const rect = wallRestoreRef.current?.getBoundingClientRect();
      setIsOverWallRestore(false);
      if (pointInRect(point, rect)) {
        unretirePostIt(
          postIt.id,
          window.innerWidth / 2 - NOTE_SIZE / 2,
          window.innerHeight / 2 - NOTE_SIZE / 2,
        );
        setIsDonePileOpen(false);
        toast("Back on the wall", { position: "top-center" });
      }
    },
    [unretirePostIt],
  );

  // Live "is over the wall-restore zone" feedback while a done-card is
  // being dragged. We listen at window level since we don't have a
  // droppable abstraction tracking pointer movement for us.
  useEffect(() => {
    if (!isDonePileOpen) {
      setIsOverWallRestore(false);
      return;
    }
    const handler = (e: PointerEvent) => {
      const rect = wallRestoreRef.current?.getBoundingClientRect();
      setIsOverWallRestore(
        pointInRect({ x: e.clientX, y: e.clientY }, rect),
      );
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [isDonePileOpen]);

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
    <div className="fixed inset-0 w-full h-full bg-background overflow-hidden select-none">
      <SketchDefs />

      {state.wall.length === 0 && state.done.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
          <EmptyStateIllustration />
          <p className="text-foreground/40 text-xl font-medium tracking-wide">
            Pull a note to start thinking...
          </p>
        </div>
      )}

      <Pad onTap={handleCreateNew} onDragEnd={handlePadDragEnd} />
      <DoneZone
        count={state.done.length}
        isOver={isOverDoneZone}
        isDraggingPostIt={isAnyPostItDragging}
        nodeRef={doneZoneRef}
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
            onOpenEditor={() => setEditingPostIt(postIt)}
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
            onDragStart={handlePostItDragStart}
            onDrag={handlePostItDrag}
            onDragEnd={(offset, point) =>
              handlePostItDragEnd(postIt, offset, point)
            }
            isFocused={focusedId === postIt.id}
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

            <RestoreZone
              visible={state.done.length > 0}
              isOver={isOverWallRestore}
              nodeRef={wallRestoreRef}
            />

            <div className="flex-1 overflow-x-auto p-8 flex items-center gap-8 snap-x relative z-10">
              {state.done.length === 0 ? (
                <div className="w-full text-center text-foreground/40 text-xl">
                  Nothing here yet.
                </div>
              ) : (
                state.done.map((postIt) => (
                  <div key={postIt.id} className="relative group">
                    <DraggableDoneCard
                      postIt={postIt}
                      onDragEnd={(point) =>
                        handleDoneCardDragEnd(postIt, point)
                      }
                    />
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

      {state.done.length > 0 && !isDonePileOpen && (
        <div
          className="absolute bottom-12 right-12 w-48 h-48 cursor-pointer hover:scale-105 transition-transform"
          onClick={() => setIsDonePileOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="Open the done pile"
          onKeyDown={(e) => {
            if (e.key === "Enter") setIsDonePileOpen(true);
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
              {/* Slightly stronger draw-in than the wall post-its: this is
                  the focal surface, so the pencil reveal feels deliberate
                  as the modal opens. Keyed on the post-it id so reopening
                  a different note re-plays the stroke. */}
              <SketchBorder
                color={INK}
                strokeWidth={2}
                radius={2}
                inset={3}
                durationMs={620}
                animationKey={`editor-${editingPostIt.id}`}
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
                    <Kbd>Drag</Kbd> notes anywhere with mouse or touch.
                  </li>
                  <li>
                    With a note Tab-focused, the <Kbd>arrow keys</Kbd> nudge
                    it, <Kbd>Enter</Kbd> (or <Kbd>Backspace</Kbd>) retires it,
                    and <Kbd>E</Kbd> opens the editor.
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
