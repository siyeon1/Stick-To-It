import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import NotFound from "@/pages/not-found";
import { usePostItStore, PostIt } from "@/hooks/use-postit-store";
import { SketchBorder, SketchDefs } from "@/components/sketch-border";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  animate,
} from "framer-motion";
import { Info, LayoutGrid, Search, X } from "lucide-react";

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

type SafeArea = { top: number; left: number; right: number; bottom: number };

// Breathing room between a wall note and any overlay element. Notes can
// drag right up against the toolbar/pad/Done-zone visually, but stop 8px
// shy of them so they never tuck underneath.
const SAFE_MARGIN = 8;

type SafeAreas = {
  // Strict rect: where notes are allowed to come to *rest*. Excludes
  // pad, Done-zone, and viewport edges. The TOP is the viewport edge
  // (minus SAFE_MARGIN) — toolbar avoidance is enforced separately via
  // `toolbar` and applies only to columns whose horizontal extent
  // actually overlaps the toolbar's bbox.
  rest: SafeArea;
  // Loose rect: where notes are allowed to *travel* mid-drag. Excludes
  // viewport edges only — top is the viewport edge so a note can be
  // dragged up over a column not occupied by the toolbar, and bottom is
  // the viewport edge so a note can be dragged into the Done zone for
  // retire. The toolbar is only a *visual* overlap during drag (motion
  // notes have higher z-index than the toolbar); the on-release clamp
  // pulls the rest position out from under the toolbar if needed.
  drag: SafeArea;
  // Toolbar bbox in viewport coords, expanded outward by SAFE_MARGIN.
  // Null until the toolbar is measured. Used by `clampPointToRestArea`
  // and `handleAutoOrganize` to keep notes clear of the toolbar only
  // where they would actually overlap it horizontally.
  toolbar: SafeArea | null;
};

function computeSafeAreas(
  toolbar: DOMRect | undefined,
  pad: DOMRect | undefined,
  done: DOMRect | undefined,
): SafeAreas {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  // Strict rest bottom: above whichever of pad / done-zone reaches higher.
  // Single axis-aligned rectangle, so the horizontal strip between pad and
  // done-zone is also excluded — documented v1 trade-off.
  const restBottomEdge = Math.min(
    pad ? pad.top : vh,
    done ? done.top : vh,
  );
  return {
    rest: {
      top: SAFE_MARGIN,
      left: SAFE_MARGIN,
      right: vw - SAFE_MARGIN,
      bottom: restBottomEdge - SAFE_MARGIN,
    },
    drag: {
      top: SAFE_MARGIN,
      left: SAFE_MARGIN,
      right: vw - SAFE_MARGIN,
      bottom: vh - SAFE_MARGIN,
    },
    toolbar: toolbar
      ? {
          top: toolbar.top - SAFE_MARGIN,
          left: toolbar.left - SAFE_MARGIN,
          right: toolbar.right + SAFE_MARGIN,
          bottom: toolbar.bottom + SAFE_MARGIN,
        }
      : null,
  };
}

function rectsEqual(a: SafeArea, b: SafeArea): boolean {
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.right === b.right &&
    a.bottom === b.bottom
  );
}

function safeAreasEqual(a: SafeAreas, b: SafeAreas): boolean {
  if (!rectsEqual(a.rest, b.rest)) return false;
  if (!rectsEqual(a.drag, b.drag)) return false;
  if (a.toolbar === b.toolbar) return true;
  if (!a.toolbar || !b.toolbar) return false;
  return rectsEqual(a.toolbar, b.toolbar);
}

// Tracks the two rectangles used by the wall: a strict "rest" rect (where
// notes may settle) and a loose "drag" rect (where notes may travel
// mid-drag). Recomputes on window resize and on a ResizeObserver attached
// to each overlay element so changes in toolbar height (content reflow)
// or pad height (stack growth) propagate within a frame.
function useSafeArea(refs: {
  toolbar: React.RefObject<HTMLElement | null>;
  pad: React.RefObject<HTMLElement | null>;
  done: React.RefObject<HTMLElement | null>;
}): SafeAreas {
  const [safeAreas, setSafeAreas] = useState<SafeAreas>(() =>
    computeSafeAreas(undefined, undefined, undefined),
  );

  useEffect(() => {
    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = computeSafeAreas(
          refs.toolbar.current?.getBoundingClientRect(),
          refs.pad.current?.getBoundingClientRect(),
          refs.done.current?.getBoundingClientRect(),
        );
        setSafeAreas((prev) => (safeAreasEqual(prev, next) ? prev : next));
      });
    };
    recompute();
    window.addEventListener("resize", recompute);
    const observers: ResizeObserver[] = [];
    [refs.toolbar.current, refs.pad.current, refs.done.current].forEach(
      (el) => {
        if (!el) return;
        const obs = new ResizeObserver(recompute);
        obs.observe(el);
        observers.push(obs);
      },
    );
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", recompute);
      observers.forEach((o) => o.disconnect());
    };
  }, [refs.toolbar, refs.pad, refs.done]);

  return safeAreas;
}

