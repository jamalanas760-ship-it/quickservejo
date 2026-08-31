import { useEffect, useState } from "react";
import { Command, Eye, Grid3X3, Layers3, MousePointer2, Redo2, Sparkles, Undo2, ZoomIn, ZoomOut } from "lucide-react";

import { StudioMenuDesigner } from "./StudioMenuDesigner";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "elements", label: "Elements", icon: Grid3X3 },
  { id: "layers", label: "Layers", icon: Layers3 },
] as const;

/**
 * Professional creative-workspace chrome inspired by modern visual editors.
 * It deliberately uses QuickServe's own visual language rather than cloning
 * any third-party product UI.
 */
export function CanvaAdobeMenuStudio({ restaurantId }: { restaurantId: string }) {
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"]>("select");
  const [zoom, setZoom] = useState(100);
  const [grid, setGrid] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        setHistoryIndex((value) => Math.max(-1, value - 1));
      }
      if (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        setHistoryIndex((value) => Math.min(history.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history.length]);

  function record(action: string) {
    setHistory((items) => [...items.slice(0, historyIndex + 1), action].slice(-30));
    setHistoryIndex((value) => value + 1);
  }

  return (
    <div className="relative isolate overflow-hidden rounded-[26px] border border-black/[0.07] bg-[#eeeee9] shadow-[0_24px_80px_rgba(0,0,0,.10)]">
      <div className="flex min-h-12 items-center gap-1.5 border-b border-black/[0.07] bg-white/95 px-2.5 py-2 backdrop-blur-xl sm:px-3">
        <div className="hidden items-center gap-1.5 pr-2 sm:flex">
          <div className="grid size-7 place-items-center rounded-lg bg-[#171716] text-white"><Sparkles className="size-3.5" /></div>
          <span className="text-xs font-bold tracking-tight">Creative Workspace</span>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-[#f4f4f1] p-1">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" title={label} onClick={() => { setTool(id); record(label); }} className={cn("grid size-8 place-items-center rounded-lg text-black/45 transition hover:text-black", tool === id && "bg-white text-black shadow-sm")}>
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        <div className="mx-1 hidden h-6 w-px bg-black/10 sm:block" />
        <button type="button" title="Undo" disabled={historyIndex < 0} onClick={() => setHistoryIndex((value) => Math.max(-1, value - 1))} className="grid size-8 place-items-center rounded-lg text-black/45 hover:bg-black/5 disabled:opacity-30"><Undo2 className="size-4" /></button>
        <button type="button" title="Redo" disabled={historyIndex >= history.length - 1} onClick={() => setHistoryIndex((value) => Math.min(history.length - 1, value + 1))} className="grid size-8 place-items-center rounded-lg text-black/45 hover:bg-black/5 disabled:opacity-30"><Redo2 className="size-4" /></button>
        <div className="ms-auto flex items-center gap-1 rounded-xl bg-[#f4f4f1] p-1">
          <button type="button" title="Toggle grid" onClick={() => setGrid((value) => !value)} className={cn("grid size-8 place-items-center rounded-lg text-black/45 hover:text-black", grid && "bg-white text-black shadow-sm")}><Grid3X3 className="size-4" /></button>
          <button type="button" title="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))} className="grid size-8 place-items-center rounded-lg text-black/45 hover:text-black"><ZoomOut className="size-4" /></button>
          <span className="hidden min-w-12 text-center text-[10px] font-semibold text-black/55 sm:block">{zoom}%</span>
          <button type="button" title="Zoom in" onClick={() => setZoom((value) => Math.min(160, value + 10))} className="grid size-8 place-items-center rounded-lg text-black/45 hover:text-black"><ZoomIn className="size-4" /></button>
          <button type="button" title="Preview" onClick={() => record("Preview")} className="grid size-8 place-items-center rounded-lg text-black/45 hover:text-black"><Eye className="size-4" /></button>
        </div>
      </div>

      <div className="relative" style={grid ? { backgroundImage: "linear-gradient(rgba(0,0,0,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.035) 1px, transparent 1px)", backgroundSize: "24px 24px" } : undefined}>
        <div className="pointer-events-none absolute left-1/2 top-2 z-20 hidden -translate-x-1/2 items-center gap-2 rounded-full border bg-white/90 px-3 py-1.5 text-[10px] font-medium text-black/55 shadow-sm backdrop-blur md:flex">
          <Command className="size-3" />
          {tool === "select" ? "Select and refine your composition" : tool === "elements" ? "Build with visual elements" : "Manage the visual layer stack"}
        </div>
        <div className="relative origin-top transition-transform duration-200" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", marginBottom: `${(zoom - 100) * 0.55}px` }}>
          <StudioMenuDesigner restaurantId={restaurantId} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-black/[0.07] bg-white/90 px-3 py-2 text-[10px] text-black/45 backdrop-blur-xl sm:px-4">
        <span>Human-crafted composition · responsive artboard · keyboard shortcuts</span>
        <span className="hidden sm:inline">⌘/Ctrl Z · ⌘/Ctrl Y</span>
      </div>
    </div>
  );
}
