import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Check, ExternalLink, FileImage, Layers3, Minus, Plus, Save, Sparkles, Smartphone, Tablet, Monitor, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THEME, parseMenuTheme, type MenuTheme } from "@/lib/menu-theme";
import { orchestrateSmartMenuDesign } from "@/lib/smart-menu-orchestrator.server";
import { refineSmartMenuElement } from "@/lib/menu-element-intelligence.server";
import { publishMenuThemeBridge } from "@/lib/menu-theme-bridge";
import { cn } from "@/lib/utils";
import "@/components/manage/MenuDesignMobileUX.css";

type Mode = "new" | "reference";
type MobileTab = "brief" | "canvas" | "edit" | "layers";
type Device = "desktop" | "tablet" | "iphone";
type ElementId = "hero" | "typography" | "category" | "item-card" | "price" | "imagery" | "background" | "spacing";
type Composition = { concept?: string; artDirection?: string; background?: { color?: string; texture?: string }; elements?: Record<string, any>[]; responsive?: { mobile?: string; tablet?: string; desktop?: string }; motion?: { entrance?: string; hover?: string; scroll?: string } };
type MenuItem = { name_en?:string|null; name_ar?:string|null; description_en?:string|null; description_ar?:string|null; price?:number|string|null; image_url?:string|null };

const moods = ["Editorial", "Modern Levantine", "Quiet Luxury", "Experimental", "Human Crafted", "Photography First"];
const elementLabels: Record<ElementId, string> = { hero: "Hero", typography: "Typography", category: "Category", "item-card": "Item card", price: "Prices", imagery: "Imagery", background: "Background", spacing: "Spacing" };

