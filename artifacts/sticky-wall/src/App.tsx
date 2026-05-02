import React, { useState, useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { usePostItStore, PostIt } from "@/hooks/use-postit-store";
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Search, X } from "lucide-react";
import { toast } from "sonner";

const queryClient = new QueryClient();

const COLORS = ["#D4A5A5", "#B8C9A8", "#A8B5C9", "#E0CC9E", "#C9A48F"];

function generatePostIt(x: number, y: number): PostIt {
  return {
    id: crypto.randomUUID(),
    text: "",
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 16 - 8,
    x,
    y,
    createdAt: Date.now(),
  };
}

function DraggablePostIt({ 
  postIt, 
  onClick, 
  isSearchMatch, 
  isFaded 
}: { 
  postIt: PostIt, 
  onClick: () => void,
  isSearchMatch: boolean,
  isFaded: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: postIt.id,
    data: { type: "postit", postIt },
  });

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
        zIndex: isDragging ? 50 : 10,
      }}
      className={`
        w-48 h-48 shadow-sm flex flex-col p-4 cursor-grab active:cursor-grabbing touch-none
        transition-opacity duration-300
        ${isFaded ? "opacity-30" : "opacity-100"}
        ${isSearchMatch ? "ring-2 ring-white ring-offset-2 ring-offset-black/10 animate-pulse" : ""}
      `}
      animate={isDragging ? { scale: 1.05, boxShadow: "0px 10px 20px rgba(0,0,0,0.15)" } : { scale: 1, boxShadow: "0px 2px 5px rgba(0,0,0,0.05)" }}
      whileHover={{ scale: isDragging ? 1.05 : 1.02 }}
      onClick={(e) => {
        // Only trigger click if not dragging (handled approximately here, though dnd-kit usually prevents onClick during drag)
        if (!isDragging) {
          onClick();
        }
      }}
      {...listeners}
      {...attributes}
      tabIndex={0}
      role="button"
      aria-label={`Sticky note: ${postIt.text || "Empty"}. Press Enter to edit.`}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
    >
      <div className="w-full h-full text-foreground/80 font-medium whitespace-pre-wrap overflow-hidden text-ellipsis text-lg leading-snug">
        {postIt.text}
      </div>
    </motion.div>
  );
}

