import { useState } from "react";
import { Command, Eye, Grid3X3, Layers3, MousePointer2, Redo2, Sparkles, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { StudioMenuDesigner } from "./StudioMenuDesigner";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "elements", label: "Elements", icon: Grid3X3 },
  { id: "layers", label: "Layers", icon: Layers3 },
] as const;

const AI_DIRECTIONS = [
  ["Luxury editorial", "Create a premium magazine-style menu with strong hierarchy, refined typography, cinematic food photography and generous whitespace."],
  ["Human crafted", "Make it feel designed by an expert restaurant art director: imperfect details, tactile texture, natural spacing and authentic hospitality."],
  ["Match my reference", "Study the uploaded reference for composition, colour, typography, image treatment, spacing and visual rhythm, then create an original menu with the same design DNA."],
  ["Modern Levantine", "Create a contemporary Levantine hospitality identity with warm neutrals, olive or terracotta accents, organic curves and elegant Arabic-English typography."],
  ["Bold poster", "Create a striking food-poster composition with oversized typography, geometric framing, dramatic crops and high-impact realistic photography."],
  ["Surprise me", "Act as a world-class restaurant art director. Make an unexpected but commercially usable menu system with exceptional hierarchy, photography, typography, colour and composition."],
] as const;

function applyAIBrief(prompt: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) {
    toast.error("Open the design brief first");
    return;
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, prompt);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  toast.success("Creative direction added to your brief");
}

/**
 * QuickServe's premium creative-editor shell. Inspired by the workflow patterns
 * of professional visual editors while keeping QuickServe's own visual identity.
 */
export function CanvaAdobeMenuStudio({ restaurantId }: { restaurantId: string }) {
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"]>("select");
  const [zoom, setZoom] = useState(100);
  const [grid, setGrid] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  function record(action: string) {
    setHistory((items) => [...items.slice(0, historyIndex + 1), action].slice(-30));
    setHistoryIndex((value) => value + 1);
  }

  return (
    <div className="relative isolate overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#e9e9e5] text-[#171716] shadow-[0_30px_100px_rgba(0,0,0,.12)]">
      <header className="sticky top-0 z-[60] border-b border-black/[0.07] bg-white/95 px-2.5 py-2.5 backdrop-blur-2xl sm:px-4">
        <div className="flex min-h-10 items-center gap-2">
          <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#171716] text-white shadow-sm sm:size-9"><Sparkles className="size-4" /></div>
          <div className="hidden min-w-0 sm:block">
            <div className="flex items-center gap-2"><span className="text-xs font-bold tracking-tight">QuickServe Creative Studio</span><span className="rounded-full bg-orange-500 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white">Master AI</span></div>
            <p className="text-[9px] text-black/40">Human art direction · intelligent layouts · live menu rendering</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-black/[0.035] p-1">
            {TOOLS.map(({ id, label, icon: Icon }) => <button key={id} type="button" title={label} aria-label={label} onClick={() => { setTool(id); record(label); }} className={cn("grid size-8 place-items-center rounded-lg text-black/45 transition hover:text-black sm:size-8", tool === id && "bg-white text-black shadow-sm")}><Icon className="size-3.5" /></button>)}
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <button type="button" title="Undo" aria-label="Undo" disabled={historyIndex < 0} onClick={() => setHistoryIndex((value) => Math.max(-1, value - 1))} className="grid size-8 place-items-center rounded-lg text-black/40 hover:bg-black/5 disabled:opacity-25"><Undo2 className="size-3.5" /></button>
            <button type="button" title="Redo" aria-label="Redo" disabled={historyIndex >= history.length - 1} onClick={() => setHistoryIndex((value) => Math.min(history.length - 1, value + 1))} className="grid size-8 place-items-center rounded-lg text-black/40 hover:bg-black/5 disabled:opacity-25"><Redo2 className="size-3.5" /></button>
          </div>
          <div className="ms-auto flex items-center gap-1 rounded-xl bg-black/[0.035] p-1">
            <button type="button" title="Toggle grid" aria-label="Toggle grid" onClick={() => setGrid((value) => !value)} className={cn("grid size-8 place-items-center rounded-lg text-black/40 hover:text-black", grid && "bg-white text-black shadow-sm")}><Grid3X3 className="size-3.5" /></button>
            <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(60, value - 10))} className="grid size-8 place-items-center rounded-lg text-black/40 hover:text-black"><ZoomOut className="size-3.5" /></button>
            <span className="hidden min-w-10 text-center text-[9px] font-semibold text-black/45 sm:block">{zoom}%</span>
            <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(140, value + 10))} className="grid size-8 place-items-center rounded-lg text-black/40 hover:text-black"><ZoomIn className="size-3.5" /></button>
            <button type="button" title="Preview" aria-label="Preview" onClick={() => record("Preview")} className="grid size-8 place-items-center rounded-lg text-black/40 hover:text-black"><Eye className="size-3.5" /></button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="me-1 shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-black/35">AI direction</span>
          {AI_DIRECTIONS.map(([label, prompt]) => <button key={label} type="button" onClick={() => applyAIBrief(prompt)} className="shrink-0 rounded-full border border-black/[0.08] bg-white px-2.5 py-1.5 text-[9px] font-semibold text-black/60 transition hover:-translate-y-px hover:border-black/20 hover:text-black active:translate-y-0">{label}</button>)}
        </div>
      </header>

      <div className="border-b border-black/[0.07] bg-[#f7f7f4] px-3 py-2 sm:px-4">
        <div className="mx-auto flex max-w-[1760px] items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-black/[0.07] bg-white px-2.5 py-1.5 shadow-sm"><Sparkles className="size-3 text-orange-500" /><span className="text-[9px] font-bold">AI art director</span></div>
          <span className="shrink-0 text-[9px] text-black/40">Reads your brief + references → proposes composition, visual hierarchy, colour, typography, image treatment and motion.</span>
        </div>
      </div>

      <div className="relative" style={grid ? { backgroundImage: "linear-gradient(rgba(0,0,0,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.035) 1px, transparent 1px)", backgroundSize: "24px 24px" } : undefined}>
        <div className="pointer-events-none absolute left-1/2 top-2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-black/[0.08] bg-white/90 px-3 py-1.5 text-[9px] font-medium text-black/50 shadow-sm backdrop-blur md:flex">
          <Command className="size-3" />{tool === "select" ? "Select and refine" : tool === "elements" ? "Build with elements" : "Organize your visual layers"}
        </div>
        <div className="relative origin-top transition-transform duration-200" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", marginBottom: `${(zoom - 100) * 0.55}px` }}>
          <StudioMenuDesigner restaurantId={restaurantId} />
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-black/[0.07] bg-white/90 px-3 py-2 text-[9px] text-black/40 backdrop-blur-xl sm:px-4">
        <span>Designed for touch · keyboard · iOS · Android · tablet · desktop</span>
        <span className="hidden sm:inline">Ctrl/⌘ Z · Ctrl/⌘ Y · visual-first workflow</span>
      </footer>
    </div>
  );
}
