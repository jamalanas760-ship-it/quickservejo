import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Check, Circle, ExternalLink, ImagePlus, Layers3, LayoutTemplate, Maximize2, Palette, RotateCcw, Sparkles, Square, Wand2, X } from "lucide-react";
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
import { generateMenuTheme } from "@/lib/theme.functions";
import { DEFAULT_THEME, TEMPLATES, parseMenuTheme, pageBackground, themeVars, type MenuTheme } from "@/lib/menu-theme";
import { cn } from "@/lib/utils";

const MASTER_PRESETS = [
  { id: "chalk-poster", name: "Chalk Poster", dna: "dark chalkboard, orange/cream accents, oversized display title, circular food photography, hand-drawn line art, printed texture" },
  { id: "dark-editorial", name: "Dark Editorial", dna: "black editorial menu, dramatic plated photography, serif typography, fine rules, asymmetric magazine composition, premium restaurant" },
  { id: "kraft-bistro", name: "Kraft Bistro", dna: "warm kraft paper, vintage serif, red/orange accents, two-column printed layout, imperfect ink texture, human-made typography" },
  { id: "modern-photo", name: "Modern Photo", dna: "clean modern menu, large realistic food photography, geometric crops, strong typography, soft neutral background, luxury hospitality" },
  { id: "levante-modern", name: "Modern Levantine", dna: "contemporary Levantine hospitality, olive and terracotta palette, Arabic-friendly typography, organic curves, botanical line art, editorial spacing" },
  { id: "street-poster", name: "Street Poster", dna: "bold street-food poster, charcoal and orange, cutout photos, sticker shapes, condensed typography, energetic but polished" },
  { id: "minimal-luxe", name: "Minimal Luxe", dna: "ivory paper, restrained black and gold, enormous whitespace, elegant serif, tiny rules, high-end fine dining print design" },
  { id: "photo-grid", name: "Photo Grid", dna: "dark textured background, modular photo grid, circular and square image frames, small price labels, premium food magazine" },
] as const;

const LAYOUTS = [
  { id: "poster", label: "Poster", hint: "Hero-led" },
  { id: "magazine", label: "Magazine", hint: "Editorial" },
  { id: "columns", label: "Columns", hint: "Print" },
  { id: "mosaic", label: "Mosaic", hint: "Dynamic" },
  { id: "gallery", label: "Gallery", hint: "Photo-first" },
  { id: "spotlight", label: "Spotlight", hint: "Feature item" },
  { id: "rail", label: "Swipe Rail", hint: "Mobile-first" },
  { id: "ticket", label: "Ticket", hint: "Compact" },
] as const;

const SHAPES = ["square", "circle", "rounded"] as const;
const TEXTURES = ["none", "paper", "chalk", "grain"] as const;
const ANIMATIONS = ["none", "fade", "rise", "pop", "slide"] as const;

async function compactImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const max = 1200;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to read image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

function patch(theme: MenuTheme, key: keyof MenuTheme, value: unknown): MenuTheme {
  return { ...theme, [key]: value } as MenuTheme;
}

