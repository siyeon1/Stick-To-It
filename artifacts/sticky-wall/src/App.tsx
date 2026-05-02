import { useState, useEffect, useRef, useCallback } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import NotFound from "@/pages/not-found";
import { usePostItStore, PostIt } from "@/hooks/use-postit-store";
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Search, X, Move } from "lucide-react";

const queryClient = new QueryClient();

const COLORS = ["#D4A5A5", "#B8C9A8", "#A8B5C9", "#E0CC9E", "#C9A48F"];
const NOTE_SIZE = 192;
const PAD_INSET = 32;
const NUDGE_PX = 16;

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
  onFocusNote: () => void;
  onBlurNote: () => void;
  isFocused: boolean;
  isPicked: boolean;
  isSearchMatch: boolean;
  isFaded: boolean;
};

function DraggablePostIt({
  postIt,
  onOpenEditor,
  onPickRequested,
  onFocusNote,
  onBlurNote,
  isFocused,
  isPicked,
  isSearchMatch,
  isFaded,
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
        ${isSearchMatch ? "ring-2 ring-white ring-offset-2 ring-offset-black/10 animate-pulse" : ""}
        ${isFocused ? "outline outline-2 outline-offset-2 outline-foreground/40" : ""}
        ${isPicked ? "ring-4 ring-foreground/50 shadow-2xl" : ""}
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
      aria-label={`Sticky note: ${postIt.text || "Empty"}. Enter to edit, arrow keys to nudge, Backspace to retire, M to pick up.`}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOpenEditor();
        }
      }}
    >
      <div className="w-full h-full text-foreground/80 font-medium whitespace-pre-wrap overflow-hidden text-ellipsis text-lg leading-snug">
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
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/5 hover:bg-black/15 flex items-center justify-center text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        <Move size={14} />
      </button>
    </motion.div>
  );
}