export function UnifiedMenuStudio({ restaurantId }: { restaurantId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const liveWindowRef = useRef<Window | null>(null);
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
  const generationLockRef = useRef(false);
  const generationIdRef = useRef(0);
  const generationLockRef = useRef(false);
  const generationIdRef = useRef(0);
  const generationLockRef = useRef(false);
  const generationIdRef = useRef(0);
  const generationLockRef = useRef(false);
  const generationIdRef = useRef(0);
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("canvas");
  const [device, setDevice] = useState<Device>("iphone");
  const [zoom, setZoom] = useState(72);

  const restaurant = useQuery({
    queryKey: ["unified-menu-studio", restaurantId],
    queryFn: async () => {
      const [{ data: restaurantData, error: restaurantError }, { data: menuData, error: menuError }] = await Promise.all([
        supabase.from("restaurants").select("id,name,slug,logo_url,cover_image_url,description_ar,description_en,menu_theme,currency").eq("id", restaurantId).single(),
        supabase.from("menu_items").select("name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(12),
      ]);
      if (restaurantError) throw restaurantError;
      if (menuError) throw menuError;
      return { ...restaurantData, menuItems: (menuData ?? []) as MenuItem[] };
    },
  });

  useEffect(() => {
    const raw = restaurant.data?.menu_theme;
    if (raw && typeof raw === "object") {
      setTheme(parseMenuTheme(raw));
      setComposition((raw as { composition?: Composition }).composition);
    }
  }, [restaurant.data?.menu_theme]);

  useEffect(() => () => { if (liveWindowRef.current && !liveWindowRef.current.closed) liveWindowRef.current.close(); }, []);

  const liveOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const liveMenuUrl = restaurant.data?.slug && liveOrigin ? `${liveOrigin}/r/${encodeURIComponent(restaurant.data.slug)}` : "";

  useEffect(() => {
    if (!liveWindowRef.current || liveWindowRef.current.closed) return;
    publishMenuThemeBridge(restaurantId, { ...theme, composition }, liveWindowRef.current);
  }, [restaurantId, theme, composition]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const encoded: string[] = [];
    for (const file of Array.from(files).slice(0, 5 - references.length)) {
      if (!file.type.startsWith("image/")) continue;
      encoded.push(await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }));
    }
    setReferences(old => [...old, ...encoded].slice(0, 5));
  }

  async function design() {
    if (generationLockRef.current) { toast.info("A design is already being generated. Please wait for the current result."); return; }
    generationLockRef.current = true;
    const generationId = ++generationIdRef.current;
    setBusy(true);
    try {
      const result = await orchestrate({ data: { restaurantId, brief: brief.trim(), references, direction: references.length ? undefined : mood, language: "en", variationSeed: `${Date.now()}-${crypto.randomUUID?.() ?? Math.random()}` } });
      if (generationId !== generationIdRef.current) return;
      if (generationId !== generationIdRef.current) return;
      if (generationId !== generationIdRef.current) return;
      if (generationId !== generationIdRef.current) return;
      const next = result.concepts.map(c => ({ id: c.id, theme: c.theme }));
      setConcepts(next); setActive(0);
      if (next[0]) { const raw = JSON.parse(next[0].theme); setTheme(parseMenuTheme(raw)); setComposition(raw.composition); }
      setSelectedNode(undefined); setMobileTab("canvas");
      toast.success(references.length ? "Reference rebuilt into 3 directions" : "3 creative directions generated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create the menu"); }
    finally { generationLockRef.current = false; setBusy(false); }
  }

  function selectConcept(index: number) {
    const concept = concepts[index]; if (!concept) return;
    try { const raw = JSON.parse(concept.theme); setActive(index); setTheme(parseMenuTheme(raw)); setComposition(raw.composition); setSelectedNode(undefined); setMobileTab("canvas"); }
    catch { toast.error("This concept could not be loaded."); }
  }

  async function refineElement() {
    const clean = instruction.trim(); if (!clean) return;
    setRefining(true);
    try {
      const result = await refine({ data: { restaurantId, element: selected, instruction: clean, currentTheme: JSON.stringify({ ...theme, composition }) } });
      const raw = JSON.parse(result.theme); setTheme(parseMenuTheme(raw)); setComposition(raw.composition);
      setConcepts(old => old.map((c, i) => i === active ? { ...c, theme: JSON.stringify(raw) } : c));
      setInstruction(""); setMobileTab("canvas"); toast.success(`${elementLabels[selected]} refined and preview updated`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not refine element"); }
    finally { setRefining(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: { ...theme, composition } as any }).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["unified-menu-studio", restaurantId] });
      if (liveWindowRef.current && !liveWindowRef.current.closed) publishMenuThemeBridge(restaurantId, { ...theme, composition }, liveWindowRef.current);
      toast.success("Menu design saved and published to live preview");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
    finally { setSaving(false); }
  }

  function openLiveMenu() {
    if (!liveMenuUrl) { toast.error("Restaurant public URL is not available yet."); return; }
    const existing = liveWindowRef.current;
    const target = existing && !existing.closed ? existing : window.open(liveMenuUrl, "quickserve-live-menu", "popup,width=430,height=900,resizable=yes,scrollbars=yes");
    if (!target) { toast.error("Please allow pop-ups to open the live menu."); return; }
    liveWindowRef.current = target; target.focus();
    window.setTimeout(() => publishMenuThemeBridge(restaurantId, { ...theme, composition }, target), 300);
    toast.success("Live menu connected — theme changes sync instantly");
  }

  function handleCanvasSelect(id: string) {
    setSelectedNode(id); const node = composition?.elements?.find((e) => Boolean(e && typeof e === "object" && (e as Record<string, unknown>).id === id)) as Record<string, unknown> | undefined; if (!node) return;
    if (node.type === "image") setSelected("imagery"); else if (node.type === "price") setSelected("price"); else if (node.type === "category") setSelected("category"); else if (node.type === "product") setSelected("item-card"); else if (["title", "eyebrow", "copy"].includes(node.type)) setSelected("typography"); else setSelected("hero");
    setMobileTab("edit");
  }

  const CreatePanel = () => <div className="studio-mobile-panel space-y-3">
    <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-3 text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Create your menu</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setMode("new")} className={cn("min-h-24 rounded-2xl border p-3 text-left",mode==="new"?"border-black bg-black text-white":"hover:border-black/30")}><Wand2 className="mb-4 size-5"/><div className="text-sm font-bold">Start fresh</div><p className="mt-1 text-[11px] opacity-55">Create a new visual direction.</p></button><button type="button" onClick={()=>setMode("reference")} className={cn("min-h-24 rounded-2xl border p-3 text-left",mode==="reference"?"border-black bg-black text-white":"hover:border-black/30")}><FileImage className="mb-4 size-5"/><div className="text-sm font-bold">Match reference</div><p className="mt-1 text-[11px] opacity-55">Rebuild the visual DNA.</p></button></div></section>
    {mode === "reference" && <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div className="text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Reference images</div><span className="text-xs text-black/40">{references.length}/5</span></div><input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>void addFiles(e.target.files)}/><button type="button" onClick={()=>inputRef.current?.click()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 text-sm font-semibold"><FileImage className="size-4"/>Upload screenshots</button>{references.length>0&&<div className="mt-3 grid grid-cols-3 gap-2">{references.map((src,i)=><div key={`${src.slice(-24)}-${i}`} className="relative aspect-[3/4] overflow-hidden rounded-xl"><img src={src} alt="Reference" className="h-full w-full object-cover"/><button type="button" aria-label="Remove reference" onClick={()=>setReferences(old=>old.filter((_,n)=>n!==i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><X className="size-3"/></button></div>)}</div>}</section>}
    <section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Creative brief</div><Textarea value={brief} onFocus={()=>setMobileTab("brief")} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={e=>setBrief(e.target.value)} placeholder="Describe typography, layout, colors, imagery, animation, spacing and the overall visual style…" className="min-h-32 resize-none rounded-xl text-base" autoComplete="off" spellCheck/><div className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Style direction</div><div className="grid grid-cols-2 gap-2">{moods.map(name=><button type="button" key={name} onClick={()=>setMood(name)} className={cn("min-h-11 rounded-xl border px-3 text-left text-xs font-semibold",mood===name?"border-black bg-black text-white":"hover:bg-black/[.025]")}>{name}</button>)}</div><Button className="mt-4 h-12 w-full rounded-xl" onClick={()=>void design()} disabled={busy}>{busy?<><Sparkles className="mr-2 size-4 animate-pulse"/>Designing…</>:<><Sparkles className="mr-2 size-4"/>{references.length?"Recreate design":"Generate menu"}</>}</Button></section>
  </div>;

  const EditPanel = () => <section className="studio-mobile-panel rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Sparkles className="size-4"/><div className="text-[11px] font-bold uppercase tracking-[.16em] text-black/40">AI editing</div></div><p className="mb-3 text-xs leading-5 text-black/50">Select an element, describe the change, and only the necessary parts are redesigned.</p><div className="grid grid-cols-2 gap-2">{(Object.keys(elementLabels) as ElementId[]).map(id=><button type="button" key={id} onClick={()=>setSelected(id)} className={cn("min-h-10 rounded-xl border px-3 text-left text-xs font-semibold",selected===id?"border-black bg-black text-white":"hover:bg-black/[.025]")}>{elementLabels[id]}</button>)}</div><Textarea value={instruction} onChange={e=>setInstruction(e.target.value)} onKeyDown={e=>e.stopPropagation()} placeholder={`Change ${elementLabels[selected].toLowerCase()}…`} className="mt-3 min-h-28 resize-none rounded-xl text-base"/><Button className="mt-3 h-11 w-full" onClick={()=>void refineElement()} disabled={refining||!instruction.trim()}>{refining?"Applying changes…":"Apply with AI"}</Button>{selectedNode&&<div className="mt-3 rounded-xl bg-black/[.04] p-3 text-xs text-black/55">Selected layer: <strong className="text-black">{(composition?.elements?.find((e:any)=>e.id===selectedNode) as any)?.text||selectedNode}</strong></div>}</section>;
  const LayersPanel = () => <section className="studio-mobile-panel rounded-2xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Layers3 className="size-4"/><div className="text-[11px] font-bold uppercase tracking-[.16em] text-black/40">Editable layers</div></div>{!composition?.elements?.length&&<div className="rounded-xl bg-black/[.04] p-4 text-sm text-black/50">Generate a design first. AI-generated elements will appear here as editable layers.</div>}<div className="space-y-1">{(composition?.elements??[]).map((el:any,i)=><button type="button" key={el.id} onClick={()=>handleCanvasSelect(el.id)} className={cn("flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm",selectedNode===el.id?"bg-black text-white":"hover:bg-black/[.05]")}><span className="min-w-0 truncate font-semibold">{el.text||el.type||`Layer ${i+1}`}</span><span className="ml-2 shrink-0 text-xs opacity-50">{i+1}</span></button>)}</div></section>;

  const PreviewPanel = () => <main className="studio-preview-panel rounded-2xl border bg-[#dededb] p-2 shadow-sm sm:p-3 lg:p-4">
    <div className="studio-toolbar mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/90 p-2 backdrop-blur">
      <div className="flex items-center gap-1 rounded-lg bg-black/[.05] p-1">{([["desktop",Monitor,"Desktop"],["tablet",Tablet,"Tablet"],["iphone",Smartphone,"iPhone"]] as const).map(([key,Icon,label])=><button key={key} type="button" onClick={()=>setDevice(key)} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold",device===key?"bg-black text-white shadow-sm":"text-black/55 hover:bg-white")}><Icon className="size-3.5"/><span className="hidden sm:inline">{label}</span></button>)}</div>
      <div className="flex items-center gap-1 rounded-lg bg-black/[.05] p-1"><button type="button" aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(40,v-8))} className="grid size-8 place-items-center rounded-md hover:bg-white"><Minus className="size-3.5"/></button><span className="w-12 text-center text-[11px] font-bold text-black/55">{zoom}%</span><button type="button" aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(120,v+8))} className="grid size-8 place-items-center rounded-md hover:bg-white"><Plus className="size-3.5"/></button></div>
    </div>
    {concepts.length>0&&<div className="mb-2 grid grid-cols-3 gap-2">{concepts.map((c,i)=><button type="button" key={c.id} onClick={()=>selectConcept(i)} className={cn("min-h-12 rounded-xl border bg-white px-2 text-left text-[11px] font-bold",active===i?"border-black ring-1 ring-black/10":"text-black/60")}>Concept {i+1}<span className="ml-1 text-black/30">{i===0?"Best match":i===1?"Alternative":"Bold"}</span></button>)}</div>}
    <div className="studio-preview-stage flex min-h-[640px] items-start justify-center overflow-auto rounded-xl bg-[#c9c9c6] p-3 sm:p-6">
      {!liveMenuUrl ? <div className="grid min-h-[520px] place-items-center text-center text-sm text-black/45">Connect a restaurant to preview the live menu.</div> : device === "iphone" ? <div className="relative w-[390px] max-w-[92vw] shrink-0 rounded-[46px] border-[8px] border-black bg-black p-2 shadow-[0_30px_80px_rgba(0,0,0,.3)]" style={{transform:`scale(${zoom/72})`,transformOrigin:"top center"}}><div className="pointer-events-none absolute left-1/2 top-2 z-[50] h-6 w-28 -translate-x-1/2 rounded-full bg-black"/><div className="overflow-hidden rounded-[36px] bg-white"><iframe title="QuickServe live iPhone menu" src={liveMenuUrl} onLoad={e=>publishMenuThemeBridge(restaurantId,{...theme,composition},e.currentTarget.contentWindow)} className="block h-[780px] w-full border-0 bg-white"/></div></div> : device === "tablet" ? <div className="w-[820px] max-w-[94vw] shrink-0 rounded-[30px] border-[8px] border-black bg-black p-2 shadow-[0_30px_80px_rgba(0,0,0,.22)]" style={{transform:`scale(${zoom/72})`,transformOrigin:"top center"}}><div className="overflow-hidden rounded-[22px] bg-white"><iframe title="QuickServe live tablet menu" src={liveMenuUrl} onLoad={e=>publishMenuThemeBridge(restaurantId,{...theme,composition},e.currentTarget.contentWindow)} className="block h-[760px] w-full border-0 bg-white"/></div></div> : <div className="w-full min-w-[720px]" style={{transform:`scale(${zoom/72})`,transformOrigin:"top center"}}><iframe title="QuickServe live desktop menu" src={liveMenuUrl} onLoad={e=>publishMenuThemeBridge(restaurantId,{...theme,composition},e.currentTarget.contentWindow)} className="block h-[900px] w-full rounded-xl border-0 bg-white shadow-xl"/></div>}
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 p-3 text-[11px] text-black/50"><span>Real diner renderer · no placeholder canvas · {device} · {zoom}%</span><Button size="sm" className="h-8 rounded-lg" onClick={openLiveMenu}><ExternalLink className="mr-1.5 size-3.5"/>Open live menu</Button></div>
    <div className="mt-2 hidden grid-cols-3 gap-2 sm:grid"><div className="rounded-xl bg-white/75 p-3"><BrainCircuit className="size-4"/><div className="mt-2 text-xs font-bold">AI direction</div></div><div className="rounded-xl bg-white/75 p-3"><Layers3 className="size-4"/><div className="mt-2 text-xs font-bold">Editable layers</div></div><div className="rounded-xl bg-white/75 p-3"><Check className="size-4"/><div className="mt-2 text-xs font-bold">Live bridge active</div></div></div>
  </main>;

  return <div className="menu-design-studio min-h-[100dvh]"><div className="studio-shell mx-auto w-full max-w-[1680px] px-3 py-3 sm:px-5 lg:px-8 lg:py-5"><header className="studio-header mb-3 rounded-2xl border bg-white p-4 shadow-sm lg:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><h1 className="text-2xl font-black tracking-[-.035em] sm:text-3xl">Menu Design Studio</h1><p className="mt-1 max-w-xl text-sm text-black/50">Design in the studio, preview the real diner menu on a device, then publish instantly.</p></div><div className="flex shrink-0 gap-2"><Button variant="outline" className="h-11 rounded-xl px-3" onClick={openLiveMenu}><ExternalLink className="mr-2 size-4"/><span className="hidden sm:inline">Live menu</span></Button><Button className="h-11 rounded-xl px-4" onClick={()=>void save()} disabled={saving}><Save className="mr-2 size-4"/>{saving?"Saving…":"Save & publish"}</Button></div></div><div className="studio-stepper mt-4 flex items-center gap-2 overflow-x-auto text-xs font-semibold"><span className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-black px-3 text-white"><span className="grid size-5 place-items-center rounded-full bg-white/20">1</span>Describe</span><span className="h-px w-6 shrink-0 bg-black/10"/><span className={cn("flex h-8 shrink-0 items-center gap-2 rounded-full px-3",concepts.length?"bg-black/10":"bg-black/[.04]")}><span className="grid size-5 place-items-center rounded-full bg-black/10">2</span>Create</span><span className="h-px w-6 shrink-0 bg-black/10"/><span className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-black/[.04] px-3"><span className="grid size-5 place-items-center rounded-full bg-black/10">3</span>Customize</span></div></header><div className="hidden gap-3 lg:grid lg:grid-cols-[330px_minmax(0,1fr)_300px] xl:gap-4"><aside className="space-y-3"><CreatePanel/></aside><PreviewPanel/><aside className="space-y-3"><EditPanel/><LayersPanel/></aside></div><div className="lg:hidden">{mobileTab==="brief"&&<CreatePanel/>}{mobileTab==="canvas"&&<PreviewPanel/>}{mobileTab==="edit"&&<EditPanel/>}{mobileTab==="layers"&&<LayersPanel/>}</div></div><nav className="studio-bottom-nav"><button type="button" onClick={()=>setMobileTab("brief")} className={cn(mobileTab==="brief"&&"bg-black text-white")}><Wand2 className="mx-auto mb-1 size-4"/>Create</button><button type="button" onClick={()=>setMobileTab("canvas")} className={cn(mobileTab==="canvas"&&"bg-black text-white")}><Smartphone className="mx-auto mb-1 size-4"/>Preview</button><button type="button" onClick={()=>setMobileTab("edit")} className={cn(mobileTab==="edit"&&"bg-black text-white")}><Sparkles className="mx-auto mb-1 size-4"/>Edit</button><button type="button" onClick={()=>setMobileTab("layers")} className={cn(mobileTab==="layers"&&"bg-black text-white")}><Layers3 className="mx-auto mb-1 size-4"/>Layers</button></nav></div>;
}