function clampPointToSafeArea(
  x: number,
  y: number,
  safeArea: SafeArea,
  size = NOTE_SIZE,
): Point {
  const minX = safeArea.left;
  const minY = safeArea.top;
  const maxX = safeArea.right - size;
  const maxY = safeArea.bottom - size;
  // If the safe area is degenerate (smaller than the note), just pin to the
  // top-left corner — better than producing inverted bounds.
  if (maxX < minX || maxY < minY) {
    return { x: minX, y: minY };
  }
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

// Rest-area clamp that's aware of the toolbar exclusion box. The rest
// rect itself runs all the way to the viewport top; the toolbar is a
// secondary exclusion that only kicks in for notes whose horizontal
// extent actually overlaps the toolbar's. This is the per-note overlap
// rule the plan calls out — easy to break later, hence the explicit
// helper rather than open-coding it at each call site.
function clampPointToRestArea(
  x: number,
  y: number,
  restArea: SafeArea,
  toolbar: SafeArea | null,
  size = NOTE_SIZE,
): Point {
  const base = clampPointToSafeArea(x, y, restArea, size);
  if (!toolbar) return base;
  // Does the note's horizontal extent overlap the toolbar's?
  const noteLeft = base.x;
  const noteRight = base.x + size;
  const overlapsX = noteRight > toolbar.left && noteLeft < toolbar.right;
  if (!overlapsX) return base;
  // Push down only this column. If pushing down would shove the note
  // below restArea.bottom (e.g. very short viewport), keep the rest-area
  // clamp's y rather than producing an inverted result.
  const minY = Math.max(restArea.top, toolbar.bottom);
  const maxY = restArea.bottom - size;
  if (minY > maxY) return base;
  return {
    x: base.x,
    y: Math.max(minY, base.y),
  };
}

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
  dragArea: SafeArea;
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
  dragArea,
}: DraggablePostItProps) {
  // Per-note dragConstraints expressed in the same coordinate space as our
  // motion x/y values. Because we drive position by writing the absolute
  // viewport coordinate straight into the motion value (style.left/top are
  // pinned at 0), the constraint is simply the dragArea rect minus the
  // note's own size — no per-note `- postIt.x` translation is needed.
  //
  // dragArea is the LOOSE rect (full viewport bottom), not the strict rest
  // rect. This is deliberate: the Done zone lives in the bottom strip, and
  // the user must be able to drag a note INTO it for the retire-on-drop
  // gesture. The on-release clamp in handlePostItDragEnd uses the strict
  // rest rect to pull non-retire drops back above the pad/Done-zone.
  //
  // Rotation: we constrain the unrotated layout box. With ±8° rotation the
  // visual corners can poke up to ~14px past the AABB; that is acceptable
  // for v1 and the SAFE_MARGIN absorbs most of it.
  const dragConstraints = {
    top: dragArea.top,
    left: dragArea.left,
    right: Math.max(dragArea.left, dragArea.right - NOTE_SIZE),
    bottom: Math.max(dragArea.top, dragArea.bottom - NOTE_SIZE),
  };
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

  // When the persisted position changes externally (keyboard nudge,
  // restore-from-done, auto-organize, on-release clamp pulling the note
  // back into the rest area, …) tween the motion value to the new target
  // instead of snapping. The tween is essentially a no-op for ordinary
  // drag commits — the motion value is already at the dropped position
  // by the time state updates, so animate(...) settles immediately.
  //
  // Gated on !isDragging so a state-driven position change that lands
  // mid-drag (e.g. a viewport resize firing the clamp effect while the
  // user is mid-drag) doesn't fight the pointer-driven motion. When the
  // drag ends, isDragging flips to false and this effect re-runs to
  // resync to whatever the persisted value now is.
  useEffect(() => {
    if (isDragging) return;
    const ctrlX = animate(x, postIt.x, { duration: 0.4, ease: "easeOut" });
    const ctrlY = animate(y, postIt.y, { duration: 0.4, ease: "easeOut" });
    return () => {
      ctrlX.stop();
      ctrlY.stop();
    };
  }, [postIt.x, postIt.y, x, y, isDragging]);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={dragConstraints}
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
  nodeRef,
}: {
  onTap: () => void;
  onDragEnd: (offset: Point) => void;
  nodeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <motion.div
      ref={nodeRef}
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
  onDraggingChange,
}: {
  postIt: PostIt;
  onDragEnd: (point: Point) => void;
  onDraggingChange?: (dragging: boolean) => void;
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
      onDragStart={() => {
        setIsDragging(true);
        onDraggingChange?.(true);
      }}
      onDragEnd={(_, info) => {
        setIsDragging(false);
        onDraggingChange?.(false);
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
      className="w-full aspect-square shadow-md p-4 flex flex-col relative cursor-grab active:cursor-grabbing touch-none"
    >
      <SketchBorder color={INK} strokeWidth={1.5} radius={2} inset={2} staticOnly />
      <div className="flex-1 text-foreground/80 font-medium text-base overflow-hidden text-ellipsis whitespace-pre-wrap pointer-events-none relative z-10">
        {postIt.text}
      </div>
    </motion.div>
  );
}

// Wraps DraggableDoneCard with the per-card action buttons (Put back /
// Delete) that appear below it. Extracted so the same card markup can
// be rendered from both the flat (color-sort) and grouped (date-sort)
// branches of the Done modal without duplication.
function DonePileCard({
  postIt,
  onDragEnd,
  onDraggingChange,
  onRestore,
  onDelete,
}: {
  postIt: PostIt;
  onDragEnd: (postIt: PostIt, point: Point) => void;
  onDraggingChange: (dragging: boolean) => void;
  onRestore: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="relative">
      <DraggableDoneCard
        postIt={postIt}
        onDragEnd={(point) => onDragEnd(postIt, point)}
        onDraggingChange={onDraggingChange}
      />
      {/* Buttons sit BELOW the card (not overlapping its body text)
          and are always visible — touch devices have no hover to
          reveal them. */}
      <div className="mt-3 flex justify-center gap-2 flex-wrap">
        <button
          onClick={() => {
            onRestore(
              postIt.id,
              window.innerWidth / 2 - NOTE_SIZE / 2,
              window.innerHeight / 2 - NOTE_SIZE / 2,
            );
          }}
          className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-[11px] font-semibold hover:bg-secondary/80 transition-colors shadow-sm"
        >
          Put back on wall
        </button>
        <button
          onClick={() => onDelete(postIt.id)}
          className="bg-destructive/10 text-destructive px-3 py-1 rounded-full text-[11px] font-semibold hover:bg-destructive/20 transition-colors shadow-sm"
        >
          Delete
        </button>
      </div>
    </div>
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
    clampWall,
    setWallPositions,
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
  const [doneQuery, setDoneQuery] = useState("");
  const [doneSort, setDoneSort] = useState<"newest" | "oldest" | "color">(
    "newest",
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Tracks post-its created within the last ~1.2s so their pencil border
  // animates in. Cleared via timeout once the draw-in finishes.
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const [isAnyPostItDragging, setIsAnyPostItDragging] = useState(false);
  const [isOverDoneZone, setIsOverDoneZone] = useState(false);
  const [isOverWallRestore, setIsOverWallRestore] = useState(false);
  const [isDraggingDoneCard, setIsDraggingDoneCard] = useState(false);

  // If the done modal closes while a card is mid-drag (Escape, X button,
  // restore-by-button, etc.) the card unmounts and its onDragEnd never
  // fires, leaving isDraggingDoneCard stuck at true. Reset it whenever
  // the modal is closed so the dashed RestoreZone doesn't flash on next
  // open.
  useEffect(() => {
    if (!isDonePileOpen) setIsDraggingDoneCard(false);
  }, [isDonePileOpen]);

  // Reset the search box whenever the modal closes — re-opening to a
  // stale filter is confusing.
  useEffect(() => {
    if (!isDonePileOpen) setDoneQuery("");
  }, [isDonePileOpen]);

  // Filtered + sorted view of the done pile. Recomputes only when the
  // pile, the query, or the sort mode change — not on every parent
  // render. Sort key falls back through retiredAt → createdAt → 0 so
  // legacy items (which loadInitialState backfilled) and any future
  // schema gaps still produce a stable order.
  const displayedDone = useMemo(() => {
    const q = doneQuery.trim().toLowerCase();
    const filtered = q
      ? state.done.filter((p) => p.text.toLowerCase().includes(q))
      : state.done;
    const keyOf = (p: PostIt) => p.retiredAt ?? p.createdAt ?? 0;
    const arr = filtered.slice();
    if (doneSort === "newest") arr.sort((a, b) => keyOf(b) - keyOf(a));
    else if (doneSort === "oldest") arr.sort((a, b) => keyOf(a) - keyOf(b));
    else arr.sort((a, b) => a.color.localeCompare(b.color));
    return arr;
  }, [state.done, doneQuery, doneSort]);

  // Date-bucketed view of `displayedDone`, used when sort is by date
  // (newest/oldest). For "color" sort we deliberately fall back to a
  // flat grid — color grouping and date grouping don't compose
  // meaningfully.
  //
  // Buckets are rolling-relative-to-now: Today is everything since
  // local midnight, Yesterday is the prior 24h, This Week is the prior
  // 7 days excluding Today/Yesterday, This Month is the prior 30 days
  // excluding the above, Older catches the rest. Each note lands in
  // the FIRST matching bucket only — no double-counting. Empty buckets
  // are dropped so users don't see "Yesterday (0)" headers.
  const groupedDone = useMemo<{ key: string; label: string; items: PostIt[] }[]>(() => {
    if (doneSort === "color") return [];
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const startOfYesterday = startOfToday - DAY;
    const startOfWeek = startOfToday - 7 * DAY;
    const startOfMonth = startOfToday - 30 * DAY;
    const buckets: Record<string, PostIt[]> = {
      today: [],
      yesterday: [],
      week: [],
      month: [],
      older: [],
    };
    const keyOf = (p: PostIt) => p.retiredAt ?? p.createdAt ?? 0;
    for (const p of displayedDone) {
      const t = keyOf(p);
      if (t >= startOfToday) buckets.today.push(p);
      else if (t >= startOfYesterday) buckets.yesterday.push(p);
      else if (t >= startOfWeek) buckets.week.push(p);
      else if (t >= startOfMonth) buckets.month.push(p);
      else buckets.older.push(p);
    }
    const order =
      doneSort === "oldest"
        ? ["older", "month", "week", "yesterday", "today"]
        : ["today", "yesterday", "week", "month", "older"];
    const labels: Record<string, string> = {
      today: "Today",
      yesterday: "Yesterday",
      week: "This Week",
      month: "This Month",
      older: "Older",
    };
    return order
      .filter((k) => buckets[k].length > 0)
      .map((k) => ({ key: k, label: labels[k], items: buckets[k] }));
  }, [displayedDone, doneSort]);

  const doneZoneRef = useRef<HTMLDivElement>(null);
  const wallRestoreRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);

  const safeAreas = useSafeArea({
    toolbar: toolbarRef,
    pad: padRef,
    done: doneZoneRef,
  });
  const restArea = safeAreas.rest;
  const dragArea = safeAreas.drag;
  const toolbarBox = safeAreas.toolbar;

  // When the rest area shrinks (window resize, pad/toolbar reflow), pull
  // any wall note that's now outside the new rest rectangle back inside in
  // a single batched update. Notes that were already inside are left alone.
  // Uses the toolbar-aware clamp so notes whose horizontal column overlaps
  // the toolbar get pushed below it; notes in non-overlapping columns are
  // free to sit at the new (higher) top edge.
  useEffect(() => {
    clampWall((p) => clampPointToRestArea(p.x, p.y, restArea, toolbarBox));
  }, [restArea, toolbarBox, clampWall]);

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

  // Auto-organize: lay every wall post-it out in a tidy left-to-right,
  // top-to-bottom grid that fits inside the strict rest area. Cell pitch
  // is NOTE_SIZE + GRID_GAP at the baseline; if the natural baseline
  // grid would exceed the rest-area height, we widen the column count
  // (so we use more horizontal space) and then tighten both pitches to
  // fit — notes may end up touching or slightly overlapping for very
  // dense walls, which is preferable to spilling under the pad/done
  // overlays. Existing rotations are preserved so the wall still feels
  // like sticky notes (not a spreadsheet) — just tidied.
  const handleAutoOrganize = useCallback(() => {
    const N = stateRef.current.wall.length;
    if (N === 0) return;
    const GRID_GAP = 16;
    const cell = NOTE_SIZE + GRID_GAP;
    const usableW = Math.max(NOTE_SIZE, restArea.right - restArea.left);
    // Vertical packing must fit in the WORST-case column — i.e. the
    // toolbar-overlap columns whose top is `toolbar.bottom` rather than
    // `restArea.top`. Using the global rest height here would let dense
    // walls spill past `restArea.bottom` for those columns. Cheap to
    // always compute against the worst-case top: non-overlapping columns
    // just keep a little extra slack at the bottom.
    const worstTop =
      toolbarBox != null
        ? Math.max(restArea.top, toolbarBox.bottom)
        : restArea.top;
    const usableH = Math.max(NOTE_SIZE, restArea.bottom - worstTop);
    const colsBaseline = Math.max(1, Math.floor((usableW + GRID_GAP) / cell));
    const rowsCap = Math.max(1, Math.floor((usableH + GRID_GAP) / cell));
    // If the baseline grid would overflow vertically, widen the column
    // count just enough that ceil(N / cols) <= rowsCap.
    const cols =
      Math.ceil(N / colsBaseline) > rowsCap
        ? Math.min(N, Math.max(colsBaseline, Math.ceil(N / rowsCap)))
        : colsBaseline;
    const rows = Math.ceil(N / cols);
    // Tighten pitch when the grid still doesn't fit, so notes pack into
    // the visible rest area instead of spilling.
    const xPitch =
      cols > 1 ? Math.min(cell, (usableW - NOTE_SIZE) / (cols - 1)) : 0;
    const yPitch =
      rows > 1 ? Math.min(cell, (usableH - NOTE_SIZE) / (rows - 1)) : 0;
    setWallPositions((_p, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const cellX = restArea.left + col * xPitch;
      // Per-column top: if this column's cell overlaps the toolbar's
      // x-range, the column starts below the toolbar; otherwise it
      // starts at the (higher) rest-area top. This is the same per-note
      // overlap rule `clampPointToRestArea` uses, applied at layout time
      // so auto-organize doesn't tuck the rightmost columns under the
      // toolbar.
      const overlapsToolbar =
        toolbarBox != null &&
        cellX + NOTE_SIZE > toolbarBox.left &&
        cellX < toolbarBox.right;
      const colTop = overlapsToolbar
        ? Math.max(restArea.top, toolbarBox.bottom)
        : restArea.top;
      return {
        x: cellX,
        y: colTop + row * yPitch,
      };
    });
    toast("Tidied up the wall", { position: "bottom-center" });
  }, [restArea, toolbarBox, setWallPositions, stateRef]);

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
      // Retire-vs-clamp ordering: hit-test the Done zone FIRST. If the
      // user released inside the Done zone we retire and never persist a
      // clamped wall position. Only when the drop is NOT a retire do we
      // clamp the dropped position to the safe area before persisting —
      // this catches mid-flick releases where dragConstraints didn't
      // quite finish reining the note in.
      const rect = doneZoneRef.current?.getBoundingClientRect();
      if (pointInRect(point, rect)) {
        retirePostIt(postIt.id);
        setFocusedId((cur) => (cur === postIt.id ? null : cur));
        toast("Sent to the done pile", { position: "bottom-center" });
        return;
      }
      const clamped = clampPointToRestArea(
        postIt.x + offset.x,
        postIt.y + offset.y,
        restArea,
        toolbarBox,
      );
      updatePostIt(postIt.id, clamped);
    },
    [retirePostIt, updatePostIt, restArea, toolbarBox],
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

      <Pad
        onTap={handleCreateNew}
        onDragEnd={handlePadDragEnd}
        nodeRef={padRef}
      />
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
            dragArea={dragArea}
          />
        );
      })}

      <AnimatePresence>
        {isDonePileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
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

            {/* Sort + search toolbar. Sits above the grid; collapses to a
                no-op surface when the pile is empty (the empty state
                below renders instead). */}
            {state.done.length > 0 && (
              <div className="px-8 pb-4 flex flex-wrap items-center gap-3">
                <span className="text-foreground/60 text-sm font-medium tabular-nums">
                  {state.done.length} done
                  {doneQuery.trim() &&
                    displayedDone.length !== state.done.length &&
                    ` · ${displayedDone.length} match${displayedDone.length === 1 ? "" : "es"}`}
                </span>
                <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-white border border-border rounded-full px-4 py-2 shadow-sm">
                  <Search size={16} className="text-foreground/40 shrink-0" />
                  <input
                    type="text"
                    value={doneQuery}
                    onChange={(e) => setDoneQuery(e.target.value)}
                    placeholder="Search done notes..."
                    className="bg-transparent border-none outline-none text-foreground text-sm placeholder:text-muted-foreground w-full font-medium"
                  />
                  {doneQuery && (
                    <button
                      onClick={() => setDoneQuery("")}
                      aria-label="Clear search"
                      className="text-foreground/40 hover:text-foreground transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <label className="flex items-center gap-2 text-foreground/60 text-sm">
                  Sort
                  <select
                    value={doneSort}
                    onChange={(e) =>
                      setDoneSort(
                        e.target.value as "newest" | "oldest" | "color",
                      )
                    }
                    className="bg-white border border-border rounded-full px-3 py-2 shadow-sm text-foreground text-sm font-medium outline-none cursor-pointer"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="color">By color</option>
                  </select>
                </label>
              </div>
            )}

            {/* Dashed drop zone is only visually shown while a done card
                is actively being dragged — otherwise the cards would sit
                "over" the dashed line, which looks busy. The ref stays
                attached either way so the hit-test in
                handleDoneCardDragEnd still works. */}
            <RestoreZone
              visible={state.done.length > 0 && isDraggingDoneCard}
              isOver={isOverWallRestore}
              nodeRef={wallRestoreRef}
            />

            <div className="flex-1 overflow-y-auto px-8 pb-8 pt-2 relative z-10">
              {state.done.length === 0 ? (
                <div className="w-full text-center text-foreground/40 text-xl pt-16">
                  Nothing here yet.
                </div>
              ) : displayedDone.length === 0 ? (
                <div className="w-full text-center text-foreground/40 text-base pt-16">
                  No notes match "{doneQuery}".
                </div>
              ) : doneSort === "color" ? (
                // Color sort: ungrouped flat grid. Date grouping doesn't
                // compose with color sort in any way the user would
                // benefit from — they're choosing color as the primary
                // axis, so we honor that and skip the headers.
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-8 auto-rows-min">
                  {displayedDone.map((postIt) => (
                    <DonePileCard
                      key={postIt.id}
                      postIt={postIt}
                      onDragEnd={handleDoneCardDragEnd}
                      onDraggingChange={setIsDraggingDoneCard}
                      onRestore={unretirePostIt}
                      onDelete={deleteDonePostIt}
                    />
                  ))}
                </div>
              ) : (
                // Date-bucketed view. Each section has a sticky header
                // that pins to the top of the scroll container while
                // its items are in view, so the user always knows which
                // time bucket they're scanning. Empty buckets are
                // already pruned in `groupedDone`.
                <div className="space-y-6">
                  {groupedDone.map((group) => (
                    <section key={group.key}>
                      <h3 className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/95 backdrop-blur-sm text-foreground/70 text-sm font-semibold tracking-wide uppercase flex items-baseline gap-1.5">
                        <span>{group.label}</span>
                        <span className="text-foreground/40 tabular-nums font-medium normal-case tracking-normal">
                          ({group.items.length})
                        </span>
                      </h3>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-8 auto-rows-min mt-3">
                        {group.items.map((postIt) => (
                          <DonePileCard
                            key={postIt.id}
                            postIt={postIt}
                            onDragEnd={handleDoneCardDragEnd}
                            onDraggingChange={setIsDraggingDoneCard}
                            onRestore={unretirePostIt}
                            onDelete={deleteDonePostIt}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
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

      <div
        ref={toolbarRef}
        className="absolute top-8 right-8 flex gap-3 z-40"
      >
        {state.wall.length > 1 && (
          <button
            onClick={handleAutoOrganize}
            aria-label="Auto-organize the wall into a tidy grid"
            title="Tidy up"
            className="h-11 w-11 bg-white rounded-full flex items-center justify-center text-foreground/60 hover:text-primary hover:bg-secondary transition-colors border border-border"
          >
            <LayoutGrid size={18} />
          </button>
        )}
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
