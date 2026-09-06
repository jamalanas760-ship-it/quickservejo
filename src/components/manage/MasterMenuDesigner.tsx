import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  Layers3,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Upload,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_THEME,
  FONT_LABELS,
  FONT_STACKS,
  LAYOUT_LABELS,
  SIGNATURE_TEMPLATES,
  TEMPLATES,
  parseMenuTheme,
  type FontId,
  type LayoutId,
  type MenuTheme,
} from "@/lib/menu-theme";
import { generateMenuTheme } from "@/lib/theme.functions";
import { cn } from "@/lib/utils";

type PreviewMode = "phone" | "tablet" | "desktop";
type Direction = "create" | "art" | "edit";

type Composition = {
  version?: number;
  concept?: string;
  artDirection?: string;
  languageMode?: "ar" | "en" | "bilingual";
  elements?: Array<Record<string, unknown>>;
  responsive?: Record<string, unknown>;
  motion?: Record<string, unknown>;
  referenceAnalysis?: Record<string, unknown>;
};

type StudioDesign = MenuTheme & {
  composition?: Composition;
};

const DIRECTIONS: Array<{ id: string; label: string; description: string }> = [
  { id: "editorial", label: "Editorial", description: "Magazine rhythm, strong hierarchy, art-directed photography." },
  { id: "levante", label: "Modern Levantine", description: "Warm hospitality, organic shapes and tactile materials." },
  { id: "luxury", label: "Quiet luxury", description: "Restrained palette, elegant type and premium dining mood." },
  { id: "poster", label: "Modern poster", description: "Oversized type, graphic crops and confident contrast." },
  { id: "street", label: "Street food", description: "Fast visual rhythm, bold crops and contemporary energy." },
  { id: "human", label: "Human crafted", description: "Paper texture, imperfect print character and warmth." },
];

const ART_ACTIONS = [
  ["Make premium", "Make the composition more refined and editorial."],
  ["Make creative", "Push the art direction into a surprising visual concept."],
  ["Make human", "Add tactile, handcrafted character without losing clarity."],
  ["Improve hierarchy", "Strengthen typography, scale, spacing and scanning order."],
  ["Improve photography", "Improve image crops, prominence and visual storytelling."],
  ["Improve mobile", "Recompose specifically for small screens and touch."],
  ["Make more Arabic", "Use native Arabic RTL hierarchy and culturally appropriate visual rhythm."],
  ["Match reference", "Reconstruct the attached reference's composition and visual language."],
  ["New concept", "Generate a materially different art direction."],
  ["Surprise me", "Explore a bold, unexpected restaurant menu concept."],
] as const;

function parseVariant(value: string): StudioDesign | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const theme = parseMenuTheme(parsed);
    return { ...theme, composition: parsed.composition as Composition | undefined };
  } catch {
    return null;
  }
}

