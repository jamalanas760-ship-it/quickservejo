import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, ImagePlus, Maximize2, Monitor, Palette, PanelRight, Play, RotateCcw, Sparkles, Smartphone, Tablet, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_THEME, pageBackground, parseMenuTheme, themeVars, type MenuTheme } from "@/lib/menu-theme";
import { generateMenuTheme } from "@/lib/theme.functions";
import { cn } from "@/lib/utils";

const DIRECTIONS = [
  { id: "editorial", name: "Dark Editorial", description: "Luxury black, dramatic food photography, magazine hierarchy", colors: ["#11100f", "#f2e6cf", "#c88742"] },
  { id: "kraft", name: "Kraft Bistro", description: "Warm paper, imperfect print texture, premium human feel", colors: ["#d9bd8a", "#3b2a1e", "#b94b2b"] },
  { id: "poster", name: "Modern Poster", description: "Bold title, geometric framing, high-impact hero photography", colors: ["#1a1a1a", "#f5f1e8", "#e07b18"] },
  { id: "levantine", name: "Modern Levantine", description: "Olive, terracotta, organic curves and refined hospitality", colors: ["#f3eee2", "#263a2d", "#b66b43"] },
  { id: "minimal", name: "Minimal Luxe", description: "Quiet luxury, generous whitespace and precise typography", colors: ["#f8f7f2", "#20211f", "#b28a52"] },
  { id: "street", name: "Street Food", description: "Energetic charcoal, orange accents, stickers and bold crops", colors: ["#171717", "#faf3e6", "#f07818"] },
] as const;

const LAYOUTS = [
  { id: "magazine", name: "Magazine", icon: "▥", hint: "Editorial" },
  { id: "columns", name: "Two Column", icon: "▥", hint: "Print" },
  { id: "mosaic", name: "Mosaic", icon: "▦", hint: "Dynamic" },
  { id: "gallery", name: "Gallery", icon: "▤", hint: "Photo first" },
  { id: "spotlight", name: "Spotlight", icon: "◉", hint: "Hero item" },
  { id: "rail", name: "Swipe Rail", icon: "→", hint: "Mobile" },
] as const;

const IMAGE_SHAPES = ["rounded", "circle", "square"] as const;
const MOTION = ["none", "fade", "rise", "pop", "slide"] as const;
const TEXTURES = ["none", "paper", "chalk", "grain"] as const;

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not read image");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

function updateTheme(theme: MenuTheme, key: keyof MenuTheme, value: unknown): MenuTheme {
  return { ...theme, [key]: value } as MenuTheme;
}

