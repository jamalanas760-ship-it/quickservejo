import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileJson,
  Grid3X3,
  Layers3,
  Monitor,
  Paperclip,
  Palette,
  Play,
  Save,
  Sparkles,
  Smartphone,
  Tablet,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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

type PreviewMode = "phone" | "tablet" | "desktop";
type EditorTab = "style" | "layout" | "type" | "motion";
type PromptProvider = "openai" | "gemini" | "claude" | "adobe" | "figma" | "canva";
type ElementType = "brand" | "title" | "eyebrow" | "image" | "copy" | "category" | "product" | "price" | "shape";
type CompositionElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  text?: string;
  image?: string;
  color?: string;
  fontSize?: number;
  align?: "left" | "center" | "right";
  shape?: "square" | "rounded" | "circle" | "organic";
};
type MenuComposition = {
  version: 1;
  concept: string;
  artDirection: string;
  background: { color: string; texture: string; overlay?: string };
  elements: CompositionElement[];
  phone?: { elements: CompositionElement[] };
  tablet?: { elements: CompositionElement[] };
  desktop?: { elements: CompositionElement[] };
};
type DesignerTheme = MenuTheme & { composition?: MenuComposition };

const DIRECTIONS = [
  { id: "editorial", name: "Dark Editorial", description: "Magazine hierarchy, cinematic food photography and deliberate whitespace." },
  { id: "levante", name: "Modern Levantine", description: "Olive, terracotta, organic forms and Arabic-friendly hospitality." },
  { id: "poster", name: "Modern Poster", description: "Oversized typography, dramatic crops and high-impact composition." },
  { id: "human", name: "Human Crafted", description: "Tactile print details, imperfect rhythm and authentic restaurant personality." },
  { id: "luxe", name: "Luxury Dining", description: "Quiet luxury, restrained palette, elegant type and premium photography." },
  { id: "street", name: "Street Food", description: "Energetic editorial crops, bold pricing and contemporary street culture." },
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

const PROMPT_RECIPES: Record<PromptProvider, { name: string; prompt: string }> = {
  openai: { name: "OpenAI", prompt: "Act as a senior hospitality art director. Turn this restaurant story and references into a distinctive, production-ready QR menu composition. Decide hierarchy, grid, typography, image crops, pricing, whitespace, Arabic/English behavior and mobile responsiveness. Do not use generic cards." },
  gemini: { name: "Gemini", prompt: "Analyze the restaurant brief and every attached reference as visual evidence. Synthesize an original menu system with a strong concept, composition, material language, food-photography treatment and responsive behavior. Explain the visual decisions briefly, then output a precise design specification." },
  claude: { name: "Claude", prompt: "Think like an elite editorial menu designer. Extract the strongest design signals from the brief and references, resolve hierarchy and accessibility, then create a coherent menu art direction with exact layout, typography, spacing, imagery and interaction guidance. Prioritize human-made character over templates." },
  adobe: { name: "Adobe", prompt: "Create an Adobe-ready art direction for a restaurant menu: visual concept, palette, type pairing, photographic treatment, texture, composition, crop instructions and print/digital handoff notes. Use the attached references as visual DNA without copying protected text or marks." },
  figma: { name: "Figma", prompt: "Convert this menu brief into a Figma-ready composition spec with frames, auto-layout groups, text hierarchy, image fills, spacing tokens, responsive breakpoints and reusable components. Preserve the visual concept and make every element editable." },
  canva: { name: "Canva", prompt: "Turn this restaurant menu brief into a Canva-ready design recipe: page structure, visual hierarchy, typography pairing, image placement, palette, spacing, decorative language and mobile-safe composition. Keep it polished, distinctive and easy to edit." },
};
const PROVIDER_LABELS: Array<[PromptProvider, string]> = [["openai", "OpenAI"], ["gemini", "Gemini"], ["claude", "Claude"], ["adobe", "Adobe"], ["figma", "Figma"], ["canva", "Canva"]];

function fallbackComposition(theme: MenuTheme, name: string, images: string[], concept: string, menuItems: Array<{ title: string; price: string; image: string }>): MenuComposition {
  const image = images[0] || menuItems[0]?.image || FOOD[0];
  const second = images[1] || menuItems[1]?.image || FOOD[1];
  const poster = concept === "poster";
  const cinematic = concept === "cinematic";
  const first = menuItems[0];
  const elements: CompositionElement[] = poster
    ? [
        { id: "eyebrow", type: "eyebrow", x: 8, y: 6, w: 60, h: 4, text: "EST. 2026 · AMMAN", color: theme.accent, fontSize: 10 },
        { id: "title", type: "title", x: 7, y: 13, w: 76, h: 16, text: name, color: theme.text, fontSize: 48 },
        { id: "copy", type: "copy", x: 8, y: 33, w: 30, h: 15, text: "Fire, bread, gathering.\nMade for the table.", color: theme.muted, fontSize: 14 },
        { id: "shape", type: "shape", x: 3, y: 35, w: 35, h: 27, color: theme.accent, opacity: 0.15, shape: "organic", rotation: -8 },
        { id: "image-main", type: "image", x: 36, y: 29, w: 59, h: 40, image, shape: "organic", rotation: -3 },
        { id: "category", type: "category", x: 8, y: 70, w: 84, h: 5, text: "STARTERS · MAINS · DESSERTS", color: theme.primary, fontSize: 10 },
        { id: "product", type: "product", x: 8, y: 80, w: 55, h: 9, text: first?.title || "Signature dish", color: theme.text, fontSize: 18 },
        { id: "price", type: "price", x: 72, y: 80, w: 20, h: 9, text: first?.price || "8.50 JOD", color: theme.primary, fontSize: 17, align: "right" },
      ]
    : [
        { id: "brand", type: "brand", x: 8, y: 6, w: 32, h: 5, text: name, color: theme.text, fontSize: 11 },
        { id: "eyebrow", type: "eyebrow", x: 8, y: 14, w: 45, h: 4, text: "SIGNATURE SELECTION", color: theme.accent, fontSize: 10 },
        { id: "title", type: "title", x: 8, y: 19, w: 50, h: 13, text: name, color: theme.text, fontSize: 42 },
        { id: "image-main", type: "image", x: cinematic ? 7 : 43, y: cinematic ? 34 : 8, w: cinematic ? 86 : 49, h: cinematic ? 39 : 32, image, shape: cinematic ? "square" : "rounded", rotation: cinematic ? 0 : 2 },
        { id: "copy", type: "copy", x: 8, y: cinematic ? 76 : 38, w: 34, h: 12, text: "Food, craft, gathering.\nMade with intention.", color: theme.muted, fontSize: 14 },
        { id: "category", type: "category", x: 8, y: 55, w: 84, h: 5, text: "STARTERS   MAINS   DESSERTS", color: theme.primary, fontSize: 10 },
        { id: "product", type: "product", x: 8, y: 67, w: 57, h: 10, text: first?.title || "Signature dish", color: theme.text, fontSize: 18 },
        { id: "price", type: "price", x: 73, y: 67, w: 19, h: 10, text: first?.price || "8.50 JOD", color: theme.primary, fontSize: 17, align: "right" },
        { id: "image-second", type: "image", x: 69, y: 81, w: 23, h: 12, image: second, shape: "circle", rotation: -4 },
      ];
  return { version: 1, concept, artDirection: "Original restaurant art direction", background: { color: theme.bg, texture: theme.texture }, elements };
}

function normalizeComposition(value: unknown, theme: MenuTheme, name: string, images: string[], concept: string, menuItems: Array<{ title: string; price: string; image: string }>): MenuComposition {
  if (value && typeof value === "object") {
    const candidate = value as Partial<MenuComposition>;
    const elements = Array.isArray(candidate.elements) ? candidate.elements.filter((item): item is CompositionElement => Boolean(item) && typeof item === "object" && typeof (item as CompositionElement).id === "string") : [];
    if (elements.length >= 3) return { version: 1, concept: typeof candidate.concept === "string" ? candidate.concept : concept, artDirection: typeof candidate.artDirection === "string" ? candidate.artDirection : "Original restaurant art direction", background: { color: theme.bg, texture: theme.texture }, elements };
  }
  return fallbackComposition(theme, name, images, concept, menuItems);
}

function applyConceptTheme(base: DesignerTheme, id: string): DesignerTheme {
  if (id === "poster") return { ...base, bg: "#1b1b1a", surface: "#242423", text: "#f5f1e8", muted: "#b4aa9a", primary: "#f08a24", primaryText: "#1b1510", accent: "#f08a24", headingFont: "condensed", bodyFont: "sans", layout: "spotlight", hero: "ribbon", texture: "grain", decor: "shapes", sectionStyle: "plain", priceStyle: "right", animation: "pop", radius: 0, showImages: true };
  if (id === "cinematic") return { ...base, bg: "#101112", surface: "#191b1d", text: "#f3eee3", muted: "#a59f94", primary: "#d9b36b", primaryText: "#171514", accent: "#d9b36b", headingFont: "display", bodyFont: "serif", layout: "gallery", hero: "gradient", texture: "grain", decor: "none", sectionStyle: "rule", priceStyle: "leader", animation: "fade", radius: 4, showImages: true };
  return { ...base, bg: "#171716", surface: "#20201f", text: "#f4f0e8", muted: "#9f9a90", primary: "#c88742", primaryText: "#171412", accent: "#c88742", headingFont: "display", bodyFont: "sans", layout: "magazine", hero: "minimal", texture: "paper", decor: "ornate", sectionStyle: "rule", priceStyle: "leader", animation: "rise", radius: 8, showImages: true };
}

function applyDirectionTheme(base: DesignerTheme, id: string): DesignerTheme {
  if (id === "levante") return { ...base, bg: "#f3ede0", surface: "#fffaf0", text: "#26352e", muted: "#77786d", primary: "#31594b", primaryText: "#fffaf0", accent: "#b66b43", headingFont: "display", bodyFont: "sans", texture: "paper", decor: "veg", bgStyle: "solid" };
  if (id === "luxe") return { ...base, bg: "#eee9df", surface: "#faf7ef", text: "#211f1c", muted: "#78736a", primary: "#9a7444", primaryText: "#fffaf0", accent: "#b28a52", headingFont: "serif", bodyFont: "sans", texture: "none", decor: "ornate", bgStyle: "solid" };
  if (id === "street") return { ...base, bg: "#171717", surface: "#222222", text: "#fff7eb", muted: "#aaa29a", primary: "#f07818", primaryText: "#19130e", accent: "#f07818", headingFont: "condensed", bodyFont: "sans", texture: "grain", decor: "fastfood", animation: "pop", bgStyle: "solid" };
  if (id === "human") return { ...base, bg: "#e9dfcf", surface: "#f5eee3", text: "#2c211a", muted: "#806c5b", primary: "#9a3d2d", primaryText: "#fff7ef", accent: "#b94b2b", headingFont: "serif", bodyFont: "sans", texture: "paper", decor: "bakery", animation: "rise", bgStyle: "solid" };
  return { ...base, bg: "#111214", surface: "#1b1d20", text: "#f4f1ea", muted: "#9b968b", primary: "#c88742", primaryText: "#171412", accent: "#c88742", headingFont: "display", bodyFont: "sans", texture: "grain", decor: "none", animation: "fade", bgStyle: "glow" };
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="rounded-2xl border border-black/[0.07] bg-white p-3.5 shadow-[0_8px_30px_rgba(0,0,0,.035)] sm:p-4"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#f3f2ee] text-black/65">{icon}</span><h2 className="text-xs font-bold sm:text-sm">{title}</h2></div>{children}</section>;
}
function Option({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("min-h-8 rounded-xl border border-black/10 bg-white px-2.5 text-[10px] font-medium text-black/60 transition hover:border-black/25 hover:text-black active:scale-[.98]", active && "border-black bg-black text-white")}>{active ? <Check className="mr-1 inline size-3" /> : null}{children}</button>;
}
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
  const [zoom, setZoom] = useState(86);
  const [grid, setGrid] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptProvider, setPromptProvider] = useState<PromptProvider>("openai");

  const restaurant = useQuery({ queryKey: ["master-menu-designer", restaurantId], queryFn: async () => { const { data, error } = await supabase.from("restaurants").select("id,name,slug,logo_url,cover_image_url,menu_theme,currency").eq("id", restaurantId).single(); if (error) throw error; return data; } });
  const items = useQuery({ queryKey: ["master-menu-designer-items", restaurantId], queryFn: async () => { const { data, error } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(8); if (error) throw error; return data ?? []; } });

  const menuItems = useMemo(() => {
    const rows = items.data ?? [];
    return rows.length ? rows.map((row, index) => ({ title: pick(row.name_en, row.name_ar), description: pick(row.description_en, row.description_ar), price: `${Number(row.price).toFixed(2)} ${restaurant.data?.currency ?? "JOD"}`, image: row.image_url || FOOD[index % FOOD.length] })) : FOOD.map((image, index) => ({ title: lang === "ar" ? `طبق مميز ${index + 1}` : `Signature dish ${index + 1}`, description: lang === "ar" ? "وصف مختصر للطبق" : "A concise description", price: `8.50 ${restaurant.data?.currency ?? "JOD"}`, image }));
  }, [items.data, restaurant.data?.currency, pick, lang]);

  const derivedComposition = useMemo(() => {
    const raw = restaurant.data?.menu_theme as unknown;
    const existing = raw && typeof raw === "object" ? (raw as { composition?: unknown }).composition : undefined;
    return normalizeComposition(existing, theme, restaurant.data?.name ?? "Restaurant", references, concept, menuItems);
  }, [restaurant.data?.menu_theme, theme, restaurant.data?.name, references, concept, menuItems]);
  const currentElements = useMemo(() => theme.composition?.[previewMode]?.elements?.length ? theme.composition[previewMode]?.elements ?? [] : theme.composition?.elements ?? derivedComposition.elements, [theme.composition, previewMode, derivedComposition.elements]);
  const selected = currentElements.find((item) => item.id === selectedId);

  function setThemeValue<K extends keyof MenuTheme>(key: K, value: MenuTheme[K]) { setTheme((current) => ({ ...current, [key]: value })); }
  function commitComposition(nextElements: CompositionElement[]) { setTheme((current) => ({ ...current, composition: { ...(current.composition ?? derivedComposition), elements: nextElements, background: { color: current.bg, texture: current.texture } } })); }

  function applyConcept(id: string) {
    const conceptMeta = CONCEPTS.find((item) => item.id === id) ?? CONCEPTS[0];
    const nextTheme = applyConceptTheme(theme, id);
    const nextComposition = fallbackComposition(nextTheme, restaurant.data?.name ?? "Restaurant", references, id, menuItems);
    setConcept(id);
    setDirection(id === "poster" ? "poster" : id === "cinematic" ? "luxe" : "editorial");
    setSelectedId("image-main");
    setTheme({ ...nextTheme, layout: conceptMeta.layout, composition: nextComposition });
  }
  function applyDirection(id: string) {
    const nextTheme = applyDirectionTheme(theme, id);
    const nextComposition = fallbackComposition(nextTheme, restaurant.data?.name ?? "Restaurant", references, concept, menuItems);
    setDirection(id);
    setTheme({ ...nextTheme, composition: nextComposition });
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const room = Math.max(0, 5 - references.length);
      const selectedFiles = Array.from(files).slice(0, room);
      const encoded = await Promise.all(selectedFiles.map(async (file) => {
        const bitmap = await createImageBitmap(file);
        const max = 1400;
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not read image");
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return canvas.toDataURL("image/jpeg", 0.88);
      }));
      setReferences((current) => [...current, ...encoded].slice(0, 5));
      toast.success(lang === "ar" ? "تم إرفاق الصور مع وصف الذكاء الاصطناعي" : "References attached to the AI brief");
    } catch (error) { toast.error(humanError(error, lang)); }
  }

  function buildPrompt(provider: PromptProvider = promptProvider) {
    const recipe = PROMPT_RECIPES[provider];
    const referenceText = references.length ? `Attached visual references: ${references.length}. Analyze composition, palette, typography, spacing, texture, image crops and hierarchy as visual DNA.` : "No reference images attached.";
    return [recipe.prompt, `Restaurant: ${restaurant.data?.name ?? "Restaurant"}.`, brief.trim() ? `Owner brief: ${brief.trim()}` : "Owner brief: design a premium QR menu that feels original and human-made.", `Current concept: ${CONCEPTS.find((item) => item.id === concept)?.title ?? concept}.`, `Current direction: ${DIRECTIONS.find((item) => item.id === direction)?.name ?? direction}.`, referenceText, "Deliver a mobile-first composition that works in Arabic RTL and English LTR. Avoid generic SaaS card grids."] .join("\n\n");
  }
  async function copyPrompt(provider: PromptProvider = promptProvider) { await navigator.clipboard.writeText(buildPrompt(provider)); toast.success(`${PROMPT_RECIPES[provider].name} prompt copied`); }

  async function generateDesign() {
    setGenerating(true);
    try {
      const result = await generate({ data: { restaurantId, provider: promptProvider, brief: buildPrompt(promptProvider), base: `${direction}:${concept}`, images: references.length ? references : undefined } });
      const variants = result.variants.map((value) => {
        const raw = JSON.parse(value) as DesignerTheme;
        const parsed = parseMenuTheme(raw);
        return { ...parsed, composition: normalizeComposition(raw.composition, parsed, restaurant.data?.name ?? "Restaurant", references, concept, menuItems) } as DesignerTheme;
      });
      if (variants[0]) setTheme(variants[0]);
      if (variants[0]?.composition) setSelectedId(variants[0].composition.elements[0]?.id ?? "image-main");
      toast.success(lang === "ar" ? "تم إنشاء التصميم وتحديث المعاينة مباشرة" : "Master design generated and preview updated");
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setGenerating(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme as unknown as never }).eq("id", restaurantId);
      if (error) throw error;
      await logAudit("menu.master_design_saved", { restaurantId, entity: "restaurants", entityId: restaurantId, metadata: { template: theme.template, layout: theme.layout, concept, direction, promptProvider } });
      await queryClient.invalidateQueries({ queryKey: ["master-menu-designer", restaurantId] });
      toast.success(t("common.saved"));
    } catch (error) { toast.error(humanError(error, lang)); }
    finally { setSaving(false); }
  }
  function updateSelected(patch: Partial<CompositionElement>) { if (!selected) return; commitComposition(currentElements.map((item) => item.id === selected.id ? { ...item, ...patch } : item)); }

  if (restaurant.isPending) return <Skeleton className="h-[760px] rounded-3xl" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const previewWidth = previewMode === "phone" ? 390 : previewMode === "tablet" ? 720 : 1080;
  const previewRatio = previewMode === "phone" ? 1.9 : previewMode === "tablet" ? 1.15 : 0.68;
  const motionClass = theme.animation === "fade" ? "animate-[fade-in_.45s_ease-out]" : theme.animation === "rise" ? "animate-[slide-up_.45s_ease-out]" : theme.animation === "pop" ? "animate-[pop-in_.35s_ease-out]" : theme.animation === "slide" ? "animate-[slide-in_.45s_ease-out]" : "";

  return <div className="min-h-screen bg-[#f4f4f2] text-[#171716]"><div className="mx-auto max-w-[1760px] p-3 sm:p-5 lg:p-6">
    <header className="sticky top-2 z-50 mb-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-black/[0.07] bg-white/92 p-3 shadow-[0_12px_40px_rgba(0,0,0,.08)] backdrop-blur-xl sm:p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-black text-white sm:size-11 sm:rounded-2xl"><Wand2 className="size-5" /></div>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Master Menu Studio</h1><Badge className="hidden bg-orange-500 text-white sm:inline-flex">AI + DESIGN</Badge></div><p className="truncate text-xs text-black/45">{restaurant.data.name} · live composition editor</p></div>
      <div className="flex w-full gap-2 sm:w-auto"><Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild><a href={`/r/${restaurant.data.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open menu</a></Button><Button size="sm" className="flex-1 sm:flex-none" disabled={saving} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : "Save design"}</Button></div>
    </header>

    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_330px] xl:items-start">
      <aside className="space-y-3 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
        <Panel title="Creative direction" icon={<Palette className="size-4" />}><div className="grid grid-cols-2 gap-2">{DIRECTIONS.map((item) => <button key={item.id} type="button" onClick={() => applyDirection(item.id)} className={cn("group rounded-2xl border bg-white p-2.5 text-start transition hover:-translate-y-0.5 hover:shadow-md", direction === item.id && "border-black ring-2 ring-black/10")}><div className="mb-2 h-16 rounded-xl" style={{ background: item.id === "levante" ? "linear-gradient(135deg,#f3ede0,#b66b43)" : item.id === "luxe" ? "linear-gradient(135deg,#eee9df,#b28a52)" : item.id === "human" ? "linear-gradient(135deg,#e9dfcf,#9a3d2d)" : item.id === "street" ? "linear-gradient(135deg,#171717,#f07818)" : "linear-gradient(135deg,#111214,#c88742)" }} /><p className="text-[11px] font-semibold">{item.name}</p><p className="mt-0.5 text-[9px] leading-3.5 text-black/45">{item.description}</p></button>)}</div></Panel>

        <Panel title="AI menu director" icon={<Sparkles className="size-4" />}>
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">{PROVIDER_LABELS.map(([id, label]) => <button key={id} type="button" onClick={() => setPromptProvider(id)} className={cn("shrink-0 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold", promptProvider === id ? "border-black bg-black text-white" : "border-black/10 bg-white text-black/55")}>{label}</button>)}</div>
          <div className="relative rounded-2xl border border-black/10 bg-[#fafaf8] p-2"><Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} className="resize-none border-0 bg-transparent pr-8 text-xs shadow-none focus-visible:ring-0" placeholder="Describe the menu you want… The attached photos are part of this AI brief." /><button type="button" onClick={() => fileRef.current?.click()} className="absolute bottom-3 start-3 grid size-8 place-items-center rounded-xl border bg-white text-black/55 shadow-sm hover:text-black" aria-label="Attach reference image"><Paperclip className="size-4" /></button><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addReferences(e.target.files); e.currentTarget.value = ""; }} /><button type="button" onClick={() => void copyPrompt()} className="absolute bottom-3 end-3 grid size-8 place-items-center rounded-xl border bg-white text-black/55 shadow-sm hover:text-black" aria-label="Copy AI prompt"><Copy className="size-4" /></button></div>
          {references.length > 0 && <div className="mt-2 flex items-center gap-2 rounded-xl border bg-[#fafaf8] p-2"><div className="flex -space-x-2">{references.map((src, i) => <div key={`${src.slice(-12)}-${i}`} className="relative"><img src={src} alt="Attached reference" className="size-9 rounded-lg border-2 border-white object-cover" /><button type="button" onClick={() => setReferences((current) => current.filter((_, index) => index !== i))} className="absolute -end-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-black text-white"><X className="size-2.5" /></button></div>)}</div><span className="text-[9px] text-black/45">{references.length} visual reference{references.length > 1 ? "s" : ""} attached to the prompt</span></div>}
          <div className="mt-2 flex gap-2"><Button className="h-10 flex-1 rounded-xl" disabled={generating} onClick={() => void generateDesign()}><Sparkles className="size-4" />{generating ? "Designing…" : "Generate master design"}</Button><Button variant="outline" className="h-10 rounded-xl px-3" onClick={() => void copyPrompt()}><Copy className="size-4" /></Button></div>
        </Panel>

        <Panel title="Master concept" icon={<Layers3 className="size-4" />}><div className="space-y-2">{CONCEPTS.map((item) => <button key={item.id} type="button" onClick={() => applyConcept(item.id)} className={cn("w-full rounded-2xl border p-3 text-start transition", concept === item.id ? "border-black bg-black text-white shadow-md" : "border-black/10 bg-white hover:border-black/25")}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{item.title}</span>{concept === item.id && <Check className="size-4" />}</div><p className={cn("mt-0.5 text-[10px]", concept === item.id ? "text-white/60" : "text-black/40")}>{item.subtitle}</p></button>)}</div></Panel>
      </aside>

      <main className="min-w-0 rounded-[1.5rem] border border-black/[0.07] bg-[#dededb] p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-black/[0.06] bg-white p-2"><div className="flex rounded-xl bg-[#f5f5f3] p-1">{(["phone", "tablet", "desktop"] as PreviewMode[]).map((mode) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={cn("grid size-8 place-items-center rounded-lg text-black/45", previewMode === mode && "bg-black text-white")}>{mode === "phone" ? <Smartphone className="size-4" /> : mode === "tablet" ? <Tablet className="size-4" /> : <Monitor className="size-4" />}</button>)}</div><div className="ml-auto flex items-center gap-1"><button type="button" onClick={() => setZoom((value) => Math.max(55, value - 5))} className="grid size-8 place-items-center rounded-lg hover:bg-black/5"><ZoomOut className="size-4" /></button><span className="w-10 text-center text-[10px] font-semibold text-black/45">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(110, value + 5))} className="grid size-8 place-items-center rounded-lg hover:bg-black/5"><ZoomIn className="size-4" /></button><button type="button" onClick={() => setGrid((value) => !value)} className={cn("ml-1 grid size-8 place-items-center rounded-lg", grid ? "bg-black text-white" : "hover:bg-black/5")}><Grid3X3 className="size-4" /></button></div></div>
        <div className="flex min-h-[720px] items-start justify-center overflow-auto rounded-2xl bg-[#cfcfcb] p-5 sm:p-8"><div className="relative shrink-0 shadow-[0_24px_70px_rgba(0,0,0,.18)]" style={{ width: `${previewWidth}px`, maxWidth: "100%", transform: `scale(${zoom / 100})`, transformOrigin: "top center", marginBottom: `${Math.max(0, (zoom / 100 - 1) * 500)}px` }}><div className="relative overflow-hidden rounded-[22px]" style={{ ...themeVars(theme), aspectRatio: `${previewRatio}`, background: theme.bg, color: theme.text, fontFamily: "var(--qs-body-font)" }}>
          {grid && <div className="pointer-events-none absolute inset-0 z-30" style={{ backgroundImage: "linear-gradient(to right, rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.08) 1px, transparent 1px)", backgroundSize: "10% 10%" }} />}
          <div className="absolute inset-0 opacity-60" style={{ background: theme.bgStyle === "glow" ? `radial-gradient(circle at 75% 10%, ${theme.accent}22, transparent 35%)` : theme.bgStyle === "gradient" ? `linear-gradient(145deg, ${theme.bg}, ${theme.surface})` : undefined }} />
          {theme.texture !== "none" && <div className="pointer-events-none absolute inset-0 opacity-[.08]" style={{ backgroundImage: theme.texture === "paper" ? "radial-gradient(#000 0.6px, transparent 0.7px)" : theme.texture === "chalk" ? "radial-gradient(#fff 0.5px, transparent 0.7px)" : "radial-gradient(#000 0.5px, transparent 0.8px)", backgroundSize: "7px 7px" }} />}
          {currentElements.map((element) => {
            const isSelected = selectedId === element.id;
            const style: CSSProperties = { left: `${element.x}%`, top: `${element.y}%`, width: `${element.w}%`, height: `${element.h}%`, color: element.color || theme.text, opacity: element.opacity ?? 1, transform: `rotate(${element.rotation ?? 0}deg)`, zIndex: isSelected ? 20 : 10 };
            if (element.type === "image") return <button key={element.id} type="button" onClick={() => setSelectedId(element.id)} className={cn("absolute overflow-hidden transition-[box-shadow,transform]", motionClass, isSelected && "ring-2 ring-[var(--qs-primary)] ring-offset-2 ring-offset-transparent")} style={{ ...style, borderRadius: element.shape === "circle" ? "999px" : element.shape === "organic" ? "36% 64% 62% 38% / 42% 38% 62% 58%" : element.shape === "square" ? "0" : `${theme.radius}px` }}><img src={element.image || FOOD[0]} alt="" className="size-full object-cover" /></button>;
            const fontSize = Math.max(8, (element.fontSize || 16) * (previewMode === "phone" ? 0.68 : previewMode === "tablet" ? 0.86 : 1));
            return <button key={element.id} type="button" onClick={() => setSelectedId(element.id)} className={cn("absolute whitespace-pre-line overflow-hidden text-start transition-[box-shadow]", isSelected && "rounded-md ring-1 ring-[var(--qs-primary)] ring-offset-2 ring-offset-transparent")} style={{ ...style, fontFamily: element.type === "title" || element.type === "brand" ? "var(--qs-heading-font)" : "var(--qs-body-font)", fontSize, fontWeight: element.type === "title" ? 700 : element.type === "product" || element.type === "price" ? 650 : 450, textAlign: element.align || "left", lineHeight: 1.05 }}>{element.text}</button>;
          })}
          <div className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-black/10 px-2 py-1 text-[7px] font-semibold uppercase tracking-[.15em]" style={{ color: theme.muted }}>Live preview</div>
        </div></div></div>
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-black/40"><Eye className="size-3.5" /> Changes reflect instantly in the canvas</div>
      </main>

      <aside className="min-w-0 rounded-[1.5rem] border border-black/[0.07] bg-white shadow-sm xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
        <div className="grid grid-cols-4 border-b border-black/[0.07]">{([['style','Style'],['layout','Layout'],['type','Typography'],['motion','Motion']] as Array<[EditorTab,string]>).map(([id,label]) => <button key={id} type="button" onClick={() => setTab(id)} className={cn("h-12 text-[11px] font-medium text-black/45", tab === id && "bg-black text-white")}>{label}</button>)}</div>
        <div className="space-y-5 p-4">
          {tab === "style" && <><Group title="Image treatment"><div className="grid grid-cols-4 gap-2">{SHAPES.map((shape) => <Option key={shape} active={(selected?.shape || theme.imageShape) === shape} onClick={() => { if (selected?.type === "image") updateSelected({ shape }); else setThemeValue("imageShape", shape === "organic" ? "rounded" : shape); }}>{shape}</Option>)}</div></Group><Group title="Texture"><div className="grid grid-cols-4 gap-2">{TEXTURES.map((texture) => <Option key={texture} active={theme.texture === texture} onClick={() => setThemeValue("texture", texture)}>{texture}</Option>)}</div></Group><Group title="Background"><div className="grid grid-cols-4 gap-2">{(["solid","gradient","dots","glow"] as const).map((style) => <Option key={style} active={theme.bgStyle === style} onClick={() => setThemeValue("bgStyle", style)}>{style}</Option>)}</div></Group><Group title="Palette"><div className="grid grid-cols-4 gap-2">{([['bg','BG'],['surface','Surface'],['primary','Primary'],['accent','Accent']] as Array<[keyof MenuTheme,string]>).map(([key,label]) => <label key={label} className="space-y-1"><span className="block text-[9px] text-black/40">{label}</span><input type="color" value={String(theme[key])} onChange={(e) => setThemeValue(key, e.target.value as never)} className="h-10 w-full cursor-pointer rounded-xl border border-black/10 bg-white p-1" /></label>)}</div></Group></>}
          {tab === "layout" && <><Group title="Master concept"><div className="space-y-2">{CONCEPTS.map((item) => <button key={item.id} type="button" onClick={() => applyConcept(item.id)} className={cn("w-full rounded-2xl border p-3 text-start", concept === item.id ? "border-black bg-black text-white" : "border-black/10")}>{item.title}<span className="mt-0.5 block text-[9px] opacity-55">{item.subtitle}</span></button>)}</div></Group><Group title="Composition"><div className="grid grid-cols-2 gap-2">{LAYOUTS.map(([id,label]) => <Option key={id} active={theme.layout === id} onClick={() => { setThemeValue("layout", id); setTheme((current) => ({ ...current, composition: fallbackComposition(current, restaurant.data?.name ?? "Restaurant", references, concept, menuItems) })); }}>{label}</Option>)}</div></Group><div className="grid grid-cols-2 gap-2"><Option active={grid} onClick={() => setGrid((value) => !value)}>Grid</Option><Option active={zoom >= 100} onClick={() => setZoom((value) => value >= 100 ? 86 : 100)}>Fit canvas</Option></div></>}
          {tab === "type" && <><Group title="Heading system"><div className="grid grid-cols-2 gap-2">{FONTS.map(([id,label]) => <Option key={id} active={theme.headingFont === id} onClick={() => setThemeValue("headingFont", id)}>{label}</Option>)}</div></Group><Group title="Selected element"><div className="flex gap-2">{([['left',AlignLeft],['center',AlignCenter],['right',AlignRight]] as const).map(([align,Icon]) => <Option key={align} active={selected?.align === align} onClick={() => updateSelected({ align })}><Icon className="mr-1 inline size-3" />{align}</Option>)}</div></Group><Group title="Type scale"><input type="range" min="10" max="64" value={selected?.fontSize ?? 18} onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })} className="w-full" /></Group></>}
          {tab === "motion" && <><Group title="Motion"><div className="grid grid-cols-5 gap-2">{MOTION.map((motion) => <Option key={motion} active={theme.animation === motion} onClick={() => setThemeValue("animation", motion)}>{motion}</Option>)}</div></Group><div className="rounded-2xl bg-[#f7f7f5] p-3 text-[10px] leading-4 text-black/45">Motion is subtle and art-directed. The live canvas replays the selected reveal when you change the motion system.</div><Button variant="outline" className="h-10 rounded-xl" onClick={() => { setZoom((value) => Math.max(55, value - 1)); setTimeout(() => setZoom((value) => Math.min(110, value + 1)), 30); }}><Play className="size-4" />Preview motion</Button></>}
          <div className="border-t border-black/[0.07] pt-4"><div className="mb-2 flex items-center gap-2"><FileJson className="size-4 text-black/45" /><span className="text-[10px] font-bold uppercase tracking-[.12em] text-black/45">Design tool handoff</span></div><div className="grid grid-cols-2 gap-2">{PROVIDER_LABELS.slice(3).map(([id,label]) => <button key={id} type="button" onClick={() => void copyPrompt(id)} className="rounded-xl border border-black/10 bg-white px-2.5 py-2 text-[10px] font-semibold hover:border-black/30"><Copy className="mr-1 inline size-3" />{label}</button>)}</div><button type="button" onClick={() => { const blob = new Blob([JSON.stringify({ theme, composition: theme.composition, prompt: buildPrompt(promptProvider) }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${restaurant.data?.slug || "menu"}-design-spec.json`; a.click(); URL.revokeObjectURL(url); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-[#fafaf8] px-3 py-2 text-[10px] font-semibold hover:border-black/30"><FileJson className="size-3.5" />Export editable design spec</button><p className="mt-2 text-[9px] leading-4 text-black/40">Figma / Adobe / Canva handoff uses the same structured composition and provider-optimized prompt, so the visual intent stays consistent.</p></div>
        </div>
      </aside>
    </div>
  </div>
  </div>;
}