function safeTheme(value: unknown): StudioDesign {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return { ...parseMenuTheme(raw), composition: raw.composition as Composition | undefined };
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const value = clean.length === 6 ? clean : "000000";
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function MiniArtboard({ theme, restaurantName, selected }: { theme: StudioDesign; restaurantName: string; selected?: boolean }) {
  const image = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=85";
  return (
    <div className={cn("relative aspect-[4/5] overflow-hidden rounded-[22px] border shadow-[0_18px_50px_rgba(0,0,0,.12)] transition-transform", selected && "ring-2 ring-black ring-offset-2")} style={{ background: theme.bg, color: theme.text, fontFamily: FONT_STACKS[theme.bodyFont] }}>
      <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 80% 0%, ${hexToRgba(theme.accent, 0.3)}, transparent 40%)` }} />
      <div className="relative p-5">
        <div className="text-[8px] font-bold uppercase tracking-[.25em]" style={{ color: theme.accent }}>MENU</div>
        <div className="mt-2 max-w-[90%] text-2xl font-black leading-[.95]" style={{ fontFamily: FONT_STACKS[theme.headingFont] }}>{restaurantName}</div>
        <div className="mt-4 overflow-hidden" style={{ borderRadius: theme.radius }}><img src={image} alt="" className="aspect-[1.6] w-full object-cover" /></div>
        <div className="mt-5 flex items-end justify-between gap-3"><div><div className="text-[9px] font-bold uppercase tracking-[.15em]" style={{ color: theme.accent }}>Signature</div><div className="mt-1 text-sm font-bold">Chef's selection</div><div className="mt-1 text-[9px]" style={{ color: theme.muted }}>Prepared fresh with care.</div></div><div className="text-sm font-black" style={{ color: theme.primary }}>8.50 JOD</div></div>
        <div className="mt-5 grid grid-cols-2 gap-2">{[1, 2, 3, 4].map((item) => <div key={item} className="rounded-xl p-2" style={{ background: theme.surface, border: `1px solid ${hexToRgba(theme.text, 0.08)}` }}><div className="text-[9px] font-bold">Dish {item}</div><div className="mt-1 text-[8px]" style={{ color: theme.muted }}>8.50 JOD</div></div>)}</div>
      </div>
    </div>
  );
}

export function MasterMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const generate = useServerFn(generateMenuTheme);
  const queryClient = useQueryClient();
  const referenceRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [variants, setVariants] = useState<StudioDesign[]>([]);
  const [selected, setSelected] = useState(0);
  const [theme, setTheme] = useState<StudioDesign>(DEFAULT_THEME);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const [zoom, setZoom] = useState(90);
  const [activeDirection, setActiveDirection] = useState("editorial");
  const [activeSection, setActiveSection] = useState<Direction>("create");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSynced, setLastSynced] = useState(false);
  const [history, setHistory] = useState<StudioDesign[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const restaurant = useQuery({
    queryKey: ["master-menu-designer", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,slug,logo_url,cover_image_url,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });

  const currentRestaurant = restaurant.data;
  const slug = currentRestaurant?.slug ?? "";
  const previewUrl = slug ? `/preview/${encodeURIComponent(slug)}` : "";

  useEffect(() => {
    if (!currentRestaurant) return;
    const initial = safeTheme(currentRestaurant.menu_theme);
    setTheme(initial);
    setVariants([initial]);
    setHistory([initial]);
    setHistoryIndex(0);
  }, [currentRestaurant]);

  useEffect(() => {
    const frame = previewRef.current;
    if (!frame?.contentWindow) return;
    const payload = { type: "QUICKSERVE_MENU_PREVIEW", version: 1, theme, timestamp: Date.now() };
    const raf = window.requestAnimationFrame(() => frame.contentWindow?.postMessage(payload, window.location.origin));
    return () => window.cancelAnimationFrame(raf);
  }, [theme]);

  function pushHistory(next: StudioDesign) {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), next].slice(-30));
    setHistoryIndex((prev) => Math.min(prev + 1, 29));
  }

  function applyTheme(next: StudioDesign) {
    setTheme(next);
    pushHistory(next);
    setLastSynced(false);
  }

  function readImage(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    if (file.size > 6_000_000) return toast.error("Reference images must be under 6 MB.");
    const reader = new FileReader();
    reader.onload = () => setReferences((prev) => [...prev, String(reader.result)].slice(-5));
    reader.readAsDataURL(file);
  }

  async function generateDesign(tweak?: string) {
    setBusy(true);
    try {
      const result = await generate({ data: { restaurantId, brief, base: activeDirection, tweak, images: references } });
      const parsed = result.variants.map(parseVariant).filter(Boolean) as StudioDesign[];
      if (!parsed.length) throw new Error("No valid design variants were returned.");
      setVariants(parsed);
      setSelected(0);
      applyTheme(parsed[0]!);
      toast.success(result.fallback ? "Created with the built-in art direction fallback." : "Three new concepts are ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate a design.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!currentRestaurant) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme as never }).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["diner"] });
      setLastSynced(true);
      toast.success("Design saved to the live menu.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the design.");
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof MenuTheme>(key: K, value: MenuTheme[K]) {
    applyTheme({ ...theme, [key]: value });
  }

  function selectVariant(index: number) {
    const picked = variants[index];
    if (!picked) return;
    setSelected(index);
    applyTheme(picked);
  }

  function reset() {
    applyTheme(safeTheme(currentRestaurant?.menu_theme));
  }

  function undo() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const next = history[nextIndex];
    if (!next) return;
    setHistoryIndex(nextIndex);
    setTheme(next);
    setLastSynced(false);
  }

  const previewWidth = previewMode === "phone" ? 390 : previewMode === "tablet" ? 768 : 1100;
  const previewHeight = previewMode === "phone" ? 820 : previewMode === "tablet" ? 920 : 760;

  if (restaurant.isPending) return <div className="mx-auto max-w-7xl p-6"><div className="h-[70vh] animate-pulse rounded-[32px] bg-muted" /></div>;
  if (restaurant.isError || !currentRestaurant) return <div className="mx-auto max-w-xl p-10 text-center"><h1 className="text-xl font-bold">Unable to load the restaurant</h1><p className="mt-2 text-sm text-muted-foreground">Check your restaurant access and try again.</p></div>;

  return (
    <div className="min-h-[calc(100vh-120px)] overflow-hidden rounded-[32px] border bg-[#f6f5f2] text-black shadow-[0_20px_70px_rgba(0,0,0,.08)]">
      <div className="border-b bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black text-white"><Sparkles className="size-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-black tracking-tight sm:text-lg">Master Menu Designer</h1><Badge className="rounded-full bg-black text-white">AI Art Studio</Badge></div><p className="truncate text-xs text-black/45">{currentRestaurant.name} · changes preview instantly before saving</p></div></div><div className="flex items-center gap-2"><Badge variant="outline" className={cn("rounded-full", lastSynced && "border-emerald-300 text-emerald-700")}><span className={cn("mr-1.5 inline-block size-1.5 rounded-full bg-amber-400", lastSynced && "bg-emerald-500")} />{lastSynced ? "Live menu synced" : "Draft preview"}</Badge><Button onClick={save} disabled={saving} className="rounded-xl bg-black text-white hover:bg-black/85"><Save className="size-4" /> {saving ? "Saving…" : "Publish design"}</Button></div></div></div>

      <div className="grid min-h-[760px] lg:grid-cols-[350px_minmax(0,1fr)_310px]">
        <aside className="order-2 border-r bg-[#faf9f6] lg:order-1"><div className="flex border-b bg-white">{(["create", "art", "edit"] as Direction[]).map((tab) => <button key={tab} type="button" onClick={() => setActiveSection(tab)} className={cn("flex-1 px-3 py-3 text-xs font-bold capitalize", activeSection === tab ? "border-b-2 border-black text-black" : "text-black/40")}>{tab === "create" ? "Create" : tab === "art" ? "Art direction" : "Edit"}</button>)}</div>
          <div className="max-h-[calc(100vh-250px)] space-y-5 overflow-y-auto p-4">
            {activeSection === "create" && <><section><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[.16em] text-black/45">Creative brief</h2><span className="text-[10px] text-black/35">{brief.length}/6000</span></div><Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe the restaurant mood, cuisine, audience, Arabic/English preference, reference style, photography and what should feel different." className="min-h-28 resize-none rounded-2xl border-black/10 bg-white text-sm" /></section>
              <section><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[.16em] text-black/45">Reference images</h2><Button size="sm" variant="outline" onClick={() => referenceRef.current?.click()} className="h-8 rounded-xl"><ImagePlus className="size-3.5" /> Add</Button></div><input ref={referenceRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) readImage(file); e.currentTarget.value = ""; }} />{references.length === 0 ? <button type="button" onClick={() => referenceRef.current?.click()} className="flex min-h-24 w-full items-center justify-center rounded-2xl border border-dashed border-black/15 bg-white text-xs text-black/40 hover:bg-black/[.02]"><Upload className="mr-2 size-4" /> Add a visual reference</button> : <div className="grid grid-cols-3 gap-2">{references.map((image, index) => <div key={`${image.slice(0, 20)}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border bg-white"><img src={image} alt="" className="size-full object-cover" /><button type="button" onClick={() => setReferences((prev) => prev.filter((_, i) => i !== index))} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"><X className="size-3" /></button></div>)}</div>}</section>
              <section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">Creative directions</div><div className="space-y-2">{DIRECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setActiveDirection(item.id)} className={cn("w-full rounded-2xl border p-3 text-left transition", activeDirection === item.id ? "border-black bg-black text-white" : "border-black/8 bg-white hover:border-black/20")}><div className="flex items-center justify-between"><span className="text-sm font-bold">{item.label}</span><ChevronRight className="size-4 opacity-40" /></div><p className={cn("mt-1 text-[11px] leading-4", activeDirection === item.id ? "text-white/60" : "text-black/45")}>{item.description}</p></button>)}</div><Button onClick={() => void generateDesign()} disabled={busy} className="mt-3 w-full rounded-2xl bg-black text-white hover:bg-black/85"><Wand2 className="size-4" /> {busy ? "Designing…" : "Generate 3 concepts"}</Button></section></>}

            {activeSection === "art" && <><section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">Layout</div><div className="grid grid-cols-2 gap-2">{(Object.keys(LAYOUT_LABELS) as LayoutId[]).map((id) => <button key={id} type="button" onClick={() => updateField("layout", id)} className={cn("rounded-xl border p-2.5 text-left text-[11px]", theme.layout === id ? "border-black bg-black text-white" : "border-black/10 bg-white")}><div className="font-bold">{LAYOUT_LABELS[id].en}</div><div className="mt-0.5 opacity-50">{LAYOUT_LABELS[id].ar}</div></button>)}</div></section>
              <section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">Typography</div><div className="space-y-2">{(Object.keys(FONT_LABELS) as FontId[]).map((id) => <button key={id} type="button" onClick={() => updateField("headingFont", id)} className={cn("flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2.5 text-left", theme.headingFont === id ? "border-black ring-1 ring-black" : "border-black/10")}><span style={{ fontFamily: FONT_STACKS[id] }} className="text-base font-semibold">{FONT_LABELS[id].en}</span><span className="text-[10px] text-black/35">{id}</span></button>)}</div></section>
              <section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">Signature systems</div><div className="grid grid-cols-2 gap-2">{SIGNATURE_TEMPLATES.slice(0, 14).map((id) => <button key={id} type="button" onClick={() => applyTheme(safeTheme(TEMPLATES[id].theme))} className={cn("rounded-xl border bg-white p-2.5 text-left text-[11px]", theme.template === id ? "border-black ring-1 ring-black" : "border-black/10")}><span className="font-bold">{TEMPLATES[id].label.en}</span></button>)}</div></section>
              <section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">Visual controls</div><div className="space-y-3">{(["showImages", "showIcons", "upperTitles", "scriptAccent"] as const).map((key) => <label key={key} className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-3 py-2.5 text-xs font-semibold"><span>{key === "showImages" ? "Photography" : key === "showIcons" ? "Icons" : key === "upperTitles" ? "Uppercase headings" : "Script accent"}</span><input type="checkbox" checked={theme[key]} onChange={(e) => updateField(key, e.target.checked)} className="size-4 accent-black" /></label>)}</div></section></>}

            {activeSection === "edit" && <><section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">AI actions</div><div className="grid grid-cols-1 gap-2">{ART_ACTIONS.map(([label, instruction]) => <button key={label} type="button" disabled={busy} onClick={() => void generateDesign(instruction)} className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-left text-xs font-semibold hover:border-black/25 disabled:opacity-50"><Sparkles className="mr-2 inline size-3.5" />{label}</button>)}</div></section>
              <section><div className="mb-2 text-xs font-black uppercase tracking-[.16em] text-black/45">Layers</div><div className="space-y-2">{(theme.composition?.elements ?? []).slice(0, 12).map((element, index) => <div key={String(element.id ?? index)} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"><Layers3 className="size-3.5 text-black/35" /><span className="truncate">{String(element.type ?? "element")}</span><span className="ml-auto text-[10px] text-black/30">{index + 1}</span></div>)}{!theme.composition?.elements?.length ? <p className="rounded-xl border border-dashed border-black/10 p-3 text-xs text-black/40">Generate a concept to populate editable composition layers.</p> : null}</div></section>
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="rounded-xl" onClick={reset}><RotateCcw className="size-4" /> Reset</Button><Button variant="outline" className="rounded-xl" onClick={undo} disabled={historyIndex <= 0}>Undo</Button></div></>}
          </div>
        </aside>

        <main className="order-1 flex min-h-[760px] flex-col bg-[#ecebe7] lg:order-2"><div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white/80 px-3 py-2 backdrop-blur-xl"><div className="flex items-center gap-1 rounded-xl border bg-white p-1">{([["phone", Smartphone], ["tablet", Tablet], ["desktop", Monitor]] as const).map(([mode, Icon]) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={cn("grid size-8 place-items-center rounded-lg", previewMode === mode ? "bg-black text-white" : "text-black/45 hover:bg-black/5")} title={mode}><Icon className="size-4" /></button>)}</div><div className="flex items-center gap-1 rounded-xl border bg-white p-1"><button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} className="grid size-8 place-items-center rounded-lg"><ZoomOut className="size-4" /></button><span className="w-10 text-center text-xs font-bold">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(130, value + 10))} className="grid size-8 place-items-center rounded-lg"><ZoomIn className="size-4" /></button></div><div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="rounded-xl" onClick={() => window.open(`/r/${slug}`, "_blank", "noopener,noreferrer")}><ExternalLink className="size-4" /> Live menu</Button></div></div>
          <div className="relative flex flex-1 items-center justify-center overflow-auto p-5 sm:p-8">{previewUrl ? <div className="relative transition-all duration-200" style={{ width: previewWidth * zoom / 100, height: previewHeight * zoom / 100 }}><div className={cn("absolute inset-0 overflow-hidden bg-black shadow-[0_30px_90px_rgba(0,0,0,.22)]", previewMode === "phone" ? "rounded-[42px] p-[8px]" : previewMode === "tablet" ? "rounded-[30px] p-[7px]" : "rounded-[18px] p-[5px]")}><div className="relative h-full w-full overflow-hidden bg-white" style={{ borderRadius: previewMode === "phone" ? 34 : previewMode === "tablet" ? 24 : 14 }}><div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2">{previewMode === "phone" ? <div className="h-6 w-28 rounded-full bg-black" /> : null}</div><iframe ref={previewRef} src={previewUrl} title="QuickServe live menu preview" className="size-full border-0" onLoad={() => previewRef.current?.contentWindow?.postMessage({ type: "QUICKSERVE_MENU_PREVIEW", version: 1, theme, timestamp: Date.now() }, window.location.origin)} /></div></div></div> : <div className="text-sm text-black/40">Preview will appear when the restaurant is ready.</div>}</div>
        </main>

        <aside className="order-3 border-l bg-[#faf9f6] p-4"><div className="mb-3 text-xs font-black uppercase tracking-[.16em] text-black/45">Concepts</div><div className="space-y-3">{(variants.length ? variants : [theme]).slice(0, 3).map((variant, index) => <button key={index} type="button" onClick={() => selectVariant(index)} className="block w-full text-left"><MiniArtboard theme={variant} restaurantName={currentRestaurant.name} selected={selected === index} /><div className="mt-2 flex items-center justify-between px-1"><span className="text-xs font-bold">Concept {index + 1}</span>{selected === index ? <Check className="size-4" /> : null}</div></button>)}</div><div className="mt-5 rounded-2xl border border-black/8 bg-white p-3 text-xs leading-5 text-black/50"><div className="font-bold text-black/70">Live sync</div><p className="mt-1">The preview iframe stays mounted while you edit. Draft updates are sent with postMessage without reloading the preview.</p></div></aside>
      </div>
    </div>
  );
}