function DoneZone({
  count,
  isPickActive,
  onPickDrop,
}: {
  count: number;
  isPickActive: boolean;
  onPickDrop: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "done-zone" });

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
        absolute bottom-8 right-8 w-56 h-56 rounded-2xl border-2 border-dashed
        transition-colors duration-200 flex flex-col items-center justify-center
        ${isPickActive ? "pointer-events-auto cursor-pointer" : "pointer-events-none"}
        ${isOver || isPickActive ? "border-foreground/30 bg-black/5" : "border-foreground/10 bg-transparent"}
      `}
    >
      <span className="text-foreground/30 font-medium text-lg tracking-wide uppercase">
        {isPickActive ? "Tap to retire" : "Done"}
      </span>
      {count > 0 && !isPickActive && (
        <span className="text-foreground/20 text-sm mt-1">{count} items</span>
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

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : {};

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
      <div className="absolute inset-0 bg-[#E0CC9E] rotate-[-4deg] shadow-sm" />
      <div className="absolute inset-0 bg-[#B8C9A8] rotate-[-2deg] shadow-sm" />
      <div className="absolute inset-0 bg-[#D4A5A5] rotate-[2deg] shadow-sm flex items-center justify-center group">
        <span className="text-black/20 text-4xl group-hover:text-black/30 transition-colors">
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
      <div className="flex-1 text-foreground/80 font-medium text-xl overflow-hidden text-ellipsis whitespace-pre-wrap pointer-events-none">
        {postIt.text}
      </div>
      <div className="text-foreground/40 text-xs font-medium pt-2 pointer-events-none">
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
      className={`absolute inset-x-8 top-24 bottom-32 rounded-2xl border-2 border-dashed pointer-events-none transition-colors flex items-center justify-center
        ${isOver ? "border-foreground/40 bg-black/5" : "border-foreground/15"}`}
    >
      <span className="text-foreground/30 font-medium text-lg tracking-wide uppercase">
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

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
      setEditingPostIt(newPostIt);
    },
    [addPostIt],
  );

  const handleCreateNew = useCallback(() => {
    createAt(window.innerWidth / 2 - NOTE_SIZE / 2, window.innerHeight / 2 - NOTE_SIZE / 2);
  }, [createAt]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta, over } = event;
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

      if (focusedId) {
        const note = stateRef.current.wall.find((p) => p.id === focusedId);
        if (note) {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            updatePostIt(focusedId, { x: note.x - NUDGE_PX });
            return;
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            updatePostIt(focusedId, { x: note.x + NUDGE_PX });
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            updatePostIt(focusedId, { y: note.y - NUDGE_PX });
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            updatePostIt(focusedId, { y: note.y + NUDGE_PX });
            return;
          }
          if (e.key === "Backspace" || e.key === "Delete" || ((e.metaKey || e.ctrlKey) && e.key === "Enter")) {
            e.preventDefault();
            retirePostIt(focusedId);
            setFocusedId(null);
            toast("Sent to the done pile", { position: "bottom-center" });
            return;
          }
          if (e.key === "m" || e.key === "M") {
            e.preventDefault();
            setPickedId(focusedId);
            toast("Picked up. Tap anywhere on the wall to place it.", {
              position: "top-center",
            });
            return;
          }
        }
      }

      if (e.key === "n" || e.key === "N") {
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
    focusedId,
    retirePostIt,
    updatePostIt,
    handleCreateNew,
  ]);

  return (
    <div
      className="fixed inset-0 w-full h-full bg-background overflow-hidden select-none"
      onClick={handleWallClickForPick}
    >
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {state.wall.length === 0 && state.done.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-foreground/30 text-xl font-medium tracking-wide">
              Pull a note to start thinking...
            </p>
          </div>
        )}

        <Pad onClick={handleCreateNew} />
        <DoneZone
          count={state.done.length}
          isPickActive={!!pickedId}
          onPickDrop={() => {
            if (!pickedId) return;
            retirePostIt(pickedId);
            toast("Sent to the done pile", { position: "bottom-center" });
            setPickedId(null);
          }}
        />

        {state.wall.map((postIt) => {
          const isMatch =
            searchQuery && postIt.text.toLowerCase().includes(searchQuery.toLowerCase());
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
                toast("Picked up. Tap the wall to place, or the done area to retire.", {
                  position: "top-center",
                });
              }}
              onFocusNote={() => setFocusedId(postIt.id)}
              onBlurNote={() => setFocusedId((cur) => (cur === postIt.id ? null : cur))}
              isFocused={focusedId === postIt.id}
              isPicked={pickedId === postIt.id}
              isSearchMatch={!!isMatch}
              isFaded={!!isFaded}
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
                <h2 className="text-3xl font-bold text-foreground">The Done Pile</h2>
                <button
                  onClick={() => setIsDonePileOpen(false)}
                  aria-label="Close done pile"
                  className="w-12 h-12 bg-white/50 rounded-full flex items-center justify-center hover:bg-white transition-colors"
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
                          className="bg-white/70 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold hover:bg-white text-foreground transition-colors"
                        >
                          Un-retire
                        </button>
                        <button
                          onClick={() => deleteDonePostIt(postIt.id)}
                          className="bg-destructive/10 text-destructive backdrop-blur-sm px-3 py-1.5 rounded-full text-xs font-bold hover:bg-destructive/20 transition-colors"
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
            <span className="bg-background/80 text-foreground px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm shadow-sm">
              Open Pile
            </span>
          </div>
        </div>
      )}

      {pickedId && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 bg-foreground text-background px-4 py-2 rounded-full shadow-lg text-sm font-medium pointer-events-none">
          Tap the wall to place, the done area to retire, or press Esc to cancel.
        </div>
      )}

      <div className="absolute top-8 right-8 flex gap-4 z-40">
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          aria-label="Search notes"
          className="w-12 h-12 bg-background/50 backdrop-blur-md rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground/80 transition-colors shadow-sm hover:shadow"
        >
          <Search size={20} />
        </button>
        <button
          onClick={() => setIsAboutOpen(true)}
          aria-label="About this wall"
          className="w-12 h-12 bg-background/50 backdrop-blur-md rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground/80 transition-colors shadow-sm hover:shadow"
        >
          <Info size={20} />
        </button>
      </div>

      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 right-8 z-40 bg-white/80 backdrop-blur-xl p-2 rounded-2xl shadow-xl border border-border/50 w-72"
          >
            <input
              autoFocus
              type="text"
              placeholder="Find a thought..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-foreground px-4 py-2 text-lg placeholder:text-foreground/30 font-medium"
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
              <textarea
                autoFocus
                className="w-full h-full bg-transparent border-none outline-none resize-none text-foreground/90 font-medium text-2xl leading-relaxed placeholder:text-foreground/30"
                placeholder="Type something..."
                value={editingPostIt.text}
                maxLength={200}
                onChange={(e) => {
                  const newText = e.target.value;
                  setEditingPostIt({ ...editingPostIt, text: newText });
                  updatePostIt(editingPostIt.id, { text: newText });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !(e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    setEditingPostIt(null);
                  }
                }}
              />
              <div className="absolute bottom-4 right-6 flex items-center gap-4 text-foreground/40 font-medium text-sm">
                <span>{editingPostIt.text.length}/200</span>
                <button
                  onClick={() => {
                    retirePostIt(editingPostIt.id);
                    setEditingPostIt(null);
                  }}
                  className="hover:text-foreground/80 transition-colors"
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
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
              onClick={() => setIsAboutOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-[480px] bg-white rounded-3xl shadow-2xl p-10 z-10 text-foreground"
            >
              <h2 className="text-2xl font-bold mb-6">About this wall</h2>
              <div className="space-y-5 text-base text-foreground/80 font-medium leading-relaxed">
                <p>Welcome to your wall. This is a place for thoughts, not tasks.</p>
                <ul className="space-y-3">
                  <li>
                    <strong>Click</strong> the pad bottom-left to spawn a note in the
                    middle, or <strong>drag</strong> from the pad to drop one wherever
                    you want. (Or press N.)
                  </li>
                  <li>
                    <strong>Drag</strong> notes anywhere. On touch, long-press a note
                    or tap its <em>move</em> handle, then tap the wall to place it.
                  </li>
                  <li>
                    With a note focused, the <strong>arrow keys</strong> nudge it,{" "}
                    <strong>Backspace</strong> or <strong>Cmd/Ctrl+Enter</strong>{" "}
                    retires it, and <strong>M</strong> picks it up to move.
                  </li>
                  <li>
                    <strong>Retire</strong> a note by dragging it onto the bottom-right
                    pile. Open the pile and <strong>drag a card back onto the wall</strong>{" "}
                    to bring it back.
                  </li>
                  <li>
                    <strong>Find</strong> notes instantly with Cmd/Ctrl+F.
                  </li>
                </ul>
                <p className="pt-2 text-foreground/50 text-sm">
                  Everything stays right where you leave it.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
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
          className: "bg-background border-border text-foreground rounded-xl shadow-md",
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
