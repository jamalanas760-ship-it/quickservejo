import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Check, FileImage, Layers3, Monitor, Save, Sparkles, Smartphone, Tablet, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THEME, parseMenuTheme, type MenuTheme } from "@/lib/menu-theme";
import { orchestrateSmartMenuDesign } from "@/lib/smart-menu-orchestrator.server";
import { refineSmartMenuElement } from "@/lib/menu-element-intelligence.server";
import { SmartCompositionCanvas, type CompositionElement } from "@/components/manage/SmartCompositionCanvas";
import { cn } from "@/lib/utils";
import "@/components/manage/MenuDesignMobileUX.css";

type Mode = "new" | "reference";
type MobileTab = "brief" | "canvas" | "edit" | "layers";
type ElementId = "hero" | "typography" | "category" | "item-card" | "price" | "imagery" | "background" | "spacing";
type Composition = { concept?: string; artDirection?: string; background?: { color?: string; texture?: string }; elements?: CompositionElement[]; responsive?: { mobile?: string; tablet?: string; desktop?: string }; motion?: { entrance?: string; hover?: string; scroll?: string } };

const moods = ["Editorial", "Modern Levantine", "Quiet Luxury", "Experimental", "Human Crafted", "Photography First"];
const elementLabels: Record<ElementId, string> = { hero: "Hero", typography: "Typography", category: "Category", "item-card": "Item card", price: "Prices", imagery: "Imagery", background: "Background", spacing: "Spacing" };