export function MenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [variants, setVariants] = useState<MenuTheme[]>([]);
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [activePanel, setActivePanel] = useState<"art" | "layout" | "type" | "motion">("art");

  const restaurant = useQuery({
    queryKey: ["master-menu-design", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, slug, logo_url, cover_image_url, menu_theme, currency")
        .eq("id", restaurantId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const sample = useQuery({
    queryKey: ["master-menu-design", "items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name_en, name_ar, description_en, description_ar, price, image_url")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("display_order", { ascending: true })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (restaurant.data) setTheme(parseMenuTheme(restaurant.data.menu_theme));
  }, [restaurant.data]);

  const previewItems = useMemo(() => {
    const rows = sample.data ?? [];
    if (rows.length) return rows.map((item) => ({
      title: pick(item.name_en, item.name_ar),
      description: pick(item.description_en, item.description_ar),
      price: Number(item.price).toFixed(2),
      image: item.image_url,
    }));
    return [1, 2, 3, 4, 5, 6].map((n) => ({
      title: lang === "ar" ? `طبق مميز ${n}` : `Signature dish ${n}`,
      description: lang === "ar" ? "وصف مختصر يوضح مكونات الطبق" : "A short description crafted for the menu",
      price: "8.50",
      image: null as string | null,
    }));
  }, [sample.data, lang, pick]);

  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme as unknown as never }).eq("id", restaurantId);
      if (error) throw error;
      await logAudit("menu.master_design_saved", { restaurantId, entity: "restaurants", entityId: restaurantId, metadata: { template: theme.template, layout: theme.layout } });
      await queryClient.invalidateQueries({ queryKey: ["master-menu-design"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const room = 5 - references.length;
      const selected = Array.from(files).slice(0, Math.max(0, room));
      const encoded = await Promise.all(selected.map(compactImage));
      setReferences((current) => [...current, ...encoded].slice(0, 5));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function runMasterAI() {
    setAiBusy(true);
    try {
      const dna = preset ? MASTER_PRESETS.find((item) => item.id === preset)?.dna : "";
      const result = await generate({ data: {
        restaurantId,
        brief: [brief.trim(), dna ? `Master art direction: ${dna}` : "", "Do not produce a generic SaaS menu. Make the composition feel like a professionally art-directed printed restaurant menu. Use the uploaded references as visual DNA, not as a loose moodboard."] .filter(Boolean).join("\n"),
        base: preset || undefined,
        images: references.length ? references : undefined,
      } });
      const next = result.variants.map((json) => parseMenuTheme(JSON.parse(json)));
      setVariants(next);
      if (next[0]) setTheme(next[0]);
      toast.success(lang === "ar" ? "تم إنشاء اتجاهات تصميم احترافية" : "Master design directions generated");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setAiBusy(false);
    }
  }

  if (restaurant.isPending) return <Skeleton className="h-[720px] rounded-3xl" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const set = (key: keyof MenuTheme, value: unknown) => setTheme((current) => patch(current, key, value));
  const isDark = theme.bg.toLowerCase() < "#777777";

  return (
    <div className="min-h-screen space-y-5 pb-8">
      <header className="flex flex-col gap-4 rounded-3xl border bg-background/95 p-5 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Wand2 className="size-5" /></span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Master Menu Studio</h1>
              <p className="text-sm text-muted-foreground">{lang === "ar" ? "مصمم قوائم بمستوى استوديو إبداعي" : "Art-directed menu design, not a template picker."}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={`/r/${restaurant.data.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{t("design.openMenu")}</a></Button>
          <Button disabled={busy} onClick={() => void save()}><Check className="size-4" />{busy ? "Saving…" : t("common.save")}</Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <main className="space-y-5">
          <section className="overflow-hidden rounded-3xl border bg-background shadow-sm">
            <div className="border-b bg-muted/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold">AI Art Director</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Tell it the restaurant story, upload references, choose a visual DNA, and let the engine build a complete art direction.</p></div>
                <Badge variant="secondary" className="hidden sm:inline-flex">CREATIVE ENGINE</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="Example: dark premium shawarma menu, circular hero photo, charcoal wood texture, orange accents, bold Arabic/English typography, printed poster feeling…" />
                <Button className="h-full min-h-12 sm:w-44" disabled={aiBusy} onClick={() => void runMasterAI()}><Sparkles className="size-4" />{aiBusy ? "Designing…" : "Generate master"}</Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MASTER_PRESETS.map((item) => (
                  <button key={item.id} type="button" onClick={() => setPreset(preset === item.id ? "" : item.id)} className={cn("group overflow-hidden rounded-2xl border text-start transition-all hover:-translate-y-0.5 hover:shadow-md", preset === item.id && "border-primary ring-2 ring-primary/25")}>
                    <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(135deg, ${preset === item.id ? theme.primary : theme.bg}, ${theme.accent})` }}><div className="absolute inset-3 rounded-xl border border-white/30 bg-black/10" /><div className="absolute bottom-2 start-3 h-1 w-14 rounded-full bg-white/80" /><div className="absolute bottom-2 end-3 size-5 rounded-full bg-white/80" /></div>
                    <div className="p-2.5"><p className="text-xs font-semibold">{item.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.dna.split(",").slice(0,2).join(" · ")}</p></div>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {references.map((src, index) => <div key={`${src.slice(-18)}-${index}`} className="relative"><img src={src} alt="" className="size-14 rounded-xl border object-cover" /><button type="button" onClick={() => setReferences((items) => items.filter((_, i) => i !== index))} className="absolute -end-2 -top-2 grid size-5 place-items-center rounded-full bg-background shadow"><X className="size-3" /></button></div>)}
                {references.length < 5 && <label className="grid size-14 cursor-pointer place-items-center rounded-xl border border-dashed text-muted-foreground hover:border-primary hover:text-primary"><ImagePlus className="size-5" /><input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addReferences(e.target.files); e.currentTarget.value = ""; }} /></label>}
                <span className="text-xs text-muted-foreground">Upload up to 5 reference designs. The AI studies layout, type, texture, imagery and composition.</span>
              </div>
            </div>
          </section>

          {variants.length > 0 && <section className="rounded-3xl border bg-background p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Generated art directions</h2><p className="text-xs text-muted-foreground">Choose one direction, then refine it manually.</p></div><Button size="sm" variant="ghost" onClick={() => setVariants([])}><RotateCcw className="size-4" />Clear</Button></div><div className="grid grid-cols-3 gap-3">{variants.map((variant, i) => <button key={i} type="button" onClick={() => setTheme(variant)} className="overflow-hidden rounded-2xl border text-start hover:border-primary"><MiniTheme theme={variant} /><span className="block p-2 text-xs font-medium">Direction {i + 1}</span></button>)}</div></section>}

          <section className="rounded-3xl border bg-background shadow-sm">
            <div className="flex overflow-x-auto border-b p-2">
              {[{ id: "art", label: "Art direction", icon: Palette }, { id: "layout", label: "Layout & shapes", icon: LayoutTemplate }, { id: "type", label: "Typography", icon: Square }, { id: "motion", label: "Motion & finish", icon: Sparkles }].map((tab) => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setActivePanel(tab.id as typeof activePanel)} className={cn("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors", activePanel === tab.id ? "bg-primary text-primary-foreground" : "hover:bg-muted") }><Icon className="size-4" />{tab.label}</button>; })}
            </div>
            <div className="p-5">
              {activePanel === "art" && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Control title="Texture"><div className="flex flex-wrap gap-2">{TEXTURES.map((value) => <Choice key={value} active={theme.texture === value} onClick={() => set("texture", value)}>{value}</Choice>)}</div></Control>
                <Control title="Decor"><div className="flex flex-wrap gap-2">{["none", "veg", "fastfood", "bakery", "ornate", "coffee", "seafood", "shapes"].map((value) => <Choice key={value} active={theme.decor === value} onClick={() => set("decor", value)}>{value}</Choice>)}</div></Control>
                <Control title="Section framing"><div className="flex flex-wrap gap-2">{["plain", "boxed", "rule", "tab", "ribbon"].map((value) => <Choice key={value} active={theme.sectionStyle === value} onClick={() => set("sectionStyle", value)}>{value}</Choice>)}</div></Control>
                <Control title="Background"><div className="flex flex-wrap gap-2">{["solid", "gradient", "dots", "glow"].map((value) => <Choice key={value} active={theme.bgStyle === value} onClick={() => set("bgStyle", value)}>{value}</Choice>)}</div></Control>
                <Control title="Card finish"><div className="flex flex-wrap gap-2">{["flat", "elevated", "outline", "glass"].map((value) => <Choice key={value} active={theme.cardStyle === value} onClick={() => set("cardStyle", value)}>{value}</Choice>)}</div></Control>
                <Control title="Colours"><div className="grid grid-cols-4 gap-2">{(["bg", "surface", "primary", "accent"] as const).map((key) => <label key={key} className="space-y-1 text-[10px] text-muted-foreground">{key}<input type="color" value={theme[key]} onChange={(e) => set(key, e.target.value)} className="h-9 w-full cursor-pointer rounded-lg border bg-transparent" /></label>)}</div></Control>
              </div>}
              {activePanel === "layout" && <div className="space-y-6">
                <Control title="Composition"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{LAYOUTS.map((item) => <button key={item.id} type="button" onClick={() => set("layout", item.id)} className={cn("rounded-2xl border p-3 text-start transition hover:-translate-y-0.5", theme.layout === item.id && "border-primary bg-primary/5 ring-2 ring-primary/20")}><div className="mb-2 h-12 rounded-lg bg-muted p-1"><div className={cn("h-full rounded bg-primary/20", item.id === "columns" ? "grid grid-cols-2 gap-1" : item.id === "mosaic" ? "grid grid-cols-3 gap-1" : "")}>{item.id === "columns" ? <><i className="rounded bg-primary/40"/><i className="rounded bg-accent/40"/></> : item.id === "mosaic" ? <><i className="col-span-2 rounded bg-primary/40"/><i className="rounded bg-accent/40"/></> : null}</div></div><p className="text-xs font-semibold">{item.label}</p><p className="text-[10px] text-muted-foreground">{item.hint}</p></button>)}</div></Control>
                <Control title="Image geometry"><div className="flex flex-wrap gap-2">{SHAPES.map((value) => <Choice key={value} active={theme.imageShape === value} onClick={() => set("imageShape", value)}>{value}</Choice>)}</div></Control>
                <div className="grid gap-4 sm:grid-cols-3"><Control title="Columns"><div className="flex gap-2"><Choice active={theme.columns === 1} onClick={() => set("columns", 1)}>1</Choice><Choice active={theme.columns === 2} onClick={() => set("columns", 2)}>2</Choice></div></Control><Control title="Price placement"><div className="flex flex-wrap gap-2">{["inline", "right", "leader"].map((v) => <Choice key={v} active={theme.priceStyle === v} onClick={() => set("priceStyle", v)}>{v}</Choice>)}</div></Control><Control title="Density"><div className="flex flex-wrap gap-2">{["compact", "comfortable", "airy"].map((v) => <Choice key={v} active={theme.density === v} onClick={() => set("density", v)}>{v}</Choice>)}</div></Control></div>
              </div>}
              {activePanel === "type" && <div className="grid gap-5 sm:grid-cols-2"><Control title="Heading font"><div className="flex flex-wrap gap-2">{["sans", "serif", "display", "condensed", "script", "rounded"].map((v) => <Choice key={v} active={theme.headingFont === v} onClick={() => set("headingFont", v)}>{v}</Choice>)}</div></Control><Control title="Body font"><div className="flex flex-wrap gap-2">{["sans", "serif", "rounded", "mono", "display"].map((v) => <Choice key={v} active={theme.bodyFont === v} onClick={() => set("bodyFont", v)}>{v}</Choice>)}</div></Control><Control title="Title treatment"><div className="flex gap-2"><Choice active={theme.upperTitles} onClick={() => set("upperTitles", !theme.upperTitles)}>Uppercase</Choice><Choice active={theme.scriptAccent} onClick={() => set("scriptAccent", !theme.scriptAccent)}>Script accent</Choice></div></Control><Control title="Tagline"><Textarea rows={2} value={theme.tagline} onChange={(e) => set("tagline", e.target.value.slice(0, 80))} placeholder="A short brand line" /></Control></div>}
              {activePanel === "motion" && <div className="grid gap-5 sm:grid-cols-2"><Control title="Entrance animation"><div className="flex flex-wrap gap-2">{ANIMATIONS.map((v) => <Choice key={v} active={theme.animation === v} onClick={() => set("animation", v)}>{v}</Choice>)}</div></Control><Control title="Preview density"><p className="text-sm text-muted-foreground">Motion is restrained and purposeful: calm menus fade/rise; energetic street-food menus pop/slide. The public menu keeps interactions touch-friendly.</p></Control></div>}
            </div>
          </section>
        </main>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-[2rem] border bg-foreground/90 p-2 shadow-2xl">
            <div className="overflow-hidden rounded-[1.55rem]" style={{ ...themeVars(theme), ...pageBackground(theme), color: "var(--qs-text)", fontFamily: "var(--qs-body-font)" }}>
              <div className="relative min-h-[650px] overflow-hidden">
                <PreviewHero theme={theme} restaurant={restaurant.data} />
                <div className="relative z-10 space-y-3 p-4">
                  <div className="flex gap-2 overflow-hidden">{["All", "Starters", "Mains", "Desserts"].map((label, i) => <span key={label} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-medium", i === 0 && "bg-[var(--qs-primary)] text-[var(--qs-primary-text)]")} >{lang === "ar" ? ["الكل", "مقبلات", "رئيسي", "حلويات"][i] : label}</span>)}</div>
                  <section className="rounded-2xl p-3" style={{ background: theme.surface, border: `1px solid ${theme.primary}20`, boxShadow: theme.cardStyle === "elevated" ? "0 12px 30px rgba(0,0,0,.12)" : undefined }}>
                    <div className="mb-3 flex items-end justify-between"><div><p className="text-[9px] uppercase tracking-[.2em]" style={{ color: theme.accent }}>Signature</p><h3 className="text-lg font-semibold" style={{ fontFamily: "var(--qs-heading-font)" }}>{lang === "ar" ? "الأطباق الرئيسية" : "Main course"}</h3></div><span className="text-[9px] text-muted-foreground">{previewItems.length} items</span></div>
                    <div className={cn("grid gap-2", theme.layout === "columns" || theme.columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
                      {previewItems.slice(0, 6).map((item, index) => <PreviewItem key={`${item.title}-${index}`} theme={theme} item={item} index={index} />)}
                    </div>
                  </section>
                  <div className="rounded-2xl p-3 text-center text-xs font-semibold" style={{ background: theme.primary, color: theme.primaryText }}>View full menu</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2"><Badge variant="outline">{theme.template}</Badge><Badge variant="outline">{theme.layout}</Badge><Badge variant="outline">{theme.animation}</Badge><Button size="icon" variant="outline" title="Fullscreen preview"><Maximize2 className="size-4" /></Button></div>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Layers3 className="size-3.5" />Layered composition · responsive preview · tenant-safe save</div>
        </aside>
      </div>
    </div>
  );
}

function Control({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label className="text-xs font-semibold">{title}</Label>{children}</div>;
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn("rounded-xl border px-3 py-2 text-xs capitalize transition hover:border-primary/50", active && "border-primary bg-primary/10 text-primary ring-1 ring-primary/20")}>{active && <Check className="me-1 inline size-3" />}{children}</button>;
}

function MiniTheme({ theme }: { theme: MenuTheme }) {
  return <div className="relative h-28 overflow-hidden" style={pageBackground(theme)}><div className="absolute inset-x-3 top-3 h-8 rounded-xl" style={{ background: theme.surface }} /><div className="absolute start-3 top-14 h-2 w-20 rounded-full" style={{ background: theme.primary }} /><div className="absolute start-3 top-20 h-1.5 w-28 rounded-full" style={{ background: theme.muted }} /><div className="absolute end-4 bottom-4 size-8 rounded-full" style={{ background: theme.accent }} /></div>;
}

function PreviewHero({ theme, restaurant }: { theme: MenuTheme; restaurant: { name: string; logo_url: string | null; cover_image_url: string | null } }) {
  return <div className="relative h-44 overflow-hidden" style={{ background: theme.primary }}>
    {restaurant.cover_image_url && <img src={restaurant.cover_image_url} alt="" className="absolute inset-0 size-full object-cover" style={{ opacity: .72 }} />}
    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.primary}ee, transparent 70%)` }} />
    <div className="relative z-10 flex h-full flex-col justify-end p-5" style={{ color: theme.primaryText }}>
      {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="mb-3 size-10 rounded-xl object-contain" /> : <span className="mb-3 grid size-10 place-items-center rounded-xl border border-current/20 bg-white/10"><Circle className="size-4" /></span>}
      <p className="text-[9px] uppercase tracking-[.22em] opacity-75">Restaurant menu</p>
      <h2 className="text-2xl font-bold leading-none" style={{ fontFamily: "var(--qs-heading-font)" }}>{restaurant.name}</h2>
      {theme.tagline && <p className="mt-1 text-xs opacity-80">{theme.tagline}</p>}
    </div>
  </div>;
}

function PreviewItem({ theme, item, index }: { theme: MenuTheme; item: { title: string; description: string; price: string; image: string | null }; index: number }) {
  const image = theme.showImages && item.image;
  return <article className={cn("min-w-0 overflow-hidden", theme.imageShape === "circle" ? "rounded-2xl" : "rounded-xl", theme.cardStyle === "outline" && "border", theme.cardStyle === "elevated" && "shadow-sm", theme.animation !== "none" && "transition-transform duration-500 hover:-translate-y-0.5")} style={{ background: theme.surface, borderColor: `${theme.primary}20` }}>
    {theme.showImages && <div className={cn("relative overflow-hidden", theme.columns === 2 ? "h-20" : "h-28")}><div className={cn("size-full", theme.imageShape === "circle" ? "rounded-full p-2" : "")}><div className="size-full overflow-hidden rounded-[inherit]" style={{ background: `${theme.accent}25` }}>{image ? <img src={image} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-[10px] text-muted-foreground">Food photo</div>}</div></div></div>}
    <div className="p-2.5"><div className="flex items-start gap-2"><h4 className={cn("min-w-0 flex-1 truncate text-[11px] font-semibold", theme.upperTitles && "uppercase tracking-wide")} style={{ fontFamily: "var(--qs-heading-font)" }}>{item.title}</h4><span className="shrink-0 text-[10px] font-bold" style={{ color: theme.accent }}>{theme.priceStyle === "leader" ? `··· ${item.price}` : item.price}</span></div><p className="mt-1 line-clamp-2 text-[9px]" style={{ color: theme.muted }}>{item.description}</p></div>
  </article>;
}
