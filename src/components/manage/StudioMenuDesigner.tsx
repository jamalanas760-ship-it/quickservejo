import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, ImagePlus, Maximize2, Monitor, Palette, Play, RotateCcw, Save, Sparkles, Smartphone, Tablet, Type, Upload, Wand2, X } from "lucide-react";
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
  { id: "editorial", name: "Dark Editorial", description: "Luxury black, dramatic food photography and magazine hierarchy", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=85", accent: "#c88742" },
  { id: "kraft", name: "Kraft Bistro", description: "Warm paper, vintage print texture and premium human feel", image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=700&q=85", accent: "#b94b2b" },
  { id: "poster", name: "Modern Poster", description: "Bold type, geometric framing and high-impact food photography", image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=700&q=85", accent: "#e07b18" },
  { id: "levantine", name: "Modern Levantine", description: "Olive, terracotta, organic curves and refined hospitality", image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=700&q=85", accent: "#b66b43" },
  { id: "minimal", name: "Minimal Luxe", description: "Quiet luxury, generous whitespace and precise typography", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=700&q=85", accent: "#b28a52" },
  { id: "street", name: "Street Food", description: "Energetic charcoal, orange accents and bold editorial crops", image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=700&q=85", accent: "#f07818" },
] as const;

const LAYOUTS = [
  ["magazine", "Magazine", "Editorial"], ["columns", "Two column", "Print"], ["mosaic", "Mosaic", "Dynamic"],
  ["gallery", "Gallery", "Photo first"], ["spotlight", "Spotlight", "Hero item"], ["rail", "Swipe rail", "Mobile"],
] as const;

const FONTS = ["sans", "serif", "rounded", "display", "condensed", "script"] as const;
const MOTION = ["none", "fade", "rise", "pop", "slide"] as const;
const TEXTURES = ["none", "paper", "chalk", "grain"] as const;

const FOOD_FALLBACKS = [
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=85",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85",
];

async function compressImage(file: File) {
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
}

function patch(theme: MenuTheme, key: keyof MenuTheme, value: unknown): MenuTheme {
  return { ...theme, [key]: value } as MenuTheme;
}

export function StudioMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang, pick, t } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const inputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [direction, setDirection] = useState("editorial");
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<"style" | "layout" | "type" | "motion">("style");
  const [previewMode, setPreviewMode] = useState<"phone" | "tablet" | "desktop">("phone");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllTools, setShowAllTools] = useState(true);

  const restaurant = useQuery({
    queryKey: ["studio-menu-designer", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,slug,logo_url,cover_image_url,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["studio-menu-designer-items", restaurantId],
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
    if (rows.length) return rows.map((row, i) => ({ title: pick(row.name_en, row.name_ar), description: pick(row.description_en, row.description_ar), price: Number(row.price).toFixed(2), image: row.image_url || FOOD_FALLBACKS[i % FOOD_FALLBACKS.length] }));
    return Array.from({ length: 6 }, (_, i) => ({ title: lang === "ar" ? `طبق مميز ${i + 1}` : `Signature dish ${i + 1}`, description: lang === "ar" ? "مكونات مختارة بعناية ووصف مختصر للطبق" : "Carefully selected ingredients and a concise description", price: "8.50", image: FOOD_FALLBACKS[i % FOOD_FALLBACKS.length] }));
  }, [items.data, lang, pick]);

  const set = (key: keyof MenuTheme, value: unknown) => setTheme((current) => patch(current, key, value));

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

  async function generateDesign() {
    setGenerating(true);
    try {
      const selected = DIRECTIONS.find((item) => item.id === direction);
      const prompt = [brief.trim(), selected ? `Creative direction: ${selected.name}. ${selected.description}.` : "", "Create a realistic, professionally art-directed restaurant menu. Use reference images as visual DNA. Prioritize believable food photography, strong hierarchy, refined spacing and a distinctive human-designed composition. Never return a generic SaaS card layout."] .filter(Boolean).join("\n");
      const result = await generate({ data: { restaurantId, brief: prompt, base: direction, images: references.length ? references : undefined } });
      const next = result.variants.map((value) => parseMenuTheme(JSON.parse(value)));
      if (next[0]) setTheme(next[0]);
      toast.success(lang === "ar" ? "تم إنشاء التصميم" : "Master design generated");
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
      await logAudit("menu.studio_design_saved", { restaurantId, entity: "restaurants", entityId: restaurantId, metadata: { layout: theme.layout, template: theme.template, animation: theme.animation } });
      await queryClient.invalidateQueries({ queryKey: ["studio-menu-designer", restaurantId] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setSaving(false);
    }
  }

  if (restaurant.isPending) return <Skeleton className="h-[780px] rounded-[2rem]" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const previewMax = previewMode === "phone" ? "max-w-[430px]" : previewMode === "tablet" ? "max-w-[720px]" : "max-w-[1080px]";

  return (
    <div className="min-h-screen bg-[#f5f5f3] text-[#171716]">
      <div className="mx-auto max-w-[1760px] p-3 sm:p-5 lg:p-6">
        <header className="sticky top-2 z-50 mb-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-black/[0.07] bg-white/90 p-3 shadow-[0_12px_40px_rgba(0,0,0,.08)] backdrop-blur-xl sm:p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#181816] text-white sm:size-11 sm:rounded-2xl"><Wand2 className="size-5" /></div>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Menu Design Studio</h1><Badge className="hidden bg-orange-500 text-white sm:inline-flex">MASTER</Badge></div><p className="truncate text-xs text-black/45">{restaurant.data.name} · Art direction + live menu preview</p></div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" asChild><a href={`/r/${restaurant.data.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open menu</a></Button>
            <Button size="sm" className="flex-1 sm:flex-none" disabled={saving} onClick={() => void save()}><Save className="size-4" />{saving ? "Saving…" : "Save design"}</Button>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          <aside className="min-w-0 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1">
            <div className="space-y-3">
              <Panel title="Creative direction" icon={<Palette className="size-4" />}>
                <div className="grid grid-cols-2 gap-2">
                  {DIRECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setDirection(item.id)} className={cn("group overflow-hidden rounded-2xl border bg-white text-start transition-all hover:-translate-y-0.5 hover:shadow-md", direction === item.id && "border-black ring-2 ring-black/10")}>
                    <div className="relative h-24 overflow-hidden">
                      <img src={item.image} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                      <span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-bold" style={{ color: item.accent }}>{item.name}</span>
                    </div>
                    <div className="p-2.5"><p className="text-[10px] leading-4 text-black/55">{item.description}</p></div>
                  </button>)}
                </div>
              </Panel>

              <Panel title="Reference board" icon={<Upload className="size-4" />}>
                <div className="grid grid-cols-5 gap-2">
                  {references.map((src, i) => <div key={`${src.slice(-14)}-${i}`} className="relative aspect-square overflow-hidden rounded-xl border"><img src={src} alt="Reference" className="size-full object-cover" /><button type="button" aria-label="Remove reference" onClick={() => setReferences((current) => current.filter((_, index) => index !== i))} className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white"><X className="size-3" /></button></div>)}
                  {references.length < 5 && <button type="button" onClick={() => inputRef.current?.click()} className="grid aspect-square place-items-center rounded-xl border border-dashed bg-white text-black/35 transition hover:border-black hover:text-black"><ImagePlus className="size-5" /></button>}
                </div>
                <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addReferences(e.target.files); e.currentTarget.value = ""; }} />
                <p className="mt-2 text-[10px] leading-4 text-black/45">Add up to 5 references. The AI uses composition, colour, typography, texture and photography as visual DNA.</p>
              </Panel>

              <Panel title="Describe the menu you want" icon={<Sparkles className="size-4" />}>
                <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} className="resize-none rounded-2xl border-black/10 bg-[#fafaf8]" placeholder="Example: premium Amman shawarma menu, charcoal wood, orange accents, realistic food photography, elegant Arabic + English typography, editorial poster composition…" />
                <Button className="mt-3 h-11 w-full rounded-xl bg-[#181816] text-white hover:bg-black" disabled={generating} onClick={() => void generateDesign()}><Sparkles className="size-4" />{generating ? "Creating master design…" : "Generate master design"}</Button>
              </Panel>

              <Panel title="Design controls" icon={<Type className="size-4" />} action={<button type="button" onClick={() => setShowAllTools((value) => !value)} className="text-xs text-black/45 hover:text-black">{showAllTools ? "Collapse" : "Expand"}</button>}>
                <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/[0.035] p-1">
                  {[{ id: "style", label: "Style", icon: Palette }, { id: "layout", label: "Layout", icon: Tablet }, { id: "type", label: "Type", icon: Type }, { id: "motion", label: "Motion", icon: Play }].map((tool) => { const Icon = tool.icon; return <button key={tool.id} type="button" onClick={() => setActiveTool(tool.id as typeof activeTool)} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold", activeTool === tool.id ? "bg-white shadow-sm" : "text-black/45 hover:text-black")}><Icon className="size-4" /><span>{tool.label}</span></button>; })}
                </div>
                {showAllTools && <div className="mt-4 space-y-4">
                  {activeTool === "style" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <Control title="Texture"><div className="flex flex-wrap gap-1.5">{TEXTURES.map((value) => <Choice key={value} active={theme.texture === value} onClick={() => set("texture", value)}>{value}</Choice>)}</div></Control>
                    <Control title="Background finish"><div className="flex flex-wrap gap-1.5">{["solid", "gradient", "dots", "glow"].map((value) => <Choice key={value} active={theme.bgStyle === value} onClick={() => set("bgStyle", value)}>{value}</Choice>)}</div></Control>
                    <Control title="Card style"><div className="flex flex-wrap gap-1.5">{["flat", "elevated", "outline", "glass"].map((value) => <Choice key={value} active={theme.cardStyle === value} onClick={() => set("cardStyle", value)}>{value}</Choice>)}</div></Control>
                    <Control title="Colours"><div className="grid grid-cols-4 gap-2">{(["bg", "surface", "primary", "accent"] as const).map((key) => <label key={key} className="space-y-1 text-[9px] text-black/45">{key}<input type="color" value={theme[key]} onChange={(e) => set(key, e.target.value)} className="h-9 w-full cursor-pointer rounded-lg border bg-white" /></label>)}</div></Control>
                  </div>}
                  {activeTool === "layout" && <div className="space-y-4">
                    <Control title="Composition"><div className="grid grid-cols-2 gap-2">{LAYOUTS.map(([id, label, hint]) => <button key={id} type="button" onClick={() => set("layout", id)} className={cn("rounded-xl border bg-white p-2.5 text-start transition hover:shadow-sm", theme.layout === id && "border-black ring-2 ring-black/10")}><div className="mb-2 h-9 rounded-lg bg-black/[0.05] p-1"><div className={cn("size-full rounded bg-black/10", id === "columns" ? "grid grid-cols-2 gap-1" : id === "mosaic" ? "grid grid-cols-3 gap-1" : "")}><i className="rounded bg-black/15"/><i className="rounded bg-black/10"/></div></div><p className="text-[10px] font-bold">{label}</p><p className="text-[9px] text-black/40">{hint}</p></button>)}</div></Control>
                    <Control title="Image shape"><div className="flex flex-wrap gap-1.5">{["rounded", "circle", "square"].map((value) => <Choice key={value} active={theme.imageShape === value} onClick={() => set("imageShape", value)}>{value}</Choice>)}</div></Control>
                    <div className="grid grid-cols-2 gap-3"><Control title="Columns"><div className="flex gap-1.5"><Choice active={theme.columns === 1} onClick={() => set("columns", 1)}>1</Choice><Choice active={theme.columns === 2} onClick={() => set("columns", 2)}>2</Choice></div></Control><Control title="Price"><div className="flex flex-wrap gap-1.5">{["inline", "right", "leader"].map((value) => <Choice key={value} active={theme.priceStyle === value} onClick={() => set("priceStyle", value)}>{value}</Choice>)}</div></Control></div>
                  </div>}
                  {activeTool === "type" && <div className="space-y-4">
                    <Control title="Heading typography"><div className="grid grid-cols-2 gap-1.5">{FONTS.map((value) => <Choice key={value} active={theme.headingFont === value} onClick={() => set("headingFont", value)}>{value}</Choice>)}</div></Control>
                    <Control title="Body typography"><div className="grid grid-cols-2 gap-1.5">{FONTS.slice(0, 5).map((value) => <Choice key={value} active={theme.bodyFont === value} onClick={() => set("bodyFont", value)}>{value}</Choice>)}</div></Control>
                    <Control title="Title treatment"><div className="flex flex-wrap gap-1.5"><Choice active={theme.upperTitles} onClick={() => set("upperTitles", !theme.upperTitles)}>Uppercase</Choice><Choice active={theme.scriptAccent} onClick={() => set("scriptAccent", !theme.scriptAccent)}>Script accent</Choice></div></Control>
                    <Control title="Tagline"><Textarea rows={2} value={theme.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 80))} placeholder="A short brand line" /></Control>
                  </div>}
                  {activeTool === "motion" && <div className="space-y-4"><Control title="Entrance motion"><div className="grid grid-cols-2 gap-1.5">{MOTION.map((value) => <Choice key={value} active={theme.animation === value} onClick={() => set("animation", value)}>{value}</Choice>)}</div></Control><div className="rounded-xl border bg-black/[0.025] p-3 text-[10px] leading-4 text-black/50">Motion is applied to the live preview so you can see the final interaction feel before saving.</div></div>}
                </div>}
              </Panel>
            </div>
          </aside>

          <main className="min-w-0">
            <section className="overflow-hidden rounded-[2rem] border border-black/[0.07] bg-white shadow-[0_20px_70px_rgba(0,0,0,.08)]">
              <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.06] bg-white/95 p-3 sm:p-4">
                <div className="mr-auto"><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Live preview</p><p className="text-[11px] text-black/35">Changes update instantly</p></div>
                <div className="flex rounded-xl bg-black/[0.04] p-1"><PreviewButton active={previewMode === "phone"} onClick={() => setPreviewMode("phone")} icon={<Smartphone className="size-4" />} label="Phone" /><PreviewButton active={previewMode === "tablet"} onClick={() => setPreviewMode("tablet")} icon={<Tablet className="size-4" />} label="Tablet" /><PreviewButton active={previewMode === "desktop"} onClick={() => setPreviewMode("desktop")} icon={<Monitor className="size-4" />} label="Desktop" /></div>
                <Button variant="outline" size="icon" title="Fullscreen preview"><Maximize2 className="size-4" /></Button>
              </div>
              <div className="min-h-[760px] bg-[#ecece8] p-4 sm:p-8 lg:p-10">
                <div className={cn("mx-auto transition-all duration-300", previewMax)}>
                  <div className={cn("mx-auto overflow-hidden bg-black p-2 shadow-2xl transition-all duration-300", previewMode === "phone" ? "max-w-[450px] rounded-[2.6rem]" : "rounded-[1.75rem]")}>
                    <div className="overflow-hidden rounded-[1.8rem]" style={{ ...themeVars(theme), ...pageBackground(theme), color: "var(--qs-text)", fontFamily: "var(--qs-body-font)" }}>
                      <PreviewMenu theme={theme} restaurant={restaurant.data} items={menuItems} lang={lang} />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-[1.35rem] border border-black/[0.07] bg-white p-3.5 shadow-[0_5px_25px_rgba(0,0,0,.035)]"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-black/[0.045] text-black/65">{icon}</span><h2 className="text-xs font-bold tracking-tight">{title}</h2><div className="ml-auto">{action}</div></div>{children}</section>;
}

function Control({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/45">{title}</Label>{children}</div>;
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("rounded-lg border bg-white px-2.5 py-2 text-[10px] font-medium capitalize transition hover:border-black/30", active && "border-black bg-black text-white")}>{active && <Check className="me-1 inline size-3" />}{children}</button>;
}

function PreviewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold", active ? "bg-white shadow-sm" : "text-black/45 hover:text-black")}>{icon}<span className="hidden sm:inline">{label}</span></button>;
}

function PreviewMenu({ theme, restaurant, items, lang }: { theme: MenuTheme; restaurant: { name: string; logo_url: string | null; cover_image_url: string | null }; items: { title: string; description: string; price: string; image: string | null }[]; lang: string }) {
  const columns = theme.layout === "columns" || theme.columns === 2;
  return <div className="min-h-[760px]" style={{ background: "var(--qs-bg)" }}>
    <div className="relative h-56 overflow-hidden" style={{ background: theme.primary }}>
      {restaurant.cover_image_url && <img src={restaurant.cover_image_url} alt="" className="absolute inset-0 size-full object-cover" style={{ opacity: 0.78 }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="relative z-10 flex h-full flex-col justify-end p-6" style={{ color: theme.primaryText }}>
        {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="mb-4 size-12 rounded-2xl object-contain" /> : <div className="mb-4 size-12 rounded-2xl border border-white/25 bg-white/10" />}
        <p className="text-[9px] uppercase tracking-[0.25em] opacity-70">Restaurant menu</p>
        <h2 className="mt-1 text-3xl font-bold leading-none" style={{ fontFamily: "var(--qs-heading-font)" }}>{restaurant.name}</h2>
        {theme.tagline && <p className="mt-2 text-xs opacity-80">{theme.tagline}</p>}
      </div>
    </div>
    <div className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b px-4 py-3" style={{ background: `${theme.surface}f2` }}>
      {(lang === "ar" ? ["الكل", "مقبلات", "رئيسي", "حلويات"] : ["All", "Starters", "Mains", "Desserts"]).map((label, i) => <span key={label} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-semibold", i === 0 && "border-transparent")} style={i === 0 ? { background: theme.primary, color: theme.primaryText } : { borderColor: `${theme.primary}22` }}>{label}</span>)}
    </div>
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between"><div><p className="text-[9px] uppercase tracking-[0.25em]" style={{ color: theme.accent }}>Signature selection</p><h3 className="mt-1 text-2xl font-bold" style={{ fontFamily: "var(--qs-heading-font)" }}>{lang === "ar" ? "الأطباق الرئيسية" : "Main course"}</h3></div><span className="text-[10px]" style={{ color: theme.muted }}>{items.length} items</span></div>
      <div className={cn("grid gap-3", columns ? "grid-cols-2" : "grid-cols-1")}>
        {items.map((item, index) => <article key={`${item.title}-${index}`} className={cn("overflow-hidden", theme.cardStyle === "elevated" && "shadow-lg", theme.cardStyle === "outline" && "border", theme.imageShape === "circle" ? "rounded-2xl" : "rounded-xl")} style={{ background: theme.surface, borderColor: `${theme.primary}20` }}>
          {theme.showImages && <div className={cn("overflow-hidden", columns ? "h-28" : "h-40", theme.imageShape === "circle" && "p-2")}><img src={item.image || FOOD_FALLBACKS[index % FOOD_FALLBACKS.length]} alt="" className={cn("size-full object-cover", theme.imageShape === "circle" && "rounded-full")} /></div>}
          <div className="p-3"><div className="flex items-start gap-2"><h4 className={cn("min-w-0 flex-1 text-sm font-bold", theme.upperTitles && "uppercase tracking-wide")} style={{ fontFamily: "var(--qs-heading-font)" }}>{item.title}</h4><span className="shrink-0 text-xs font-bold" style={{ color: theme.accent }}>{theme.priceStyle === "leader" ? `··· ${item.price}` : `${restaurant.currency || "JOD"} ${item.price}`}</span></div><p className="mt-1.5 line-clamp-2 text-[10px] leading-4" style={{ color: theme.muted }}>{item.description}</p></div>
        </article>)}
      </div>
      <div className="mt-6 rounded-2xl p-4 text-center text-xs font-bold" style={{ background: theme.primary, color: theme.primaryText }}>View full menu</div>
    </div>
  </div>;
}