export function UnifiedMenuStudio({ restaurantId }: { restaurantId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const orchestrate = useServerFn(orchestrateSmartMenuDesign);
  const refine = useServerFn(refineSmartMenuElement);
  const [mode, setMode] = useState<Mode>("new");
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [mood, setMood] = useState("Editorial");
  const [concepts, setConcepts] = useState<Array<{ id: string; theme: string }>>([]);
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [composition, setComposition] = useState<Composition>();
  const [selected, setSelected] = useState<ElementId>("hero");
  const [selectedNode, setSelectedNode] = useState<string>();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("canvas");

  const restaurant = useQuery({
    queryKey: ["unified-menu-studio", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const raw = restaurant.data?.menu_theme;
    if (raw && typeof raw === "object") {
      setTheme(parseMenuTheme(raw));
      setComposition((raw as { composition?: Composition }).composition);
    }
  }, [restaurant.data?.menu_theme]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const encoded: string[] = [];
    for (const file of Array.from(files).slice(0, 5 - references.length)) {
      if (!file.type.startsWith("image/")) continue;
      encoded.push(await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }));
    }
    setReferences(old => [...old, ...encoded].slice(0, 5));
  }

  async function design() {
    setBusy(true);
    try {
      const result = await orchestrate({ data: { restaurantId, brief: brief.trim(), references, direction: references.length ? undefined : mood, language: "en", variationSeed: `${Date.now()}-${crypto.randomUUID?.() ?? Math.random()}` } });
      const next = result.concepts.map(c => ({ id: c.id, theme: c.theme }));
      setConcepts(next);
      setActive(0);
      if (next[0]) {
        const raw = JSON.parse(next[0].theme);
        setTheme(parseMenuTheme(raw));
        setComposition(raw.composition);
      }
      setSelectedNode(undefined);
      setMobileTab("canvas");
      toast.success(references.length ? "Reference rebuilt into 3 directions" : "3 creative directions generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the menu");
    } finally {
      setBusy(false);
    }
  }

  function selectConcept(index: number) {
    const concept = concepts[index];
    if (!concept) return;
    try {
      const raw = JSON.parse(concept.theme);
      setActive(index);
      setTheme(parseMenuTheme(raw));
      setComposition(raw.composition);
      setSelectedNode(undefined);
      setMobileTab("canvas");
    } catch {
      toast.error("This concept could not be loaded.");
    }
  }

  async function refineElement() {
    const clean = instruction.trim();
    if (!clean) return;
    setRefining(true);
    try {
      const result = await refine({ data: { restaurantId, element: selected, instruction: clean, currentTheme: JSON.stringify({ ...theme, composition }) } });
      const raw = JSON.parse(result.theme);
      setTheme(parseMenuTheme(raw));
      setComposition(raw.composition);
      setConcepts(old => old.map((c, i) => i === active ? { ...c, theme: JSON.stringify(raw) } : c));
      setInstruction("");
      setMobileTab("canvas");
      toast.success(`${elementLabels[selected]} refined and preview updated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refine element");
    } finally {
      setRefining(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, composition } }).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["unified-menu-studio", restaurantId] });
      toast.success("Menu design saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function handleCanvasSelect(id: string) {
    setSelectedNode(id);
    const node = composition?.elements?.find(e => e.id === id);
    if (!node) return;
    if (node.type === "image") setSelected("imagery");
    else if (node.type === "price") setSelected("price");
    else if (node.type === "category") setSelected("category");
    else if (node.type === "product") setSelected("item-card");
    else if (["title", "eyebrow", "copy"].includes(node.type)) setSelected("typography");
    else setSelected("hero");
    setMobileTab("edit");
  }

  const CreatePanel = () => (
    <div className="studio-mobile-panel space-y-3">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Create your menu</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("new")} className={cn("min-h-24 rounded-2xl border p-3 text-left", mode === "new" ? "border-black bg-black text-white" : "hover:border-black/30")}><Wand2 className="mb-4 size-5"/><div className="text-sm font-bold">Start fresh</div><p className="mt-1 text-[11px] opacity-55">Create a new visual direction.</p></button>
          <button type="button" onClick={() => setMode("reference")} className={cn("min-h-24 rounded-2xl border p-3 text-left", mode === "reference" ? "border-black bg-black text-white" : "hover:border-black/30")}><FileImage className="mb-4 size-5"/><div className="text-sm font-bold">Match reference</div><p className="mt-1 text-[11px] opacity-55">Rebuild the visual DNA.</p></button>
        </div>
      </section>
      {mode === "reference" && <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><div className="text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Reference images</div><span className="text-xs text-black/40">{references.length}/5</span></div>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => void addFiles(e.target.files)} />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 text-sm font-semibold"><FileImage className="size-4"/>Upload screenshots</button>
        {references.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{references.map((src, i) => <div key={`${src.slice(-24)}-${i}`} className="relative aspect-[3/4] overflow-hidden rounded-xl"><img src={src} alt="Reference" className="h-full w-full object-cover"/><button type="button" aria-label="Remove reference" onClick={() => setReferences(old => old.filter((_, n) => n !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X className="size-3"/></button></div>)}</div>}
      </section>}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Creative brief</div>
        <Textarea value={brief} onFocus={() => setMobileTab("brief")} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onChange={e => setBrief(e.target.value)} placeholder="Describe typography, layout, colors, imagery, animation, spacing and the overall visual style…" className="min-h-32 resize-none rounded-xl text-base" autoComplete="off" spellCheck />
        <div className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Style direction</div>
        <div className="grid grid-cols-2 gap-2">{moods.map(name => <button type="button" key={name} onClick={() => setMood(name)} className={cn("min-h-11 rounded-xl border px-3 text-left text-xs font-semibold", mood === name ? "border-black bg-black text-white" : "hover:bg-black/[.025]")}>{name}</button>)}</div>
        <Button className="mt-4 h-12 w-full rounded-xl" onClick={() => void design()} disabled={busy}>{busy ? <><Sparkles className="mr-2 size-4 animate-pulse"/>Designing…</> : <><Sparkles className="mr-2 size-4"/>{references.length ? "Recreate design" : "Generate menu"}</>}</Button>
      </section>
    </div>
  );

  const EditPanel = () => <section className="studio-mobile-panel rounded-2xl border bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2"><Sparkles className="size-4"/><div className="text-[11px] font-bold uppercase tracking-[.16em] text-black/40">AI editing</div></div>
    <p className="mb-3 text-xs leading-5 text-black/50">Select what you want to change. The AI keeps the rest of the composition intact unless the requested change requires a dependent adjustment.</p>
    <div className="grid grid-cols-2 gap-2">{(Object.keys(elementLabels) as ElementId[]).map(id => <button type="button" key={id} onClick={() => setSelected(id)} className={cn("min-h-10 rounded-xl border px-3 text-left text-xs font-semibold", selected === id ? "border-black bg-black text-white" : "hover:bg-black/[.025]")}>{elementLabels[id]}</button>)}</div>
    <Textarea value={instruction} onChange={e => setInstruction(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder={`Change ${elementLabels[selected].toLowerCase()}…`} className="mt-3 min-h-28 resize-none rounded-xl text-base" />
    <Button className="mt-3 h-11 w-full" onClick={() => void refineElement()} disabled={refining || !instruction.trim()}>{refining ? "Applying changes…" : "Apply with AI"}</Button>
    {selectedNode && <div className="mt-3 rounded-xl bg-black/[.04] p-3 text-xs text-black/55">Selected layer: <strong className="text-black">{composition?.elements?.find(e => e.id === selectedNode)?.text || selectedNode}</strong></div>}
  </section>;

  const LayersPanel = () => <section className="studio-mobile-panel rounded-2xl border bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2"><Layers3 className="size-4"/><div className="text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Editable layers</div></div>
    {!composition?.elements?.length && <div className="rounded-xl bg-black/[.04] p-4 text-sm text-black/50">Generate a design first. Every AI-generated element will appear here as an editable layer.</div>}
    <div className="space-y-1">{(composition?.elements ?? []).map((el, i) => <button type="button" key={el.id} onClick={() => handleCanvasSelect(el.id)} className={cn("flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm", selectedNode === el.id ? "bg-black text-white" : "hover:bg-black/[.05]")}><span className="min-w-0 truncate font-semibold">{el.text || el.type || `Layer ${i + 1}`}</span><span className="ml-2 shrink-0 text-xs opacity-50">{i + 1}</span></button>)}</div>
  </section>;

  const PreviewPanel = () => <main className="studio-preview-panel rounded-2xl border bg-[#dededb] p-2 shadow-sm sm:p-3 lg:p-4">
    <div className="studio-toolbar mb-2 flex items-center justify-between rounded-xl bg-white/90 p-2 backdrop-blur">
      <div className="flex items-center gap-1"><Button size="sm" variant="ghost" className="hidden sm:flex"><Monitor className="size-4"/></Button><Button size="sm" variant="ghost" className="sm:hidden"><Smartphone className="size-4"/></Button><Button size="sm" variant="ghost" className="hidden sm:flex"><Tablet className="size-4"/></Button></div>
      <div className="min-w-0 truncate px-2 text-center text-xs font-semibold text-black/50">{restaurant.data?.name ?? "Restaurant"} · {selectedNode ? "Layer selected" : "Live preview"}</div>
      <div className="text-xs font-semibold text-black/45"><span className="hidden sm:inline">{composition?.elements?.length ?? 0} layers</span><span className="sm:hidden">Live</span></div>
    </div>
    {concepts.length > 0 && <div className="mb-2 grid grid-cols-3 gap-2">{concepts.map((c, i) => <button type="button" key={c.id} onClick={() => selectConcept(i)} className={cn("min-h-12 rounded-xl border bg-white px-2 text-left text-[11px] font-bold", active === i ? "border-black ring-1 ring-black/10" : "text-black/60")}>Concept {i + 1}<span className="ml-1 text-black/30">{i === 0 ? "Best match" : i === 1 ? "Alternative" : "Bold"}</span></button>)}</div>}
    <div className="studio-preview-stage flex items-start justify-center rounded-xl bg-[#c9c9c6] p-2 sm:p-4"><div className="studio-preview-frame"><SmartCompositionCanvas theme={theme} composition={composition} selectedId={selectedNode} onSelect={handleCanvasSelect}/></div></div>
    <div className="mt-2 hidden grid-cols-3 gap-2 sm:grid"><div className="rounded-xl bg-white/75 p-3"><BrainCircuit className="size-4"/><div className="mt-2 text-xs font-bold">AI direction</div></div><div className="rounded-xl bg-white/75 p-3"><Layers3 className="size-4"/><div className="mt-2 text-xs font-bold">Editable layers</div></div><div className="rounded-xl bg-white/75 p-3"><Check className="size-4"/><div className="mt-2 text-xs font-bold">Quality ready</div></div></div>
  </main>;

  return <div className="menu-design-studio min-h-[100dvh]">
    <div className="studio-shell mx-auto w-full max-w-[1680px] px-3 py-3 sm:px-5 lg:px-8 lg:py-5">
      <header className="studio-header mb-3 rounded-2xl border bg-white p-4 shadow-sm lg:p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><h1 className="text-2xl font-black tracking-[-.035em] sm:text-3xl">Menu Design Studio</h1><p className="mt-1 max-w-xl text-sm text-black/50">Create, refine and publish a professional restaurant menu.</p></div><Button className="h-11 shrink-0 rounded-xl px-4" onClick={() => void save()} disabled={saving}><Save className="mr-2 size-4"/>{saving ? "Saving…" : "Save"}</Button></div>
        <div className="studio-stepper mt-4 text-xs font-semibold"><span className="flex h-8 items-center gap-2 rounded-full bg-black px-3 text-white"><span className="grid size-5 place-items-center rounded-full bg-white/20">1</span>Describe</span><span className="h-px w-6 shrink-0 bg-black/10"/><span className={cn("flex h-8 items-center gap-2 rounded-full px-3", concepts.length ? "bg-black/10" : "bg-black/[.04]")}><span className="grid size-5 place-items-center rounded-full bg-black/10">2</span>Create</span><span className="h-px w-6 shrink-0 bg-black/10"/><span className="flex h-8 items-center gap-2 rounded-full bg-black/[.04] px-3"><span className="grid size-5 place-items-center rounded-full bg-black/10">3</span>Customize</span></div>
      </header>
      <div className="hidden gap-3 lg:grid lg:grid-cols-[330px_minmax(0,1fr)_300px] xl:gap-4"><aside className="space-y-3"><CreatePanel/></aside><PreviewPanel/><aside className="space-y-3"><EditPanel/><LayersPanel/></aside></div>
      <div className="lg:hidden">{mobileTab === "brief" && <CreatePanel/>}{mobileTab === "canvas" && <PreviewPanel/>}{mobileTab === "edit" && <EditPanel/>}{mobileTab === "layers" && <LayersPanel/>}</div>
    </div>
    <nav className="studio-bottom-nav"><button type="button" onClick={() => setMobileTab("brief")} className={cn(mobileTab === "brief" && "bg-black text-white")}><Wand2 className="mx-auto mb-1 size-4"/>Create</button><button type="button" onClick={() => setMobileTab("canvas")} className={cn(mobileTab === "canvas" && "bg-black text-white")}><Smartphone className="mx-auto mb-1 size-4"/>Preview</button><button type="button" onClick={() => setMobileTab("edit")} className={cn(mobileTab === "edit" && "bg-black text-white")}><Sparkles className="mx-auto mb-1 size-4"/>Edit</button><button type="button" onClick={() => setMobileTab("layers")} className={cn(mobileTab === "layers" && "bg-black text-white")}><Layers3 className="mx-auto mb-1 size-4"/>Layers</button></nav>
  </div>;
}