export function MenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang, pick, t } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [variants, setVariants] = useState<MenuTheme[]>([]);
  const [direction, setDirection] = useState("editorial");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "phone">("phone");
  const [activeTool, setActiveTool] = useState<"style" | "layout" | "type" | "motion">("style");
  const [showInspector, setShowInspector] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const restaurant = useQuery({
    queryKey: ["ultimate-menu-designer", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,slug,logo_url,cover_image_url,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["ultimate-menu-designer-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (restaurant.data?.menu_theme) setTheme(parseMenuTheme(restaurant.data.menu_theme));
  }, [restaurant.data]);

  const menuItems = useMemo(() => {
    const rows = items.data ?? [];
    if (rows.length) return rows.map((row) => ({ title: pick(row.name_en, row.name_ar), description: pick(row.description_en, row.description_ar), price: Number(row.price).toFixed(2), image: row.image_url }));
    return Array.from({ length: 6 }, (_, index) => ({ title: lang === "ar" ? `طبق مميز ${index + 1}` : `Signature dish ${index + 1}`, description: lang === "ar" ? "مكونات مختارة بعناية ووصف مختصر للطبق" : "Carefully selected ingredients and a concise description", price: "8.50", image: restaurant.data?.cover_image_url ?? null }));
  }, [items.data, restaurant.data?.cover_image_url, lang, pick]);

  const set = (key: keyof MenuTheme, value: unknown) => setTheme((current) => updateTheme(current, key, value));

  async function generateDesign() {
    setGenerating(true);
    try {
      const selected = DIRECTIONS.find((item) => item.id === direction);
      const prompt = [
        brief.trim(),
        selected ? `Visual direction: ${selected.name}. ${selected.description}.` : "",
        "Create a professional, realistic restaurant menu with a decisive composition. Use the references as visual DNA. Make food photography feel real and appetizing, with natural lighting and believable plating. Do not make a generic SaaS card layout.",
      ].filter(Boolean).join("\n");
      const result = await generate({ data: { restaurantId, brief: prompt, base: direction, images: references.length ? references : undefined } });
      const next = result.variants.map((value) => parseMenuTheme(JSON.parse(value)));
      setVariants(next);
      if (next[0]) setTheme(next[0]);
      toast.success(lang === "ar" ? "تم إنشاء التصميم بنجاح" : "Master menu design generated");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme as unknown as never }).eq("id", restaurantId);
      if (error) throw error;
      await logAudit("menu.ultimate_design_saved", { restaurantId, entity: "restaurants", entityId: restaurantId, metadata: { layout: theme.layout, template: theme.template, animation: theme.animation } });
      await queryClient.invalidateQueries({ queryKey: ["ultimate-menu-designer", restaurantId] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const selected = Array.from(files).slice(0, 5 - references.length);
      const encoded = await Promise.all(selected.map(compressImage));
      setReferences((current) => [...current, ...encoded].slice(0, 5));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  if (restaurant.isPending) return <Skeleton className="h-[760px] rounded-[2rem]" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const previewWidth = previewMode === "phone" ? "max-w-[430px]" : previewMode === "tablet" ? "max-w-[720px]" : "max-w-[1100px]";

  return (
    <div className="min-h-screen bg-[#f7f7f5] pb-8 text-[#181816]">
      <div className="mx-auto max-w-[1680px] space-y-4 p-3 sm:p-5">
        <header className="sticky top-2 z-40 rounded-[1.5rem] border border-black/5 bg-white/90 p-3 shadow-[0_10px_40px_rgba(0,0,0,.08)] backdrop-blur-xl sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#181816] text-white shadow-lg"><Wand2 className="size-5" /></div>
              <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">AI Menu Designer</h1><Badge className="hidden bg-orange-500 text-white sm:inline-flex">MASTER</Badge></div><p className="truncate text-xs text-black/50">{restaurant.data.name} · Real-time art direction studio</p></div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild><a href={`/r/${restaurant.data.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Preview</a></Button>
              <Button size="sm" disabled={saving} onClick={() => void save()}><Check className="size-4" />{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)_310px]">
          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <Panel title="Creative direction" icon={<Palette className="size-4" />}>
              <div className="grid grid-cols-2 gap-2">
                {DIRECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setDirection(item.id)} className={cn("group overflow-hidden rounded-2xl border bg-white text-start transition-all hover:-translate-y-0.5 hover:shadow-lg", direction === item.id && "border-black ring-2 ring-black/10")}>
                  <div className="relative h-20 p-2" style={{ background: `linear-gradient(135deg,${item.colors[0]},${item.colors[2]})` }}><div className="absolute inset-3 rounded-xl border border-white/30" /><div className="absolute bottom-3 start-3 h-1 w-12 rounded-full bg-white/80" /><div className="absolute bottom-3 end-3 size-5 rounded-full border border-white/50 bg-white/80" /></div>
                  <div className="p-2.5"><p className="text-xs font-semibold">{item.name}</p><p className="mt-0.5 line-clamp-2 text-[10px] text-black/45">{item.description}</p></div>
                </button>)}
              </div>
            </Panel>

            <Panel title="Reference board" icon={<Upload className="size-4" />}>
              <div className="grid grid-cols-5 gap-1.5">
                {references.map((src, index) => <div key={`${src.slice(-12)}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border"><img src={src} alt="Reference" className="size-full object-cover" /><button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white"><X className="size-3" /></button></div>)}
                {references.length < 5 && <button type="button" onClick={() => inputRef.current?.click()} className="grid aspect-square place-items-center rounded-xl border border-dashed bg-white text-black/40 transition hover:border-black hover:text-black"><ImagePlus className="size-5" /></button>}
              </div>
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addReferences(event.target.files); event.currentTarget.value = ""; }} />
              <p className="mt-2 text-[10px] leading-4 text-black/45">Upload up to 5 references. The AI reads composition, colour, typography, texture and photographic style.</p>
            </Panel>
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-[0_12px_50px_rgba(0,0,0,.06)] sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1"><div className="mb-2 flex items-center gap-2"><Sparkles className="size-4 text-orange-500" /><h2 className="font-bold">Describe the menu you want</h2><Badge variant="secondary">VISION + ART DIRECTION</Badge></div><Textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={3} className="resize-none rounded-2xl border-black/10 bg-[#fafaf8]" placeholder="Example: premium Amman shawarma menu, charcoal wood, orange accents, circular hero burger, realistic photography, elegant Arabic + English typography, editorial poster composition…" /></div>
                <Button className="h-12 shrink-0 rounded-2xl bg-[#181816] px-6 text-white hover:bg-black" disabled={generating} onClick={() => void generateDesign()}><Sparkles className="size-4" />{generating ? "Creating…" : "Generate master design"}</Button>
              </div>
            </section>

            {variants.length > 0 && <section className="rounded-[1.75rem] border border-black/5 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">AI creative directions</h3><p className="text-xs text-black/45">Select a direction, then refine every detail.</p></div><Button size="sm" variant="ghost" onClick={() => setVariants([])}><RotateCcw className="size-4" />Reset choices</Button></div><div className="grid grid-cols-3 gap-2">{variants.map((variant, index) => <button key={index} type="button" onClick={() => setTheme(variant)} className="overflow-hidden rounded-2xl border text-start transition hover:-translate-y-0.5 hover:shadow-md"><div className="h-24" style={pageBackground(variant)} /><div className="p-2 text-xs font-semibold">Direction {index + 1}</div></button>)}</div></section>}

            <section className="overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-sm">
              <div className="flex items-center gap-1 overflow-x-auto border-b bg-[#fbfbf9] p-2">
                {[{ id: "style", label: "Style" }, { id: "layout", label: "Layout" }, { id: "type", label: "Typography" }, { id: "motion", label: "Motion" }].map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTool(tab.id as typeof activeTool)} className={cn("shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition", activeTool === tab.id ? "bg-[#181816] text-white shadow" : "text-black/50 hover:bg-white hover:text-black")}>{tab.label}</button>)}
                <button type="button" onClick={() => setShowInspector((value) => !value)} className="ms-auto grid size-9 shrink-0 place-items-center rounded-xl border bg-white"><PanelRight className="size-4" /></button>
              </div>
              {showInspector && <div className="p-4 sm:p-5">
                {activeTool === "style" && <div className="grid gap-5 md:grid-cols-2"><Control title="Texture"><ChoiceRow values={TEXTURES} active={theme.texture} onSelect={(value) => set("texture", value)} /></Control><Control title="Image treatment"><ChoiceRow values={IMAGE_SHAPES} active={theme.imageShape} onSelect={(value) => set("imageShape", value)} /></Control><Control title="Background"><ChoiceRow values={["solid", "gradient", "dots", "glow"]} active={theme.bgStyle} onSelect={(value) => set("bgStyle", value)} /></Control><Control title="Card finish"><ChoiceRow values={["flat", "elevated", "outline", "glass"]} active={theme.cardStyle} onSelect={(value) => set("cardStyle", value)} /></Control><Control title="Section style"><ChoiceRow values={["plain", "boxed", "rule", "tab", "ribbon"]} active={theme.sectionStyle} onSelect={(value) => set("sectionStyle", value)} /></Control><Control title="Colour palette"><div className="grid grid-cols-4 gap-2">{(["bg", "surface", "primary", "accent"] as const).map((key) => <label key={key} className="text-[10px] font-medium uppercase text-black/40">{key}<input type="color" value={theme[key]} onChange={(event) => set(key, event.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded-xl border bg-white" /></label>)}</div></Control></div>}
                {activeTool === "layout" && <div className="grid gap-5 md:grid-cols-2"><Control title="Composition"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{LAYOUTS.map((layout) => <button key={layout.id} type="button" onClick={() => set("layout", layout.id)} className={cn("rounded-2xl border p-3 text-start transition hover:shadow", theme.layout === layout.id && "border-black bg-black/[.03] ring-2 ring-black/10")}><div className="mb-2 grid h-10 place-items-center rounded-xl bg-[#f1f1ee] text-lg">{layout.icon}</div><p className="text-xs font-semibold">{layout.name}</p><p className="text-[10px] text-black/40">{layout.hint}</p></button>)}</div></Control><div className="space-y-5"><Control title="Columns"><ChoiceRow values={["1", "2"]} active={String(theme.columns)} onSelect={(value) => set("columns", Number(value) === 2 ? 2 : 1)} /></Control><Control title="Price placement"><ChoiceRow values={["inline", "right", "leader"]} active={theme.priceStyle} onSelect={(value) => set("priceStyle", value)} /></Control><Control title="Density"><ChoiceRow values={["compact", "comfortable", "airy"]} active={theme.density} onSelect={(value) => set("density", value)} /></Control></div></div>}
                {activeTool === "type" && <div className="grid gap-5 md:grid-cols-2"><Control title="Heading font"><ChoiceRow values={["sans", "serif", "display", "condensed", "script", "rounded"]} active={theme.headingFont} onSelect={(value) => set("headingFont", value)} /></Control><Control title="Body font"><ChoiceRow values={["sans", "serif", "rounded", "mono", "display"]} active={theme.bodyFont} onSelect={(value) => set("bodyFont", value)} /></Control><Control title="Title treatment"><div className="flex gap-2"><Toggle active={theme.upperTitles} onClick={() => set("upperTitles", !theme.upperTitles)}>Uppercase</Toggle><Toggle active={theme.scriptAccent} onClick={() => set("scriptAccent", !theme.scriptAccent)}>Script accent</Toggle></div></Control><Control title="Tagline"><Textarea value={theme.tagline} onChange={(event) => set("tagline", event.target.value.slice(0, 80))} rows={2} className="rounded-xl" placeholder="A short brand line" /></Control></div>}
                {activeTool === "motion" && <div className="grid gap-5 md:grid-cols-2"><Control title="Entrance animation"><ChoiceRow values={MOTION} active={theme.animation} onSelect={(value) => set("animation", value)} /></Control><Control title="Design principle"><div className="rounded-2xl bg-[#f7f7f5] p-4 text-xs leading-5 text-black/55">Motion is intentionally restrained. Premium menus use calm fades/rise; street-food menus use pop/slide. The public QR menu remains fast, touch-friendly and readable.</div></Control></div>}
              </div>}
            </section>
          </main>

          <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-[2rem] border border-black/10 bg-[#171715] p-2 shadow-[0_25px_70px_rgba(0,0,0,.18)]">
              <div className="mb-2 flex items-center justify-between px-2 py-1 text-white"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-white/50">Live preview</span><div className="flex gap-1">{(["desktop", "tablet", "phone"] as const).map((mode) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={cn("grid size-8 place-items-center rounded-lg", previewMode === mode ? "bg-white text-black" : "text-white/50 hover:bg-white/10")}>{mode === "desktop" ? <Monitor className="size-3.5" /> : mode === "tablet" ? <Tablet className="size-3.5" /> : <Smartphone className="size-3.5" />}</button>)}</div></div>
              <div className="mx-auto overflow-hidden rounded-[1.5rem] bg-white transition-all duration-300" style={{ width: "100%", maxWidth: previewMode === "phone" ? 430 : previewMode === "tablet" ? 720 : 1100 }}>
                <LiveMenu theme={theme} restaurant={restaurant.data} items={menuItems} lang={lang} />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2"><Badge variant="outline" className="bg-white">LIVE · every edit mirrors instantly</Badge><Button size="icon" variant="outline" className="bg-white" title="Fullscreen"><Maximize2 className="size-4" /></Button></div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <section className="rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-[#f2f2ef]">{icon}</span><h2 className="text-sm font-bold">{title}</h2></div>{children}</section>; }
function Control({ title, children }: { title: string; children: ReactNode }) { return <div className="space-y-2"><Label className="text-xs font-semibold text-black/70">{title}</Label>{children}</div>; }
function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button type="button" onClick={onClick} className={cn("rounded-xl border px-3 py-2 text-xs font-medium", active ? "border-black bg-[#181816] text-white" : "bg-white text-black/50")}>{active && <Check className="me-1 inline size-3" />}{children}</button>; }
function ChoiceRow({ values, active, onSelect }: { values: readonly string[]; active: string; onSelect: (value: string) => void }) { return <div className="flex flex-wrap gap-2">{values.map((value) => <Toggle key={value} active={active === value} onClick={() => onSelect(value)}>{value}</Toggle>)}</div>; }

function LiveMenu({ theme, restaurant, items, lang }: { theme: MenuTheme; restaurant: { name: string; logo_url: string | null; cover_image_url: string | null }; items: Array<{ title: string; description: string; price: string; image: string | null }>; lang: string }) {
  const twoColumn = theme.columns === 2 || theme.layout === "columns" || theme.layout === "mosaic";
  return <div dir={lang === "ar" ? "rtl" : "ltr"} style={{ ...themeVars(theme), ...pageBackground(theme), color: theme.text, fontFamily: "var(--qs-body-font)" }} className="min-h-[650px]">
    <div className="relative overflow-hidden px-5 pb-5 pt-7 sm:px-7">
      {restaurant.cover_image_url && <img src={restaurant.cover_image_url} alt="" className="absolute inset-0 h-48 w-full object-cover opacity-20" />}
      <div className="relative z-10 flex items-end gap-4"><div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-white/20 shadow-sm">{restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="size-full object-contain" /> : <Sparkles className="size-5" />}</div><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[.25em] opacity-55">{lang === "ar" ? "قائمة الطعام" : "FOOD MENU"}</p><h2 className="mt-1 text-3xl font-black leading-none sm:text-4xl" style={{ fontFamily: "var(--qs-heading-font)" }}>{restaurant.name}</h2>{theme.tagline && <p className="mt-2 text-xs opacity-60">{theme.tagline}</p>}</div></div>
      <div className="relative z-10 mt-7 flex gap-2 overflow-x-auto pb-1"><span className="rounded-full px-4 py-2 text-[10px] font-bold" style={{ background: theme.primary, color: theme.primaryText }}>All</span><span className="rounded-full border px-4 py-2 text-[10px]">Starters</span><span className="rounded-full border px-4 py-2 text-[10px]">Mains</span><span className="rounded-full border px-4 py-2 text-[10px]">Desserts</span></div>
    </div>
    <div className="px-5 pb-7 sm:px-7"><div className="mb-4 flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.25em]" style={{ color: theme.accent }}>Signature</p><h3 className="mt-1 text-xl font-bold" style={{ fontFamily: "var(--qs-heading-font)" }}>{lang === "ar" ? "الأطباق الرئيسية" : "Main course"}</h3></div><span className="text-[10px] opacity-45">{items.length} items</span></div><div className={cn("grid gap-3", twoColumn ? "grid-cols-2" : "grid-cols-1")}>
      {items.slice(0, 8).map((item, index) => <article key={`${item.title}-${index}`} className={cn("overflow-hidden border p-2.5", theme.cardStyle === "elevated" && "shadow-lg", theme.cardStyle === "glass" && "backdrop-blur", theme.imageShape === "circle" ? "rounded-[1.5rem]" : "rounded-2xl")} style={{ background: theme.surface, borderColor: `${theme.primary}18`, animation: theme.animation !== "none" ? `${theme.animation} .55s ease both` : undefined }}>
        {theme.showImages && <div className={cn("mb-2 overflow-hidden", theme.imageShape === "circle" ? "aspect-square rounded-full" : "aspect-[1.65] rounded-xl")} style={{ background: `${theme.accent}18` }}>{item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : restaurant.cover_image_url ? <img src={restaurant.cover_image_url} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[9px] opacity-35">Realistic food photo</div>}</div>}
        <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h4 className={cn("truncate text-[11px] font-bold", theme.upperTitles && "uppercase")}>{item.title}</h4><p className="mt-1 line-clamp-2 text-[9px] leading-4 opacity-55">{item.description}</p></div><span className="shrink-0 text-[10px] font-bold" style={{ color: theme.accent }}>{theme.priceStyle === "leader" ? `··· ${item.price}` : item.price}</span></div>
      </article>)}
    </div><div className="mt-5 rounded-2xl px-4 py-3 text-center text-[10px] font-bold" style={{ background: theme.primary, color: theme.primaryText }}>View full menu</div></div>
  </div>;
}
