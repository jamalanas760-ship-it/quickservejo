import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  ImagePlus,
  LayoutGrid,
  Maximize2,
  Monitor,
  Palette,
  Play,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Type,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { generateMenuTheme } from "@/lib/theme.functions";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_THEME,
  parseMenuTheme,
  type AnimationId,
  type FontId,
  type ImageShape,
  type LayoutId,
  type MenuTheme,
} from "@/lib/menu-theme";
import { cn } from "@/lib/utils";

const DIRECTIONS = [
  { id: "editorial", name: "Dark Editorial", note: "Luxury · dramatic · magazine", image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=700&q=88" },
  { id: "kraft", name: "Kraft Bistro", note: "Warm paper · handmade · premium", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=88" },
  { id: "poster", name: "Modern Poster", note: "Bold · geometric · high impact", image: "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=700&q=88" },
  { id: "levantine", name: "Modern Levantine", note: "Olive · terracotta · organic", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=88" },
  { id: "minimal", name: "Minimal Luxe", note: "Quiet luxury · clean · airy", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=88" },
  { id: "street", name: "Street Food", note: "Energetic · bold · playful", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=88" },
] as const;

const LAYOUTS: { id: LayoutId; name: string; note: string }[] = [
  { id: "magazine", name: "Magazine", note: "Editorial hierarchy" },
  { id: "columns", name: "Columns", note: "Print-ready" },
  { id: "mosaic", name: "Mosaic", note: "Dynamic photo grid" },
  { id: "gallery", name: "Gallery", note: "Photo first" },
  { id: "spotlight", name: "Spotlight", note: "Hero dish" },
  { id: "rail", name: "Swipe rail", note: "Mobile-first" },
];

const FONTS: { id: FontId; name: string }[] = [
  { id: "sans", name: "Modern Sans" },
  { id: "serif", name: "Editorial Serif" },
  { id: "display", name: "Elegant Display" },
  { id: "condensed", name: "Bold Condensed" },
  { id: "rounded", name: "Friendly Rounded" },
  { id: "script", name: "Handwritten" },
];

const MOTIONS: { id: AnimationId; name: string }[] = [
  { id: "none", name: "Still" },
  { id: "fade", name: "Fade" },
  { id: "rise", name: "Rise" },
  { id: "pop", name: "Pop" },
  { id: "slide", name: "Slide" },
];

const IMAGE_SHAPES: ImageShape[] = ["rounded", "circle", "square"];

type Tool = "style" | "layout" | "type" | "motion";
type PreviewMode = "phone" | "tablet" | "desktop";

function cssFont(font: FontId) {
  const map: Record<FontId, string> = {
    sans: "ui-sans-serif,system-ui,sans-serif",
    serif: "Georgia,serif",
    rounded: "Trebuchet MS,system-ui,sans-serif",
    mono: "ui-monospace,monospace",
    display: "Palatino Linotype,Georgia,serif",
    condensed: "Arial Narrow,Impact,sans-serif",
    script: "Brush Script MT,cursive",
  };
  return map[font];
}

function setThemeValue(theme: MenuTheme, key: keyof MenuTheme, value: unknown): MenuTheme {
  return { ...theme, [key]: value } as MenuTheme;
}

async function readImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process image");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}

export function MasterMenuDesignerMobile({ restaurantId }: { restaurantId: string }) {
  const { lang, pick, t } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [direction, setDirection] = useState("kraft");
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>("style");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

  const restaurant = useQuery({
    queryKey: ["master-menu-designer", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id,name,slug,logo_url,cover_image_url,menu_theme,currency")
        .eq("id", restaurantId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["master-menu-designer-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id,name_en,name_ar,description_en,description_ar,price,image_url")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("display_order", { ascending: true })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (restaurant.data?.menu_theme) setTheme(parseMenuTheme(restaurant.data.menu_theme));
  }, [restaurant.data]);

  const dishes = useMemo(() => {
    const rows = items.data ?? [];
    if (rows.length) {
      return rows.slice(0, 6).map((row) => ({
        name: pick(row.name_en, row.name_ar),
        description: pick(row.description_en, row.description_ar),
        price: Number(row.price).toFixed(2),
        image: row.image_url,
      }));
    }
    return [
      { name: "Chicken Shawarma", description: "Charcoal chicken, garlic sauce, pickles & fresh herbs", price: "4.25", image: DIRECTIONS[1].image },
      { name: "Beef Shawarma", description: "Thin sliced beef, tahini, pickles & parsley", price: "4.75", image: DIRECTIONS[2].image },
      { name: "Mix Shawarma", description: "Chicken & beef, garlic sauce, pickles & fries", price: "4.75", image: DIRECTIONS[3].image },
      { name: "Shawarma Plate", description: "Saj bread, fries, pickles & signature sauce", price: "6.50", image: DIRECTIONS[5].image },
      { name: "Hummus", description: "Creamy chickpeas, tahini, olive oil & lemon", price: "2.50", image: DIRECTIONS[3].image },
      { name: "Fattoush", description: "Crisp bread, vegetables, sumac & pomegranate", price: "2.75", image: DIRECTIONS[4].image },
    ];
  }, [items.data, pick]);

  const set = (key: keyof MenuTheme, value: unknown) => setTheme((current) => setThemeValue(current, key, value));

  async function generateDesign() {
    setGenerating(true);
    try {
      const selected = DIRECTIONS.find((item) => item.id === direction);
      const prompt = [
        brief.trim(),
        selected ? `Creative direction: ${selected.name}. ${selected.note}.` : "",
        `Layout: ${theme.layout}. Heading font: ${theme.headingFont}. Body font: ${theme.bodyFont}. Image shape: ${theme.imageShape}. Animation: ${theme.animation}.`,
        "Act as an award-winning restaurant menu art director. Use uploaded references as visual DNA. Create a realistic, human-designed menu with intentional hierarchy, typography, spacing, image crops, colour harmony, print/editorial quality and strong food photography. Avoid generic SaaS cards and avoid template-like repetition.",
      ].filter(Boolean).join("\n");
      const result = await generate({ data: { restaurantId, brief: prompt, base: direction, images: references.length ? references : undefined } });
      const generated = result.variants.map((value) => parseMenuTheme(JSON.parse(value)));
      if (generated[0]) setTheme(generated[0]);
      toast.success(lang === "ar" ? "تم إنشاء التصميم الرئيسي" : "Master design generated");
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
      await queryClient.invalidateQueries({ queryKey: ["master-menu-designer", restaurantId] });
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
      const next = await Promise.all(Array.from(files).slice(0, 5 - references.length).map(readImage));
      setReferences((current) => [...current, ...next].slice(0, 5));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  if (restaurant.isPending) return <div className="min-h-[760px] animate-pulse rounded-3xl bg-muted/40" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const previewMax = previewMode === "phone" ? "max-w-[390px]" : previewMode === "tablet" ? "max-w-[720px]" : "max-w-[1040px]";
  const motionClass = theme.animation === "fade" ? "animate-[fadeIn_.45s_ease-out]" : theme.animation === "rise" ? "animate-[riseIn_.45s_ease-out]" : theme.animation === "pop" ? "animate-[popIn_.35s_ease-out]" : theme.animation === "slide" ? "animate-[slideIn_.45s_ease-out]" : "";

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#171716]">
      <div className="mx-auto max-w-[1720px] px-3 pb-6 pt-3 sm:px-5 sm:pt-5">
        <header className="sticky top-2 z-50 mb-3 rounded-[22px] border border-black/[0.06] bg-white/95 px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,.07)] backdrop-blur-xl sm:px-4">
          <div className="flex min-h-12 items-center gap-2.5">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#171716] text-white sm:size-11 sm:rounded-2xl"><Wand2 className="size-[18px]" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5"><h1 className="truncate text-[17px] font-bold tracking-[-0.02em] sm:text-xl">AI Menu Designer</h1><span className="rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">MASTER</span></div>
              <p className="truncate text-[11px] text-black/45 sm:text-xs">{restaurant.data.name} · Real-time art direction studio</p>
            </div>
            <div className="hidden items-center gap-1 rounded-xl border bg-[#fafaf8] p-1 md:flex">
              {(["phone", "tablet", "desktop"] as PreviewMode[]).map((mode) => <button key={mode} type="button" aria-label={`Preview ${mode}`} onClick={() => setPreviewMode(mode)} className={cn("grid size-8 place-items-center rounded-lg text-black/45 transition", previewMode === mode && "bg-white text-black shadow-sm")}>
                {mode === "phone" ? <Smartphone className="size-4" /> : mode === "tablet" ? <Tablet className="size-4" /> : <Monitor className="size-4" />}
              </button>)}
            </div>
            <a href={`/r/${restaurant.data.slug}`} target="_blank" rel="noreferrer" className="hidden h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium sm:flex"><ExternalLink className="size-3.5" />Preview</a>
            <button type="button" disabled={saving} onClick={() => void save()} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#171716] px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60 sm:h-10 sm:px-4"><Save className="size-3.5" />{saving ? "Saving" : "Save"}</button>
          </div>
        </header>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,620px)_minmax(0,1fr)] xl:items-start">
          <section className="min-w-0 space-y-3">
            <SectionCard number="01" title="Creative direction" icon={<Palette className="size-4" />} action={<button type="button" className="text-[11px] font-medium text-black/45">See all</button>}>
              <div className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {DIRECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setDirection(item.id)} className={cn("w-[122px] shrink-0 snap-start overflow-hidden rounded-2xl border bg-white text-left transition-all", direction === item.id ? "border-orange-500 ring-2 ring-orange-500/15" : "border-black/[0.08] hover:-translate-y-0.5 hover:shadow-md")}>
                  <div className="relative h-[82px] overflow-hidden bg-neutral-200"><img src={item.image} alt={item.name} className="size-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />{direction === item.id && <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-white text-black shadow"><Check className="size-3" /></span>}</div>
                  <div className="p-2.5"><p className="text-[11px] font-semibold leading-4">{item.name}</p><p className="mt-0.5 line-clamp-2 text-[9px] leading-3.5 text-black/45">{item.note}</p></div>
                </button>)}
              </div>
            </SectionCard>

            <SectionCard number="02" title="Reference board" icon={<Upload className="size-4" />} action={<span className="text-[11px] text-black/40">{references.length}/5</span>}>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" disabled={references.length >= 5} onClick={() => uploadRef.current?.click()} className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-2xl border border-dashed border-black/15 bg-[#fafaf8] text-black/45 transition hover:border-black hover:text-black disabled:opacity-40"><div className="text-center"><ImagePlus className="mx-auto size-5" /><span className="mt-1 block text-[9px]">Add image</span></div></button>
                {references.map((src, index) => <div key={`${src.slice(-12)}-${index}`} className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-2xl border"><img src={src} alt="Reference" className="size-full object-cover" /><button type="button" aria-label="Remove reference" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-black/70 text-white"><X className="size-3" /></button></div>)}
              </div>
              <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(event) => { void addReferences(event.target.files); event.currentTarget.value = ""; }} />
              <p className="mt-2 text-[10px] leading-4 text-black/40">Upload real menu references. AI reads composition, colour, typography, texture and photography style.</p>
            </SectionCard>

            <SectionCard number="03" title="Describe the menu you want" icon={<Sparkles className="size-4" />} action={<span className="rounded-full bg-[#f3eee2] px-2 py-1 text-[9px] font-semibold text-black/60">VISION + ART</span>}>
              <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4} maxLength={800} className="w-full resize-none rounded-2xl border border-black/[0.08] bg-[#fafaf8] px-3.5 py-3 text-[12px] leading-5 outline-none transition placeholder:text-black/30 focus:border-black/25 focus:ring-4 focus:ring-black/[0.04]" placeholder="Example: premium Amman shawarma menu, warm kraft paper, charcoal accents, realistic food photography, elegant Arabic + English typography, editorial composition…" />
              <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[9px] text-black/35">{brief.length}/800</span><button type="button" disabled={generating} onClick={() => void generateDesign()} className="flex h-10 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[11px] font-semibold text-white shadow-[0_5px_18px_rgba(0,0,0,.14)] transition hover:-translate-y-px hover:bg-black disabled:opacity-60"><Sparkles className="size-3.5" />{generating ? "Creating…" : "Generate master design"}</button></div>
            </SectionCard>

            <section className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white shadow-[0_8px_30px_rgba(0,0,0,.045)]">
              <div className="flex overflow-x-auto border-b border-black/[0.06] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {([
                  ["style", "Style", Palette],
                  ["layout", "Layout", LayoutGrid],
                  ["type", "Typography", Type],
                  ["motion", "Motion", Play],
                ] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setActiveTool(id)} className={cn("flex h-11 shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium transition", activeTool === id ? "border-b-2 border-black text-black" : "text-black/45") }><Icon className="size-3.5" />{label}</button>)}
                <button type="button" onClick={() => setTheme(DEFAULT_THEME)} className="ml-auto mr-1 grid size-8 shrink-0 place-items-center self-center rounded-lg text-black/35 hover:bg-black/5" aria-label="Reset"><RotateCcw className="size-3.5" /></button>
              </div>
              <div className="p-3 sm:p-4">
                {activeTool === "style" && <div className="grid gap-3 sm:grid-cols-2"><ControlGroup title="Image shape"><Pills values={IMAGE_SHAPES} value={theme.imageShape} onChange={(value) => set("imageShape", value)} /></ControlGroup><ControlGroup title="Texture"><Pills values={["none", "paper", "chalk", "grain"]} value={theme.texture} onChange={(value) => set("texture", value)} /></ControlGroup><ControlGroup title="Background"><Pills values={["solid", "gradient", "dots", "glow"]} value={theme.bgStyle} onChange={(value) => set("bgStyle", value)} /></ControlGroup><ControlGroup title="Card finish"><Pills values={["flat", "elevated", "outline", "glass"]} value={theme.cardStyle} onChange={(value) => set("cardStyle", value)} /></ControlGroup><ControlGroup title="Section style"><Pills values={["plain", "boxed", "rule", "tab", "ribbon"]} value={theme.sectionStyle} onChange={(value) => set("sectionStyle", value)} /></ControlGroup><ControlGroup title="Density"><Pills values={["compact", "comfortable", "airy"]} value={theme.density} onChange={(value) => set("density", value)} /></ControlGroup></div>}
                {activeTool === "layout" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{LAYOUTS.map((item) => <button key={item.id} type="button" onClick={() => set("layout", item.id)} className={cn("rounded-xl border p-3 text-left transition", theme.layout === item.id ? "border-black bg-[#171716] text-white" : "border-black/10 bg-[#fafaf8] hover:border-black/25")}><div className="mb-2 grid size-7 place-items-center rounded-lg bg-white/10"><LayoutGrid className="size-3.5" /></div><p className="text-[11px] font-semibold">{item.name}</p><p className={cn("mt-0.5 text-[9px]", theme.layout === item.id ? "text-white/55" : "text-black/40")}>{item.note}</p></button>)}</div>}
                {activeTool === "type" && <div className="grid gap-4 sm:grid-cols-2"><ControlGroup title="Heading font"><Pills values={FONTS.map((font) => font.id)} labels={FONTS.map((font) => font.name)} value={theme.headingFont} onChange={(value) => set("headingFont", value)} /></ControlGroup><ControlGroup title="Body font"><Pills values={FONTS.map((font) => font.id)} labels={FONTS.map((font) => font.name)} value={theme.bodyFont} onChange={(value) => set("bodyFont", value)} /></ControlGroup><label className="flex items-center justify-between rounded-xl border border-black/10 bg-[#fafaf8] px-3 py-2.5 text-[11px]"><span>Uppercase section titles</span><input type="checkbox" checked={theme.upperTitles} onChange={(event) => set("upperTitles", event.target.checked)} /></label><label className="flex items-center justify-between rounded-xl border border-black/10 bg-[#fafaf8] px-3 py-2.5 text-[11px]"><span>Handwritten accent</span><input type="checkbox" checked={theme.scriptAccent} onChange={(event) => set("scriptAccent", event.target.checked)} /></label></div>}
                {activeTool === "motion" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{MOTIONS.map((item) => <button key={item.id} type="button" onClick={() => set("animation", item.id)} className={cn("rounded-xl border px-2 py-3 text-center text-[10px] font-semibold transition", theme.animation === item.id ? "border-black bg-[#171716] text-white" : "border-black/10 bg-[#fafaf8] hover:border-black/25")}><Play className="mx-auto mb-1 size-3.5" />{item.name}</button>)}</div>}
              </div>
            </section>
          </section>

          <section className="min-w-0 xl:sticky xl:top-[82px]">
            <div className="overflow-hidden rounded-[24px] border border-black/[0.08] bg-[#151514] shadow-[0_20px_70px_rgba(0,0,0,.16)]">
              <div className="flex h-12 items-center gap-2 border-b border-white/10 px-3 text-white sm:px-4"><span className="text-[10px] font-semibold tracking-[0.12em] text-white/55">LIVE PREVIEW</span><span className="size-1.5 rounded-full bg-emerald-400" /><div className="ml-auto hidden items-center gap-1 rounded-lg bg-white/[0.06] p-1 md:flex">{(["phone", "tablet", "desktop"] as PreviewMode[]).map((mode) => <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={cn("grid size-7 place-items-center rounded-md text-white/45", previewMode === mode && "bg-white text-black")} >{mode === "phone" ? <Smartphone className="size-3.5" /> : mode === "tablet" ? <Tablet className="size-3.5" /> : <Monitor className="size-3.5" />}</button>)}</div><button type="button" onClick={() => setPreviewOpen((value) => !value)} className="grid size-8 place-items-center rounded-lg text-white/65 hover:bg-white/10 md:hidden"><ChevronDown className={cn("size-4 transition-transform", !previewOpen && "-rotate-90")} /></button></div>
              {previewOpen && <div className="overflow-auto p-3 sm:p-5"><div className={cn("mx-auto w-full transition-all duration-300", previewMax)}><div className="overflow-hidden rounded-[20px] border border-black/10 bg-white shadow-2xl" style={{ background: theme.bg, color: theme.text, fontFamily: cssFont(theme.bodyFont) }}>
                <div className="relative overflow-hidden border-b border-black/10 p-5 sm:p-7" style={{ background: theme.bgStyle === "gradient" ? `linear-gradient(135deg,${theme.bg},${theme.surface})` : theme.bg }}>
                  <div className="absolute -right-12 -top-12 size-36 rounded-full bg-black/5" /><div className="relative flex items-end gap-4"><div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">{restaurant.data.logo_url ? <img src={restaurant.data.logo_url} alt="Logo" className="size-full object-contain" /> : <span className="text-xl font-bold">S</span>}</div><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.28em] opacity-50">Fire spit roasted · Amman</p><h2 className="mt-1 text-3xl font-black tracking-tight sm:text-5xl" style={{ fontFamily: cssFont(theme.headingFont) }}>{restaurant.data.name || "SHAWARMA"}</h2>{theme.tagline && <p className="mt-1 text-xs opacity-55">{theme.tagline}</p>}</div></div>
                  <div className="mt-5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><span className="rounded-full px-3 py-1.5 text-[9px] font-semibold" style={{ background: theme.primary, color: theme.primaryText }}>All</span>{["Starters", "Mains", "Sides", "Drinks"].map((tab) => <span key={tab} className="rounded-full border border-black/10 px-3 py-1.5 text-[9px] font-medium opacity-70">{tab}</span>)}</div>
                </div>
                <div className="p-4 sm:p-6"><div className="mb-4 flex items-end justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[0.25em]" style={{ color: theme.accent }}>Featured</p><h3 className="text-xl font-bold sm:text-2xl" style={{ fontFamily: cssFont(theme.headingFont) }}>{theme.upperTitles ? "MAIN COURSE" : "Main Course"}</h3></div><span className="text-[9px] opacity-40">{dishes.length} items</span></div><div className={cn("grid gap-3", theme.layout === "grid" || theme.columns === 2 || theme.layout === "mosaic" ? "sm:grid-cols-2" : "grid-cols-1")}>
                  {dishes.map((dish, index) => <article key={`${dish.name}-${index}`} className={cn("group overflow-hidden border border-black/10", motionClass, theme.cardStyle === "elevated" && "shadow-md", theme.cardStyle === "glass" && "bg-white/50 backdrop-blur", theme.imageShape === "rounded" && "rounded-2xl", theme.imageShape === "circle" && "rounded-[28px]", theme.imageShape === "square" && "rounded-none")} style={{ background: theme.surface }}>
                    <div className={cn("flex gap-3 p-2.5", theme.layout === "gallery" || theme.layout === "spotlight" ? "flex-col" : "items-center")}>
                      {theme.showImages && <img src={dish.image || restaurant.data.cover_image_url || DIRECTIONS[1].image} alt={dish.name} className={cn("shrink-0 object-cover", theme.layout === "gallery" || theme.layout === "spotlight" ? "h-36 w-full" : "size-[76px]", theme.imageShape === "circle" && "rounded-full", theme.imageShape === "rounded" && "rounded-xl", theme.imageShape === "square" && "rounded-none")} />}
                      <div className="min-w-0 flex-1 py-1"><div className="flex items-start justify-between gap-2"><h4 className="text-[13px] font-bold leading-5">{dish.name}</h4><span className="shrink-0 text-[11px] font-bold" style={{ color: theme.accent }}>{restaurant.data.currency || "JOD"} {dish.price}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-4 opacity-55">{dish.description}</p></div>
                    </div>
                  </article>)}
                </div></div><div className="border-t px-5 py-4 text-center text-[9px] font-medium tracking-wide opacity-55" style={{ borderColor: `${theme.text}20`, background: theme.primary, color: theme.primaryText }}>FRESH INGREDIENTS · AUTHENTIC RECIPES · GRILLED TO PERFECTION</div>
              </div></div><div className="mt-3 flex items-center justify-end gap-2 text-white/55"><button type="button" className="grid size-8 place-items-center rounded-lg border border-white/10 hover:bg-white/10"><Maximize2 className="size-3.5" /></button><span className="text-[10px]">Live · changes appear instantly</span></div></div>}
            </div>
          </section>
        </div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes riseIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes popIn{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}@keyframes slideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

function SectionCard({ number, title, icon, action, children }: { number: string; title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-[20px] border border-black/[0.07] bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,.045)] sm:p-4"><div className="mb-3 flex items-center gap-2"><span className="grid size-6 place-items-center rounded-lg bg-[#f2f1ed] text-[9px] font-bold text-black/45">{number}</span><span className="grid size-7 place-items-center rounded-lg bg-[#fafaf8] text-black/70">{icon}</span><h2 className="text-[13px] font-bold">{title}</h2><div className="ml-auto">{action}</div></div>{children}</section>;
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-black/45">{title}</p>{children}</div>;
}

function Pills({ values, value, onChange, labels }: { values: readonly string[]; value: string; onChange: (value: any) => void; labels?: readonly string[] }) {
  return <div className="flex flex-wrap gap-1.5">{values.map((item, index) => <button key={item} type="button" onClick={() => onChange(item)} className={cn("rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition", value === item ? "border-[#171716] bg-[#171716] text-white" : "border-black/10 bg-white text-black/55 hover:border-black/25")}>{labels?.[index] ?? item}</button>)}</div>;
}
