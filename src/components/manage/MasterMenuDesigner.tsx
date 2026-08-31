import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlignCenter, AlignLeft, AlignRight, Check, Eye, Grid3X3, ImagePlus, Layers3, Monitor, MousePointer2, Palette, Play, Save, Sparkles, Smartphone, Tablet, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_THEME, parseMenuTheme, themeVars, type FontId, type LayoutId, type MenuTheme } from "@/lib/menu-theme";
import { generateMenuTheme } from "@/lib/theme.functions";
import { cn } from "@/lib/utils";

const DIRECTIONS = [
  { id: "editorial", name: "Dark Editorial", description: "Magazine hierarchy, cinematic food photography and deliberate whitespace.", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=88" },
  { id: "levante", name: "Modern Levantine", description: "Contemporary Levantine hospitality, organic forms and warm materials.", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=88" },
  { id: "poster", name: "Modern Poster", description: "Oversized typography, dramatic crops and high-impact composition.", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=88" },
  { id: "human", name: "Human Crafted", description: "Tactile print details, imperfect rhythm and authentic restaurant personality.", image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=88" },
  { id: "luxe", name: "Luxury Dining", description: "Quiet luxury, restrained palette, elegant type and premium photography.", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=88" },
  { id: "street", name: "Street Food", description: "Energetic editorial crops, bold pricing and contemporary street culture.", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=88" },
] as const;

const CONCEPTS = [
  { id: "editorial", title: "Editorial Magazine", subtitle: "Art-directed print composition", layout: "magazine" as LayoutId },
  { id: "poster", title: "Modern Arabic Poster", subtitle: "Graphic, expressive, asymmetric", layout: "spotlight" as LayoutId },
  { id: "cinematic", title: "Premium Cinematic", subtitle: "Photography-led luxury", layout: "gallery" as LayoutId },
] as const;

const LAYOUTS: Array<[LayoutId, string]> = [["magazine", "Magazine"], ["mosaic", "Mosaic"], ["spotlight", "Spotlight"], ["gallery", "Gallery"], ["columns", "Columns"], ["rail", "Swipe rail"]];
const FONTS: Array<[FontId, string]> = [["sans", "Modern Sans"], ["serif", "Editorial Serif"], ["display", "Elegant Display"], ["condensed", "Bold Condensed"], ["rounded", "Friendly Rounded"], ["script", "Human Script"]];
const MOTION = ["none", "fade", "rise", "pop", "slide"] as const;
const SHAPES = ["square", "rounded", "circle", "organic"] as const;
const TEXTURES = ["none", "paper", "chalk", "grain"] as const;
const FOOD = [
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=88",
  "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=88",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=88",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=88",
];

type PreviewMode = "phone" | "tablet" | "desktop";
type EditorTab = "style" | "layout" | "type" | "motion";
type ElementType = "brand" | "title" | "eyebrow" | "image" | "copy" | "category" | "product" | "price" | "shape" | "line";
type CompositionElement = { id: string; type: ElementType; x: number; y: number; w: number; h: number; rotation?: number; opacity?: number; text?: string; image?: string; color?: string; fontSize?: number; align?: "left" | "center" | "right"; shape?: string };
type MenuComposition = { version: 1; concept: string; artDirection: string; background: { color: string; texture: string; overlay?: string }; elements: CompositionElement[]; phone?: { elements: CompositionElement[] }; tablet?: { elements: CompositionElement[] }; desktop?: { elements: CompositionElement[] } };
type DesignerTheme = MenuTheme & { composition?: MenuComposition };

function fallbackComposition(theme: MenuTheme, name: string, images: string[], concept: string): MenuComposition {
  const image = images[0] || FOOD[0];
  const second = images[1] || FOOD[1];
  const poster = concept.toLowerCase().includes("poster");
  const cinematic = concept.toLowerCase().includes("cinematic");
  const elements: CompositionElement[] = poster
    ? [
        { id: "eyebrow", type: "eyebrow", x: 8, y: 7, w: 55, h: 4, text: "EST. 2026 · AMMAN", color: theme.accent, fontSize: 10 },
        { id: "title", type: "title", x: 7, y: 13, w: 72, h: 15, text: name, color: theme.text, fontSize: 48 },
        { id: "copy", type: "copy", x: 8, y: 32, w: 31, h: 15, text: "Fire, bread, gathering.\nMade for the table.", color: theme.muted, fontSize: 15 },
        { id: "shape", type: "shape", x: 4, y: 34, w: 34, h: 27, color: theme.accent, opacity: .16, shape: "organic", rotation: -8 },
        { id: "image-main", type: "image", x: 36, y: 29, w: 59, h: 40, image, shape: "organic", rotation: -3 },
        { id: "category", type: "category", x: 8, y: 69, w: 84, h: 6, text: "STARTERS · MAINS · DESSERTS", color: theme.primary, fontSize: 10 },
        { id: "product", type: "product", x: 8, y: 80, w: 55, h: 10, text: "Shawarma Single Meal", color: theme.text, fontSize: 19 },
        { id: "price", type: "price", x: 72, y: 80, w: 20, h: 10, text: "2.25 JOD", color: theme.primary, fontSize: 18, align: "right" },
      ]
    : [
        { id: "brand", type: "brand", x: 8, y: 7, w: 28, h: 5, text: name, color: theme.text, fontSize: 11 },
        { id: "eyebrow", type: "eyebrow", x: 8, y: 15, w: 45, h: 4, text: "SIGNATURE SELECTION", color: theme.accent, fontSize: 10 },
        { id: "title", type: "title", x: 8, y: 20, w: 50, h: 13, text: name, color: theme.text, fontSize: 42 },
        { id: "image-main", type: "image", x: cinematic ? 7 : 43, y: cinematic ? 35 : 8, w: cinematic ? 86 : 49, h: cinematic ? 39 : 32, image, shape: cinematic ? "square" : "rounded", rotation: cinematic ? 0 : 2 },
        { id: "copy", type: "copy", x: 8, y: cinematic ? 77 : 38, w: 34, h: 12, text: "Food, craft, gathering.\nMade with intention.", color: theme.muted, fontSize: 14 },
        { id: "category", type: "category", x: 8, y: 55, w: 84, h: 6, text: "STARTERS   MAINS   DESSERTS", color: theme.primary, fontSize: 10 },
        { id: "product", type: "product", x: 8, y: 67, w: 57, h: 11, text: "Shawarma Single Meal", color: theme.text, fontSize: 19 },
        { id: "price", type: "price", x: 73, y: 67, w: 19, h: 11, text: "2.25 JOD", color: theme.primary, fontSize: 18, align: "right" },
        { id: "image-second", type: "image", x: 69, y: 81, w: 23, h: 12, image: second, shape: "circle", rotation: -4 },
      ];
  return { version: 1, concept, artDirection: "Original restaurant art direction", background: { color: theme.bg, texture: theme.texture }, elements };
}

function normalizeComposition(value: unknown, theme: MenuTheme, name: string, images: string[], concept: string): MenuComposition {
  if (value && typeof value === "object") {
    const candidate = value as Partial<MenuComposition>;
    const elements = Array.isArray(candidate.elements) ? candidate.elements.filter((item): item is CompositionElement => Boolean(item) && typeof item === "object" && typeof (item as CompositionElement).id === "string") : [];
    if (elements.length >= 3) return { version: 1, concept: typeof candidate.concept === "string" ? candidate.concept : concept, artDirection: typeof candidate.artDirection === "string" ? candidate.artDirection : "Original restaurant art direction", background: { color: theme.bg, texture: theme.texture }, elements };
  }
  return fallbackComposition(theme, name, images, concept);
}

function updateElement(elements: CompositionElement[], id: string, patch: Partial<CompositionElement>) { return elements.map((item) => item.id === id ? { ...item, ...patch } : item); }

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <section className="rounded-2xl border border-black/[0.07] bg-white p-3.5 shadow-[0_8px_30px_rgba(0,0,0,.035)] sm:p-4"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#f3f2ee] text-black/65">{icon}</span><h2 className="text-xs font-bold sm:text-sm">{title}</h2></div>{children}</section>; }
function Option({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) { return <button type="button" onClick={onClick} className={cn("min-h-8 rounded-xl border border-black/10 bg-white px-2.5 text-[10px] font-medium text-black/60 transition hover:border-black/25 hover:text-black active:scale-[.98]", active && "border-black bg-black text-white")}>{active ? <Check className="mr-1 inline size-3" /> : null}{children}</button>; }
function Group({ title, children }: { title: string; children: ReactNode }) { return <div><div className="mb-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-black/35">{title}</div>{children}</div>; }

export function MenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang, pick, t } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<DesignerTheme>(DEFAULT_THEME);
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [direction, setDirection] = useState("editorial");
  const [concept, setConcept] = useState("editorial");
  const [tab, setTab] = useState<EditorTab>("style");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const [selectedId, setSelectedId] = useState("image-main");
  const [zoom, setZoom] = useState(85);
  const [grid, setGrid] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const restaurant = useQuery({
    queryKey: ["master-menu-designer", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,slug,logo_url,cover_image_url,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });
  const items = useQuery({
    queryKey: ["master-menu-designer-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const menuItems = useMemo(() => {
    const rows = items.data ?? [];
    return rows.length ? rows.map((row, index) => ({ title: pick(row.name_en, row.name_ar), description: pick(row.description_en, row.description_ar), price: `${Number(row.price).toFixed(2)} ${restaurant.data?.currency ?? "JOD"}`, image: row.image_url || FOOD[index % FOOD.length] })) : FOOD.map((image, index) => ({ title: lang === "ar" ? `طبق مميز ${index + 1}` : `Signature dish ${index + 1}`, description: lang === "ar" ? "وصف مختصر للطبق" : "A concise description", price: `8.50 ${restaurant.data?.currency ?? "JOD"}`, image }));
  }, [items.data, restaurant.data?.currency, pick, lang]);

  const currentElements = useMemo(() => {
    const composition = theme.composition;
    const responsive = composition?.[previewMode]?.elements;
    return responsive?.length ? responsive : composition?.elements ?? fallbackComposition(theme, restaurant.data?.name ?? "Restaurant", menuItems.map((item) => item.image), CONCEPTS.find((item) => item.id === concept)?.title ?? "Editorial Magazine").elements;
  }, [theme, previewMode, restaurant.data?.name, menuItems, concept]);
  const selected = currentElements.find((item) => item.id === selectedId);

  function setThemeValue<K extends keyof MenuTheme>(key: K, value: MenuTheme[K]) { setTheme((current) => ({ ...current, [key]: value })); }
  function setElements(next: CompositionElement[]) { setTheme((current) => ({ ...current, composition: { ...(current.composition ?? fallbackComposition(current, restaurant.data?.name ?? "Restaurant", menuItems.map((item) => item.image), "Custom")), version: 1, elements: next } })); }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const chosen = Array.from(files).slice(0, 5 - references.length);
      const encoded = await Promise.all(chosen.map(async (file) => {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Unable to read image");
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); return canvas.toDataURL("image/jpeg", .88);
      }));
      setReferences((current) => [...current, ...encoded].slice(0, 5));
    } catch (error) { toast.error(humanError(error, lang)); }
  }

  function chooseConcept(id: string) {
    setConcept(id);
    const chosen = CONCEPTS.find((item) => item.id === id) ?? CONCEPTS[0];
    setTheme((current) => ({ ...current, layout: chosen.layout, composition: fallbackComposition({ ...current, layout: chosen.layout }, restaurant.data?.name ?? "Restaurant", menuItems.map((item) => item.image), chosen.title) }));
  }

  async function generateMaster() {
    setGenerating(true);
    try {
      const dir = DIRECTIONS.find((item) => item.id === direction);
      const selectedConcept = CONCEPTS.find((item) => item.id === concept);
      const prompt = ["Build a complete original restaurant menu composition, not a theme picker.", `Art direction: ${dir?.name}. ${dir?.description}`, `Concept: ${selectedConcept?.title}. ${selectedConcept?.subtitle}`, brief.trim(), "Never default to logo + title + category pills + repeated cards. Use asymmetry, editorial hierarchy, realistic food photography, intentional whitespace, strong price treatment and restaurant-specific personality.", "Generate three structurally different compositions and include a composition object with positioned elements for a visual editor."] .filter(Boolean).join("\n\n");
      const result = await generate({ data: { restaurantId, brief: prompt, base: direction, images: references.length ? references : undefined } });
      const rawVariants = result.variants.map((value) => JSON.parse(value) as Record<string, unknown>);
      const first = rawVariants[0]; if (!first) throw new Error("No design returned");
      const parsed = parseMenuTheme(first) as DesignerTheme;
      const composition = normalizeComposition(first.composition, parsed, restaurant.data?.name ?? "Restaurant", menuItems.map((item) => item.image), selectedConcept?.title ?? "Master composition");
      setTheme({ ...parsed, composition });
      toast.success(rawVariants.length > 1 ? "3 creative directions generated" : "Master design generated");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setGenerating(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme as unknown as never }).eq("id", restaurantId);
      if (error) throw error;
      await logAudit("menu.master_composition_saved", { restaurantId, entity: "restaurants", entityId: restaurantId, metadata: { concept, layout: theme.layout, compositionVersion: theme.composition?.version ?? 1 } });
      await queryClient.invalidateQueries({ queryKey: ["master-menu-designer", restaurantId] });
      toast.success(t("common.saved"));
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setSaving(false); }
  }

  if (restaurant.isPending) return <Skeleton className="h-[780px] rounded-[2rem]" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const previewWidth = previewMode === "phone" ? 390 : previewMode === "tablet" ? 700 : 1040;
  const previewHeight = previewMode === "phone" ? 760 : previewMode === "tablet" ? 720 : 660;

  return (
    <div className="min-h-screen bg-[#f2f2ef] text-[#151514]">
      <div className="mx-auto max-w-[1800px] p-2.5 sm:p-4 lg:p-5">
        <header className="sticky top-2 z-50 mb-3 flex min-h-12 items-center gap-2 rounded-2xl border border-black/[0.07] bg-white/95 px-2.5 py-2 shadow-[0_12px_40px_rgba(0,0,0,.08)] backdrop-blur-xl sm:px-3.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-black text-white"><Wand2 className="size-4" /></div>
          <div className="hidden min-w-0 sm:block"><div className="flex items-center gap-1.5"><h1 className="text-sm font-bold">AI Menu Designer</h1><Badge className="bg-orange-500 px-1.5 text-[8px] text-white">MASTER</Badge></div><p className="text-[9px] text-black/40">Creative studio · {restaurant.data.name}</p></div>
          <div className="ms-auto flex items-center gap-1.5"><Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" asChild><a href={`/r/${restaurant.data.slug}`} target="_blank" rel="noreferrer"><Eye className="size-3.5" />Preview</a></Button><Button size="sm" className="h-8 px-2.5 text-[10px]" disabled={saving} onClick={() => void save()}><Save className="size-3.5" />{saving ? "Saving" : "Save"}</Button></div>
        </header>

        <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:pr-1">
            <Panel title="Creative direction" icon={<Palette className="size-4" />}><div className="grid grid-cols-2 gap-2">{DIRECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setDirection(item.id)} className={cn("group overflow-hidden rounded-xl border border-black/10 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md", direction === item.id && "border-black ring-1 ring-black")}><div className="relative h-24 overflow-hidden"><img src={item.image} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"/><div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"/><span className="absolute bottom-2 left-2 right-2 text-[10px] font-bold text-white">{item.name}</span></div><p className="line-clamp-2 p-2 text-[9px] leading-3.5 text-black/50">{item.description}</p></button>)}</div></Panel>

            <Panel title="Reference board" icon={<ImagePlus className="size-4" />}><div className="grid grid-cols-5 gap-1.5">{references.map((src, index) => <div key={`${index}-${src.slice(-10)}`} className="relative aspect-square overflow-hidden rounded-lg border"><img src={src} alt="Reference" className="size-full object-cover"/><button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/75 text-white">×</button></div>)}{references.length < 5 && <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square place-items-center rounded-lg border border-dashed text-black/30 hover:border-black hover:text-black"><ImagePlus className="size-4"/></button>}</div><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addReferences(event.target.files); event.currentTarget.value = ""; }}/><p className="mt-2 text-[9px] leading-4 text-black/40">Reference DNA: composition, typography, texture, colour and photography — not a direct clone.</p></Panel>

            <Panel title="Describe the menu you want" icon={<Sparkles className="size-4" />}><Textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4} className="resize-none rounded-xl border-black/10 bg-[#fafaf8] text-xs" placeholder="Premium Amman shawarma menu, editorial Arabic + English typography, charcoal paper, orange accents, dramatic realistic food photography…"/><Button onClick={() => void generateMaster()} disabled={generating} className="mt-2.5 h-10 w-full rounded-xl text-xs"><Sparkles className="size-3.5"/>{generating ? "Creating art direction…" : "Generate master design"}</Button></Panel>

            <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_8px_30px_rgba(0,0,0,.035)]">
              <div className="flex overflow-x-auto border-b border-black/[0.07] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{(["style", "layout", "type", "motion"] as EditorTab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={cn("min-h-8 shrink-0 rounded-lg px-3 text-[10px] font-semibold capitalize text-black/45", tab === item && "bg-black text-white")}>{item === "type" ? "Typography" : item}</button>)}</div>
              <div className="space-y-4 p-3.5">
                {tab === "style" && <><Group title="Image treatment"><div className="flex flex-wrap gap-1.5">{SHAPES.map((value) => <Option key={value} active={currentElements.find((item) => item.id === selectedId)?.shape === value || (value !== "organic" && theme.imageShape === value)} onClick={() => value === "organic" ? (selected ? setElements(updateElement(currentElements, selected.id, { shape: "organic" })) : null) : setThemeValue("imageShape", value as MenuTheme["imageShape"])}>{value}</Option>)}</div></Group><Group title="Texture"><div className="flex flex-wrap gap-1.5">{TEXTURES.map((value) => <Option key={value} active={theme.texture === value} onClick={() => setThemeValue("texture", value as MenuTheme["texture"])}>{value}</Option>)}</div></Group><Group title="Background"><div className="grid grid-cols-4 gap-1.5">{["solid", "gradient", "dots", "glow"].map((value) => <Option key={value} active={theme.bgStyle === value} onClick={() => setThemeValue("bgStyle", value as MenuTheme["bgStyle"])}>{value}</Option>)}</div></Group><div className="grid grid-cols-4 gap-2">{([["bg", "BG"], ["surface", "Surface"], ["primary", "Primary"], ["accent", "Accent"]] as const).map(([key, label]) => <label key={key} className="space-y-1 text-[9px] text-black/45">{label}<input type="color" value={theme[key]} onChange={(event) => setThemeValue(key, event.target.value)} className="h-9 w-full cursor-pointer rounded-lg border border-black/10 bg-white p-0.5"/></label>)}</div></>}
                {tab === "layout" && <><Group title="Master concept"><div className="space-y-1.5">{CONCEPTS.map((item) => <button key={item.id} type="button" onClick={() => chooseConcept(item.id)} className={cn("w-full rounded-xl border border-black/10 p-2.5 text-left", concept === item.id ? "border-black bg-black text-white" : "bg-white")}><div className="flex items-center justify-between"><span className="text-[10px] font-bold">{item.title}</span>{concept === item.id ? <Check className="size-3.5"/> : null}</div><p className={cn("mt-0.5 text-[9px]", concept === item.id ? "text-white/60" : "text-black/40")}>{item.subtitle}</p></button>)}</div></Group><Group title="Composition"><div className="grid grid-cols-2 gap-1.5">{LAYOUTS.map(([id, label]) => <Option key={id} active={theme.layout === id} onClick={() => { setThemeValue("layout", id); setTheme((current) => ({ ...current, layout: id, composition: fallbackComposition({ ...current, layout: id }, restaurant.data.name, menuItems.map((item) => item.image), label) })); }}>{label}</Option>)}</div></Group><div className="grid grid-cols-2 gap-2"><Option active={grid} onClick={() => setGrid((value) => !value)}><Grid3X3 className="mr-1 inline size-3"/>Smart grid</Option><Option active={zoom === 85} onClick={() => setZoom(85)}>Fit canvas</Option></div></>}
                {tab === "type" && <><Group title="Heading system"><div className="grid grid-cols-2 gap-1.5">{FONTS.map(([id, label]) => <Option key={id} active={theme.headingFont === id} onClick={() => setThemeValue("headingFont", id)}>{label}</Option>)}</div></Group><Group title="Selected element"><div className="flex flex-wrap gap-1.5">{selected ? <><Option active={selected.align === "left"} onClick={() => setElements(updateElement(currentElements, selected.id, { align: "left" }))}><AlignLeft className="mr-1 inline size-3"/>Left</Option><Option active={selected.align === "center"} onClick={() => setElements(updateElement(currentElements, selected.id, { align: "center" }))}><AlignCenter className="mr-1 inline size-3"/>Center</Option><Option active={selected.align === "right"} onClick={() => setElements(updateElement(currentElements, selected.id, { align: "right" }))}><AlignRight className="mr-1 inline size-3"/>Right</Option></> : <span className="text-[10px] text-black/40">Select an element in the canvas.</span>}</div></Group>{selected && <Group title="Type scale"><input type="range" min="8" max="72" value={selected.fontSize ?? 18} onChange={(event) => setElements(updateElement(currentElements, selected.id, { fontSize: Number(event.target.value) }))} className="w-full"/></Group>}</>}
                {tab === "motion" && <><Group title="Motion"><div className="flex flex-wrap gap-1.5">{MOTION.map((value) => <Option key={value} active={theme.animation === value} onClick={() => setThemeValue("animation", value)}>{value}</Option>)}</div></Group><div className="rounded-xl bg-black/[0.03] p-2.5 text-[9px] leading-4 text-black/45">Motion is subtle and art-directed: reveal, rise and image movement support the concept without turning the menu into a generic app.</div><Button variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => toast.success("Motion preview ready")}><Play className="size-3"/>Preview motion</Button></>}
              </div>
            </div>
          </aside>

          <main className="min-w-0 overflow-hidden rounded-[22px] border border-black/[0.07] bg-[#151514] shadow-[0_24px_80px_rgba(0,0,0,.14)]">
            <div className="flex min-h-12 items-center gap-2 border-b border-white/10 px-2.5 py-2 sm:px-3.5"><span className="text-[9px] font-bold uppercase tracking-[.16em] text-white/40">Live preview</span><div className="ms-auto flex items-center gap-1 rounded-xl bg-white/[0.06] p-1">{([["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]] as const).map(([mode, Icon]) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={cn("grid size-7 place-items-center rounded-lg text-white/40", previewMode === mode && "bg-white text-black")} aria-label={`${mode} preview`}><Icon className="size-3.5"/></button>)}</div><button type="button" onClick={() => setZoom((value) => Math.max(55, value - 5))} className="grid size-7 place-items-center rounded-lg text-white/45 hover:bg-white/10"><ZoomOut className="size-3.5"/></button><span className="hidden w-8 text-center text-[8px] text-white/35 sm:block">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(110, value + 5))} className="grid size-7 place-items-center rounded-lg text-white/45 hover:bg-white/10"><ZoomIn className="size-3.5"/></button></div>
            <div className="border-b border-white/10 bg-[#1c1c1b] px-2.5 py-2.5 sm:px-4"><div className="mx-auto flex max-w-[980px] items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{CONCEPTS.map((item) => <button key={item.id} type="button" onClick={() => chooseConcept(item.id)} className={cn("shrink-0 rounded-xl border px-2.5 py-2 text-left", concept === item.id ? "border-white bg-white text-black" : "border-white/10 bg-white/[0.04] text-white/55")}><span className="block text-[9px] font-bold">{item.title}</span><span className="block text-[8px] opacity-55">{item.subtitle}</span></button>)}<button type="button" onClick={() => void generateMaster()} disabled={generating} className="ms-auto flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-3 text-[9px] font-bold text-white"><Sparkles className="size-3.5"/>{generating ? "Generating" : "Generate"}</button></div></div>
            <div className="flex min-h-[680px] items-start justify-center overflow-auto p-3 sm:p-6 lg:p-10" style={grid ? { backgroundImage: "linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px)", backgroundSize: "24px 24px" } : undefined}>
              <div className="origin-top transition-transform duration-200" style={{ transform: `scale(${zoom / 100})`, width: "100%", display: "flex", justifyContent: "center" }}>
                <div className={cn("relative overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.35)]", previewMode === "phone" && "rounded-[34px] border-[7px] border-black", previewMode === "tablet" && "rounded-[24px] border-[6px] border-black", previewMode === "desktop" && "rounded-[12px] border border-black")} style={{ width: "100%", maxWidth: previewWidth, minHeight: previewHeight, ...themeVars(theme) }}>
                  <div className="absolute inset-0" style={{ background: theme.bg }} />
                  {theme.bgStyle === "gradient" && <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 15% 10%, ${theme.accent}30, transparent 38%), linear-gradient(135deg, ${theme.bg}, ${theme.surface})` }}/>} 
                  {theme.texture === "grain" && <div className="pointer-events-none absolute inset-0 opacity-[.08]" style={{ backgroundImage: "radial-gradient(#000 .7px, transparent .7px)", backgroundSize: "5px 5px" }}/>} 
                  <div className="relative h-full min-h-[inherit] w-full">
                    {currentElements.map((element) => {
                      const item = element.type === "product" ? menuItems[0] : undefined;
                      const src = element.image || (element.id === "image-main" ? menuItems[0]?.image : element.id === "image-second" ? menuItems[1]?.image : undefined);
                      const isSelected = selectedId === element.id;
                      const style: CSSProperties = { left: `${element.x}%`, top: `${element.y}%`, width: `${element.w}%`, height: `${element.h}%`, transform: `rotate(${element.rotation ?? 0}deg)`, opacity: element.opacity ?? 1, color: element.color || theme.text, fontSize: `${element.fontSize ?? 16}px`, textAlign: element.align ?? "left", fontFamily: element.type === "title" ? "var(--qs-heading-font)" : "var(--qs-body-font)" };
                      return <button key={element.id} type="button" onClick={() => setSelectedId(element.id)} className={cn("absolute z-10 overflow-hidden p-0 text-left", isSelected && "outline outline-2 outline-orange-500 outline-offset-2")} style={style}>
                        {element.type === "image" && src ? <img src={src} alt="" className={cn("size-full object-cover", element.shape === "circle" ? "rounded-full" : element.shape === "organic" ? "rounded-[42%_58%_62%_38%/46%_38%_62%_54%]" : element.shape === "rounded" ? "rounded-[8%]" : "rounded-none")} /> : null}
                        {element.type === "shape" ? <div className={cn("size-full", element.shape === "circle" ? "rounded-full" : element.shape === "organic" ? "rounded-[42%_58%_62%_38%/46%_38%_62%_54%]" : "rounded-[12%]")} style={{ background: element.color || theme.accent }} /> : null}
                        {element.type === "line" ? <div className="mt-[50%] h-px w-full" style={{ background: element.color || theme.accent }} /> : null}
                        {element.type !== "image" && element.type !== "shape" && element.type !== "line" ? <span className={cn("block whitespace-pre-line leading-[1.12]", element.type === "title" && "font-semibold tracking-[-.045em]", element.type === "eyebrow" && "font-bold uppercase tracking-[.22em]", element.type === "price" && "font-bold")}>{element.type === "product" ? item?.title || element.text : element.text}</span> : null}
                      </button>;
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 bg-[#111110] px-3 py-2 text-[8px] text-white/35 sm:px-4"><Layers3 className="size-3"/>Composition canvas · {currentElements.length} elements · live mirrored preview<span className="ms-auto hidden sm:block">{previewMode.toUpperCase()} · {previewWidth}px</span></div>
          </main>
        </div>
      </div>
    </div>
  );
}