function DoneZone({ count }: { count: number }) {
  const { isOver, setNodeRef } = useDroppable({
    id: "done-zone",
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        absolute bottom-8 right-8 w-56 h-56 rounded-2xl border-2 border-dashed 
        transition-colors duration-200 flex flex-col items-center justify-center pointer-events-none
        ${isOver ? "border-foreground/30 bg-black/5" : "border-foreground/10 bg-transparent"}
      `}
    >
      <span className="text-foreground/30 font-medium text-lg tracking-wide uppercase">Done</span>
      {count > 0 && (
        <span className="text-foreground/20 text-sm mt-1">{count} items</span>
      )}
    </div>
  );
}

function Pad({ onClick }: { onClick: () => void }) {
  return (
    <div 
      className="absolute bottom-8 left-8 w-48 h-48 cursor-pointer hover:-translate-y-1 transition-transform duration-200"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="New sticky note pad. Click to create a new note."
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
    >
      {/* Fake stacked post-its */}
      <div className="absolute inset-0 bg-[#E0CC9E] rotate-[-4deg] shadow-sm" />
      <div className="absolute inset-0 bg-[#B8C9A8] rotate-[-2deg] shadow-sm" />
      <div className="absolute inset-0 bg-[#D4A5A5] rotate-[2deg] shadow-sm flex items-center justify-center group">
        <span className="text-black/20 text-4xl group-hover:text-black/30 transition-colors">+</span>
      </div>
    </div>
  );
}

function StickyWall() {
  const { state, addPostIt, updatePostIt, deleteWallPostIt, retirePostIt, unretirePostIt, deleteDonePostIt } = usePostItStore();
  const [editingPostIt, setEditingPostIt] = useState<PostIt | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isDonePileOpen, setIsDonePileOpen] = useState(false);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta, over } = event;
    const postIt = active.data.current?.postIt as PostIt | undefined;
    
    if (!postIt) return;

    if (over && over.id === "done-zone") {
      retirePostIt(postIt.id);
    } else {
      updatePostIt(postIt.id, {
        x: postIt.x + delta.x,
        y: postIt.y + delta.y,
      });
    }
  };

  const handleCreateNew = () => {
    if (state.wall.length >= 25) {
      toast("Your wall is getting full. Consider retiring some notes to the done pile.", {
        position: "top-center",
        className: "bg-background border-border text-foreground rounded-xl shadow-md",
      });
    }
    const newX = window.innerWidth / 2 - 96; // Center X minus half post-it width
    const newY = window.innerHeight / 2 - 96; // Center Y minus half post-it height
    const newPostIt = generatePostIt(newX, newY);
    addPostIt(newPostIt);
    setEditingPostIt(newPostIt);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setSearchQuery("");
        setEditingPostIt(null);
        setIsAboutOpen(false);
        setIsDonePileOpen(false);
      }
      if (e.key === 'n' && !editingPostIt && !isSearchOpen && !isAboutOpen && !isDonePileOpen) {
        e.preventDefault();
        handleCreateNew();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && editingPostIt) {
        e.preventDefault();
        retirePostIt(editingPostIt.id);
        setEditingPostIt(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingPostIt, isSearchOpen, isAboutOpen, isDonePileOpen, retirePostIt]);

  return (
    <div className="fixed inset-0 w-full h-full bg-background overflow-hidden select-none">
      <DndContext onDragEnd={handleDragEnd}>
        {/* Empty state hint */}
        {state.wall.length === 0 && state.done.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-foreground/30 text-xl font-medium tracking-wide">
              Pull a note to start thinking...
            </p>
          </div>
        )}

        <Pad onClick={handleCreateNew} />
        
        <DoneZone count={state.done.length} />

        {/* The Wall Notes */}
        {state.wall.map(postIt => {
          const isMatch = searchQuery && postIt.text.toLowerCase().includes(searchQuery.toLowerCase());
          const isFaded = isSearchOpen && searchQuery.length > 0 && !isMatch;
          
          return (
            <DraggablePostIt 
              key={postIt.id} 
              postIt={postIt} 
              onClick={() => setEditingPostIt(postIt)}
              isSearchMatch={!!isMatch}
              isFaded={!!isFaded}
            />
          );
        })}
      </DndContext>

      {/* Done Pile Interactive Stack (Visual representation of done items over the DoneZone) */}
      {state.done.length > 0 && (
        <div 
          className="absolute bottom-12 right-12 w-48 h-48 cursor-pointer hover:scale-105 transition-transform"
          onClick={() => setIsDonePileOpen(true)}
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

      {/* Top right buttons */}
      <div className="absolute top-8 right-8 flex gap-4 z-40">
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          className="w-12 h-12 bg-background/50 backdrop-blur-md rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground/80 transition-colors shadow-sm hover:shadow"
        >
          <Search size={20} />
        </button>
        <button
          onClick={() => setIsAboutOpen(true)}
          className="w-12 h-12 bg-background/50 backdrop-blur-md rounded-full flex items-center justify-center text-foreground/50 hover:text-foreground/80 transition-colors shadow-sm hover:shadow"
        >
          <Info size={20} />
        </button>
      </div>

      {/* Search Overlay */}
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

      {/* Editing Modal */}
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
              layoutId={editingPostIt.id}
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
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!editingPostIt.text.trim()) {
                      // handle empty delete here too if needed, but fine to just close
                    }
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

      {/* Done Pile View */}
      <AnimatePresence>
        {isDonePileOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md">
            <div className="p-8 flex justify-between items-center">
              <h2 className="text-3xl font-bold text-foreground">The Done Pile</h2>
              <button 
                onClick={() => setIsDonePileOpen(false)}
                className="w-12 h-12 bg-white/50 rounded-full flex items-center justify-center hover:bg-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-x-auto p-8 flex items-center gap-8 snap-x">
              {state.done.length === 0 ? (
                <div className="w-full text-center text-foreground/40 text-xl">
                  Nothing here yet.
                </div>
              ) : (
                state.done.map((postIt) => (
                  <motion.div
                    key={postIt.id}
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="shrink-0 snap-center w-72 h-72 shadow-lg p-6 flex flex-col relative group"
                    style={{ backgroundColor: postIt.color }}
                  >
                    <div className="flex-1 text-foreground/80 font-medium text-xl overflow-hidden text-ellipsis whitespace-pre-wrap">
                      {postIt.text}
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          unretirePostIt(postIt.id, window.innerWidth / 2 - 96, window.innerHeight / 2 - 96);
                        }}
                        className="bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-bold hover:bg-white text-foreground transition-colors"
                      >
                        Un-retire
                      </button>
                      <button 
                        onClick={() => deleteDonePostIt(postIt.id)}
                        className="bg-destructive/10 text-destructive backdrop-blur-sm px-4 py-2 rounded-full text-sm font-bold hover:bg-destructive/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* About Panel */}
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
              <div className="space-y-6 text-lg text-foreground/80 font-medium leading-relaxed">
                <p>Welcome to your wall. This is a place for thoughts, not tasks.</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="text-xl">📝</span>
                    <span><strong>Pull</strong> from the pad bottom-left to create a note. (Or press N)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-xl">✋</span>
                    <span><strong>Drag</strong> notes anywhere. Group them however makes sense in your head.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-xl">📥</span>
                    <span><strong>Retire</strong> them to the bottom-right pile when you're done. (Or Cmd+Enter while typing)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-xl">🔍</span>
                    <span><strong>Find</strong> notes instantly with Cmd+F.</span>
                  </li>
                </ul>
                <p className="pt-4 text-foreground/50 text-base">
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
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
