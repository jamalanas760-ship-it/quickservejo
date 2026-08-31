import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ExternalLink,
  Layers3,
  Monitor,
  Palette,
  Paperclip,
  Play,
  RotateCcw,
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
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_THEME,
  FONT_STACKS,
  parseMenuTheme,
  type FontId,
  type LayoutId,
  type MenuTheme,
} from "@/lib/menu-theme";
import { generateMenuTheme } from "@/lib/theme.functions";
import { cn } from "@/lib/utils";

type PreviewMode = "phone" | "tablet" | "desktop";
type EditorTab = "style" | "layout" | "type" | "motion";
type DirectionId = "editorial" | "levante" | "poster" | "human" | "luxe" | "street";
type DesignerTheme = MenuTheme;

type Direction = {
  id: DirectionId;
  name: string;
  description: string;
  image: string;
  accent: string;
  background: string;
};

type MenuItemPreview = {
  title: string;
  description: string;
  price: string;
  image: string;
  category: string;
};

const FOOD = [
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=90",
  "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=90",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=90",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=90",
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=90",
  "https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=1200&q=90",
] as const;

const DIRECTIONS: Direction[] = [
  { id: "editorial", name: "Dark Editorial", description: "Cinematic food photography, confident type and magazine rhythm.", image: FOOD[0], accent: "#d9822b", background: "#151311" },
  { id: "levante", name: "Modern Levantine", description: "Olive, terracotta, organic forms and warm hospitality.", image: FOOD[2], accent: "#b86d46", background: "#ebe2d0" },
  { id: "poster", name: "Modern Poster", description: "Oversized typography, bold crops and graphic energy.", image: FOOD[1], accent: "#f07818", background: "#171716" },
  { id: "human", name: "Human Crafted", description: "Tactile paper, imperfect rules and authentic print character.", image: FOOD[4], accent: "#a94734", background: "#e9dfcf" },
  { id: "luxe", name: "Quiet Luxury", description: "Restrained palette, editorial serif and premium dining mood.", image: FOOD[5], accent: "#a9804c", background: "#eee8dc" },
  { id: "street", name: "Street Food", description: "Fast visual rhythm, strong contrast and contemporary attitude.", image: FOOD[3], accent: "#f07818", background: "#181716" },
];

const LAYOUTS: Array<[LayoutId, string, string]> = [
  ["magazine", "Magazine", "Editorial asymmetry"],
  ["mosaic", "Mosaic", "Layered photography"],
  ["spotlight", "Spotlight", "Hero-led hierarchy"],
  ["gallery", "Gallery", "Photography first"],
  ["columns", "Columns", "Print-inspired"],
  ["rail", "Swipe rail", "Mobile-native"],
];

const FONTS: Array<[FontId, string]> = [
  ["sans", "Modern Sans"],
  ["serif", "Editorial Serif"],
  ["display", "Elegant Display"],
  ["condensed", "Bold Condensed"],
  ["rounded", "Friendly Rounded"],
  ["script", "Human Script"],
];

const MOTION = ["none", "fade", "rise", "pop", "slide"] as const;
const SHAPES = ["rounded", "square", "circle"] as const;
const TEXTURES = ["none", "paper", "chalk", "grain"] as const;
const BG_STYLES = ["solid", "gradient", "dots", "glow"] as const;

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-black/[.07] bg-white shadow-[0_10px_34px_rgba(0,0,0,.045)]">
      <div className="flex items-center gap-2 border-b border-black/[.06] px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#f4f2ed] text-black/70">{icon}</span>
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
      </div>
      <div className="p-3.5 sm:p-4">{children}</div>
    </section>
  );
}

function Option({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border border-black/10 bg-white px-3 text-[10px] font-medium text-black/65 transition hover:-translate-y-px hover:border-black/25 hover:text-black active:scale-[.98]",
        active && "border-black bg-black text-white",
      )}
    >
      {active ? <Check className="me-1 inline size-3" /> : null}
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[.16em] text-black/40">{title}</div>
      {children}
    </div>
  );
}

function directionTheme(base: DesignerTheme, id: DirectionId): DesignerTheme {
  const common = { ...base, showImages: true, showIcons: true, columns: 1 as const };
  if (id === "levante") return { ...common, template: "emerald", bg: "#eee5d4", surface: "#fffaf0", text: "#26352e", muted: "#77776d", primary: "#31594b", primaryText: "#fffaf0", accent: "#b66b43", headingFont: "display", bodyFont: "sans", layout: "mosaic", hero: "blob", texture: "paper", decor: "veg", bgStyle: "solid", sectionStyle: "rule", priceStyle: "right", animation: "rise", radius: 18, upperTitles: true, scriptAccent: false, tagline: "Warm food. Shared moments." };
  if (id === "poster") return { ...common, template: "poster", bg: "#171716", surface: "#242321", text: "#f7f0e4", muted: "#aca398", primary: "#ef7c19", primaryText: "#1a130d", accent: "#ef7c19", headingFont: "condensed", bodyFont: "sans", layout: "spotlight", hero: "ribbon", texture: "grain", decor: "shapes", bgStyle: "glow", sectionStyle: "plain", priceStyle: "right", animation: "pop", radius: 8, upperTitles: true, scriptAccent: false, tagline: "Made to be remembered." };
  if (id === "human") return { ...common, template: "brush", bg: "#e8dece", surface: "#f8f0e5", text: "#2d211a", muted: "#806d5e", primary: "#9d3f2f", primaryText: "#fff7ef", accent: "#bd674f", headingFont: "serif", bodyFont: "sans", layout: "columns", hero: "stamp", texture: "paper", decor: "bakery", bgStyle: "solid", sectionStyle: "boxed", priceStyle: "leader", animation: "rise", radius: 12, upperTitles: false, scriptAccent: true, tagline: "Made by hand, served with heart." };
  if (id === "luxe") return { ...common, template: "ornate", bg: "#eee9df", surface: "#fbf8f1", text: "#211f1c", muted: "#777269", primary: "#9a7444", primaryText: "#fffaf0", accent: "#b28a52", headingFont: "serif", bodyFont: "sans", layout: "gallery", hero: "gradient", texture: "none", decor: "ornate", bgStyle: "solid", sectionStyle: "rule", priceStyle: "leader", animation: "fade", radius: 10, upperTitles: false, scriptAccent: false, tagline: "A table worth remembering." };
  if (id === "street") return { ...common, template: "street", bg: "#171717", surface: "#242424", text: "#fff7eb", muted: "#aaa29a", primary: "#f07818", primaryText: "#19130e", accent: "#f07818", headingFont: "condensed", bodyFont: "sans", layout: "mosaic", hero: "ribbon", texture: "grain", decor: "fastfood", bgStyle: "glow", sectionStyle: "tab", priceStyle: "right", animation: "pop", radius: 8, upperTitles: true, scriptAccent: false, tagline: "Big flavour. No fuss." };
  return { ...common, template: "editorial", bg: "#111214", surface: "#1b1d20", text: "#f4f1ea", muted: "#9b968b", primary: "#d58a37", primaryText: "#171412", accent: "#d58a37", headingFont: "display", bodyFont: "sans", layout: "magazine", hero: "minimal", texture: "grain", decor: "ornate", bgStyle: "glow", sectionStyle: "rule", priceStyle: "leader", animation: "fade", radius: 10, upperTitles: true, scriptAccent: true, tagline: "Crafted for the table." };
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not decode image"));
      image.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("Could not process image"));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function previewItems(rows: Array<{ name_en: string; name_ar: string; description_en: string | null; description_ar: string | null; price: number; image_url: string | null }>, lang: string, currency: string): MenuItemPreview[] {
  if (rows.length > 0) {
    return rows.slice(0, 9).map((row, index) => ({
      title: lang === "ar" ? row.name_ar : row.name_en,
      description: (lang === "ar" ? row.description_ar : row.description_en) || "Prepared fresh with care.",
      price: `${Number(row.price).toFixed(2)} ${currency}`,
      image: row.image_url || FOOD[index % FOOD.length]!,
      category: index < 4 ? "Signature" : index < 7 ? "Sides" : "Drinks",
    }));
  }
  return FOOD.slice(0, 6).map((image, index) => ({
    title: lang === "ar" ? `طبق مميز ${index + 1}` : `Signature dish ${index + 1}`,
    description: lang === "ar" ? "محضر طازجاً بعناية." : "Prepared fresh with care.",
    price: `8.50 ${currency}`,
    image,
    category: index < 3 ? "Signature" : index < 5 ? "Sides" : "Drinks",
  }));
}

export function MenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { lang, pick, t } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<DesignerTheme>(DEFAULT_THEME);
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [direction, setDirection] = useState<DirectionId>("editorial");
  const [tab, setTab] = useState<EditorTab>("style");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("phone");
  const [zoom, setZoom] = useState(90);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);

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
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!restaurant.data || hydrated) return;
    const saved = restaurant.data.menu_theme as unknown;
    try {
      const parsed = parseMenuTheme(saved);
      setTheme(parsed);
      const matching = DIRECTIONS.find((item) => {
        const candidate = directionTheme(DEFAULT_THEME, item.id);
        return candidate.primary === parsed.primary && candidate.bg === parsed.bg && candidate.headingFont === parsed.headingFont;
      });
      if (matching) setDirection(matching.id);
    } catch {
      setTheme(DEFAULT_THEME);
    }
    setHydrated(true);
  }, [restaurant.data, hydrated]);

  const menuItems = useMemo(
    () => previewItems(items.data ?? [], lang, restaurant.data?.currency ?? "JOD"),
    [items.data, lang, restaurant.data?.currency],
  );

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(`quickserve:menu-preview:${restaurantId}`, JSON.stringify(theme));
      setPreviewNonce((value) => value + 1);
    } catch {
      // Preview still works from the editor if browser storage is unavailable.
    }
  }, [theme, hydrated, restaurantId]);

  const previewSrc = useMemo(() => {
    if (!restaurant.data?.slug) return "about:blank";
    return `/r/${restaurant.data.slug}#designer-preview:${restaurantId}:${previewNonce}`;
  }, [restaurant.data?.slug, restaurantId, previewNonce]);

  const savedTheme = useMemo(() => {
    if (!restaurant.data) return DEFAULT_THEME;
    return parseMenuTheme(restaurant.data.menu_theme as unknown);
  }, [restaurant.data]);
  const isDirty = JSON.stringify(theme) !== JSON.stringify(savedTheme);

  function setThemeValue<K extends keyof MenuTheme>(key: K, value: MenuTheme[K]) {
    setTheme((current) => ({ ...current, [key]: value }));
  }

  function applyDirection(id: DirectionId) {
    const next = directionTheme(theme, id);
    setDirection(id);
    setTheme(next);
    toast.success(lang === "ar" ? "تم تحديث الاتجاه الإبداعي" : "Creative direction applied");
  }

  async function addReferences(files: FileList | null) {
    if (!files?.length) return;
    try {
      const room = Math.max(0, 5 - references.length);
      const selected = Array.from(files).slice(0, room);
      const encoded = await Promise.all(selected.map(compressImage));
      setReferences((current) => [...current, ...encoded].slice(0, 5));
      toast.success(lang === "ar" ? "تم إرفاق الصور" : "Reference images attached");
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function generateDesign(refinement = "") {
    setGenerating(true);
    try {
      const meta = DIRECTIONS.find((item) => item.id === direction);
      const prompt = [
        "Act as an elite restaurant brand art director, menu designer and mobile product designer.",
        "Create a genuinely designed menu system, not a generic template or dashboard card grid.",
        `Restaurant: ${restaurant.data?.name ?? "Restaurant"}.`,
        `Creative direction: ${meta?.name ?? direction}. ${meta?.description ?? ""}`,
        brief.trim() || "Use realistic food photography, strong editorial hierarchy, humanized details, intelligent spacing, premium typography, distinctive composition and excellent mobile behavior.",
        refinement || "",
        references.length ? `Analyze the ${references.length} attached reference image(s) as visual evidence for composition, photography, typography, palette, texture and spacing.` : "",
        "Return a complete editable MenuTheme JSON. Prioritize clarity, originality, hospitality and production realism.",
      ].filter(Boolean).join("\n\n");

      const result = await generate({
        data: {
          restaurantId,
          provider: "openai",
          brief: prompt,
          base: direction,
          tweak: refinement || undefined,
          images: references.length ? references : undefined,
        },
      });
      const first = result.variants?.[0];
      if (!first) throw new Error("The AI did not return a usable design.");
      const raw = JSON.parse(first) as unknown;
      setTheme(parseMenuTheme(raw));
      toast.success(lang === "ar" ? "تم إنشاء تصميم جديد" : "New master design generated");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setGenerating(false);
    }
  }

  async function persistTheme(showToast = true) {
    const next = parseMenuTheme(theme);
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .update({ menu_theme: next as unknown as never })
        .eq("id", restaurantId)
        .select("id,name,slug,logo_url,cover_image_url,menu_theme,currency")
        .single();
      if (error) throw error;
      queryClient.setQueryData(["master-menu-designer", restaurantId], data);
      setTheme(next);
      try {
        localStorage.setItem(`quickserve:menu-preview:${restaurantId}`, JSON.stringify(next));
      } catch {
        // Ignore unavailable browser storage.
      }
      if (showToast) toast.success(lang === "ar" ? "تم الحفظ بنجاح" : "Menu design saved successfully");
      return true;
    } catch (error) {
      toast.error(humanError(error, lang));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openLivePreview() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error(lang === "ar" ? "اسمح بفتح نافذة المعاينة" : "Allow pop-ups to open the live preview");
      return;
    }
    const saved = await persistTheme(false);
    if (!saved || !restaurant.data?.slug) {
      popup.close();
      return;
    }
    popup.location.href = `/r/${restaurant.data.slug}#designer-preview:${restaurantId}:${Date.now()}`;
  }

  async function resetToSaved() {
    const saved = parseMenuTheme(restaurant.data?.menu_theme as unknown);
    setTheme(saved);
    toast.success(lang === "ar" ? "تمت استعادة آخر نسخة محفوظة" : "Restored the last saved design");
  }

  if (restaurant.isPending) return <Skeleton className="h-[820px] rounded-[2rem]" />;
  if (restaurant.isError || !restaurant.data) return <div className="rounded-2xl border p-6 text-sm text-destructive">{humanError(restaurant.error, lang)}</div>;

  const previewWidth = previewMode === "phone" ? 390 : previewMode === "tablet" ? 720 : 1080;
  const motionKey = `${theme.animation}-${previewNonce}`;
  const fontHeading = FONT_STACKS[theme.headingFont];
  const fontBody = FONT_STACKS[theme.bodyFont];

  return (
    <div className="min-h-screen bg-[#f4f4f2] text-[#171716]">
      <div className="mx-auto max-w-[1780px] p-2.5 sm:p-4 lg:p-6">
        <header className="sticky top-2 z-50 mb-3 rounded-[1.35rem] border border-black/[.07] bg-white/95 p-3 shadow-[0_14px_45px_rgba(0,0,0,.09)] backdrop-blur-xl sm:mb-4 sm:p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-black text-white sm:size-11 sm:rounded-2xl">
              <Wand2 className="size-4 sm:size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-bold tracking-tight sm:text-lg">AI Menu Designer</h1>
                <Badge className="hidden bg-black px-2 text-[9px] text-white sm:inline-flex">MASTER STUDIO</Badge>
                {isDirty ? <span className="hidden text-[10px] font-medium text-orange-600 sm:inline">Unsaved changes</span> : <span className="hidden text-[10px] font-medium text-emerald-600 sm:inline">All changes saved</span>}
              </div>
              <p className="truncate text-[10px] text-black/45 sm:text-xs">{restaurant.data.name} · professional menu art direction</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {isDirty ? (
                <Button variant="ghost" size="sm" className="hidden h-9 px-2.5 text-[10px] sm:inline-flex" onClick={() => void resetToSaved()}>
                  <RotateCcw className="size-3.5" />Reset
                </Button>
              ) : null}
              <Button variant="outline" size="sm" className="h-9 px-2.5 text-[10px] sm:px-3 sm:text-xs" onClick={() => void openLivePreview()} disabled={saving}>
                <ExternalLink className="size-3.5" />Save & Preview
              </Button>
              <Button size="sm" className="h-9 px-2.5 text-[10px] sm:px-3 sm:text-xs" disabled={saving || !isDirty} onClick={() => void persistTheme()}>
                <Save className="size-3.5" />{saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-3.5 xl:grid-cols-[350px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
          <aside className="order-1 min-w-0 space-y-3 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pe-1">
            <Panel title="Creative direction" icon={<Palette className="size-4" />}>
              <div className="grid grid-cols-2 gap-2">
                {DIRECTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyDirection(item.id)}
                    className={cn("group overflow-hidden rounded-[1.1rem] border bg-white text-start transition duration-200 hover:-translate-y-0.5 hover:shadow-lg", direction === item.id && "border-black ring-2 ring-black/10")}
                  >
                    <div className="relative aspect-[1.55] overflow-hidden">
                      <img src={item.image} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${item.background}44, ${item.accent}88)` }} />
                    </div>
                    <div className="p-2.5">
                      <p className="text-[11px] font-bold">{item.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-[9px] leading-3.5 text-black/45">{item.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Creative brief" icon={<Sparkles className="size-4" />}>
              <div className="relative overflow-hidden rounded-[1.1rem] border border-black/10 bg-[#fafaf8] p-2.5">
                <Textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value.slice(0, 1200))}
                  rows={5}
                  className="min-h-[120px] resize-none border-0 bg-transparent px-1 pb-9 text-xs shadow-none focus-visible:ring-0"
                  placeholder="Describe the restaurant mood, food story, audience, photography, colours, Arabic/English typography and the feeling guests should get."
                />
                <button type="button" onClick={() => fileRef.current?.click()} className="absolute bottom-2.5 start-2.5 grid size-8 place-items-center rounded-xl border bg-white text-black/55 shadow-sm hover:text-black" aria-label="Attach reference image">
                  <Paperclip className="size-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addReferences(event.target.files); event.currentTarget.value = ""; }} />
                <span className="absolute bottom-3 end-3 text-[9px] font-medium text-black/35">{brief.length}/1200</span>
              </div>
              {references.length > 0 ? (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                  {references.map((src, index) => (
                    <div key={`${src.slice(-12)}-${index}`} className="relative size-12 shrink-0 overflow-hidden rounded-xl border">
                      <img src={src} alt="Reference" className="size-full object-cover" />
                      <button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))} className="absolute end-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/75 text-white">
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center px-1 text-[9px] text-black/40">{references.length}/5 references</div>
                </div>
              ) : null}
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Button className="h-10 rounded-xl text-xs" disabled={generating} onClick={() => void generateDesign()}>
                  <Sparkles className="size-4" />{generating ? "Creating…" : "Generate"}
                </Button>
                <Button variant="outline" className="h-10 rounded-xl text-xs" disabled={generating} onClick={() => void generateDesign("Smartly refine the hierarchy, spacing, photography crops and typography. Make it feel more human, current and professionally art-directed without adding clutter.")}>
                  <Wand2 className="size-4" />Smart refine
                </Button>
              </div>
            </Panel>

            <Panel title="Design controls" icon={<Layers3 className="size-4" />}>
              <div className="grid grid-cols-4 rounded-xl bg-[#f5f4f1] p-1">
                {(["style", "layout", "type", "motion"] as EditorTab[]).map((id) => (
                  <button key={id} type="button" onClick={() => setTab(id)} className={cn("min-w-0 rounded-lg px-1 py-2 text-[10px] font-semibold capitalize transition", tab === id ? "bg-black text-white shadow-sm" : "text-black/45 hover:text-black")}>
                    {id === "type" ? "Typography" : id}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-5">
                {tab === "style" ? (
                  <>
                    <Group title="Image treatment"><div className="grid grid-cols-3 gap-1.5">{SHAPES.map((shape) => <Option key={shape} active={theme.imageShape === shape} onClick={() => setThemeValue("imageShape", shape)}>{shape}</Option>)}</div></Group>
                    <Group title="Texture"><div className="grid grid-cols-4 gap-1.5">{TEXTURES.map((value) => <Option key={value} active={theme.texture === value} onClick={() => setThemeValue("texture", value)}>{value}</Option>)}</div></Group>
                    <Group title="Background"><div className="grid grid-cols-4 gap-1.5">{BG_STYLES.map((value) => <Option key={value} active={theme.bgStyle === value} onClick={() => setThemeValue("bgStyle", value)}>{value}</Option>)}</div></Group>
                    <Group title="Colour system">
                      <div className="grid grid-cols-4 gap-1.5">
                        {(["bg", "surface", "primary", "accent"] as const).map((key) => (
                          <label key={key} className="space-y-1"><span className="block text-[8px] capitalize text-black/40">{key}</span><input type="color" value={theme[key]} onChange={(event) => setThemeValue(key, event.target.value)} className="h-9 w-full cursor-pointer rounded-xl border border-black/10 bg-white p-1" /></label>
                        ))}
                      </div>
                    </Group>
                  </>
                ) : null}

                {tab === "layout" ? (
                  <>
                    <Group title="Composition"><div className="grid grid-cols-2 gap-1.5">{LAYOUTS.map(([id, label, hint]) => <button key={id} type="button" onClick={() => setThemeValue("layout", id)} className={cn("rounded-xl border p-2.5 text-start", theme.layout === id ? "border-black bg-black text-white" : "border-black/10 bg-white")}><span className="block text-[10px] font-semibold">{label}</span><span className="mt-0.5 block text-[8px] opacity-55">{hint}</span></button>)}</div></Group>
                    <Group title="Hero treatment"><div className="grid grid-cols-3 gap-1.5"><Option active={theme.hero === "cover"} onClick={() => setThemeValue("hero", "cover")}>Cover</Option><Option active={theme.hero === "blob"} onClick={() => setThemeValue("hero", "blob")}>Organic</Option><Option active={theme.hero === "ribbon"} onClick={() => setThemeValue("hero", "ribbon")}>Ribbon</Option></div></Group>
                    <Group title="Section rhythm"><div className="grid grid-cols-3 gap-1.5"><Option active={theme.sectionStyle === "plain"} onClick={() => setThemeValue("sectionStyle", "plain")}>Plain</Option><Option active={theme.sectionStyle === "rule"} onClick={() => setThemeValue("sectionStyle", "rule")}>Rule</Option><Option active={theme.sectionStyle === "boxed"} onClick={() => setThemeValue("sectionStyle", "boxed")}>Boxed</Option></div></Group>
                  </>
                ) : null}

                {tab === "type" ? (
                  <>
                    <Group title="Heading system"><div className="grid grid-cols-2 gap-1.5">{FONTS.map(([id, label]) => <Option key={id} active={theme.headingFont === id} onClick={() => setThemeValue("headingFont", id)}>{label}</Option>)}</div></Group>
                    <Group title="Type personality"><div className="flex flex-wrap gap-1.5"><Option active={theme.upperTitles} onClick={() => setThemeValue("upperTitles", !theme.upperTitles)}>Uppercase</Option><Option active={theme.scriptAccent} onClick={() => setThemeValue("scriptAccent", !theme.scriptAccent)}>Script accent</Option></div></Group>
                    <Group title="Body system"><div className="grid grid-cols-2 gap-1.5">{FONTS.filter(([id]) => id !== "script").map(([id, label]) => <Option key={id} active={theme.bodyFont === id} onClick={() => setThemeValue("bodyFont", id)}>{label}</Option>)}</div></Group>
                  </>
                ) : null}

                {tab === "motion" ? (
                  <>
                    <Group title="Motion"><div className="grid grid-cols-5 gap-1.5">{MOTION.map((motion) => <Option key={motion} active={theme.animation === motion} onClick={() => setThemeValue("animation", motion)}>{motion}</Option>)}</div></Group>
                    <div className="rounded-xl bg-[#f6f5f2] p-3 text-[9px] leading-4 text-black/45">Motion is restrained and purposeful. The actual diner menu uses the same stored theme, so preview and production stay aligned.</div>
                    <Button variant="outline" className="h-9 rounded-xl text-xs" onClick={() => setPreviewNonce((value) => value + 1)}><Play className="size-3.5" />Replay preview</Button>
                  </>
                ) : null}
              </div>
            </Panel>
          </aside>

          <main className="order-2 min-w-0 overflow-hidden rounded-[1.5rem] border border-black/[.07] bg-[#242422] p-2.5 shadow-[0_20px_80px_rgba(0,0,0,.16)] sm:p-3">
            <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] p-1.5 text-white">
              <div className="flex rounded-lg bg-white/[.06] p-0.5">
                {([['phone', Smartphone], ['tablet', Tablet], ['desktop', Monitor]] as const).map(([mode, Icon]) => (
                  <button key={mode} type="button" onClick={() => setPreviewMode(mode)} className={cn("grid size-8 place-items-center rounded-md text-white/45", previewMode === mode && "bg-white text-black")} aria-label={mode}>
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
              <span className="ms-1 text-[9px] font-semibold uppercase tracking-[.15em] text-white/45">Real diner preview</span>
              <span className="hidden rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[8px] font-medium text-emerald-300 sm:inline">Same public menu renderer</span>
              <div className="ms-auto flex items-center gap-0.5">
                <button type="button" onClick={() => setZoom((value) => Math.max(70, value - 5))} className="grid size-7 place-items-center rounded-md text-white/55 hover:bg-white/10"><ZoomOut className="size-3.5" /></button>
                <span className="w-8 text-center text-[9px] text-white/45">{zoom}%</span>
                <button type="button" onClick={() => setZoom((value) => Math.min(105, value + 5))} className="grid size-7 place-items-center rounded-md text-white/55 hover:bg-white/10"><ZoomIn className="size-3.5" /></button>
              </div>
            </div>

            <div className="flex min-h-[640px] items-start justify-center overflow-auto rounded-xl bg-[radial-gradient(circle_at_top,#50504b,#292926_56%,#20201e)] p-3 sm:min-h-[780px] sm:p-6 lg:min-h-[860px]">
              <div
                key={motionKey}
                className="relative w-full overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_35px_100px_rgba(0,0,0,.42)] transition-all duration-300"
                style={{ maxWidth: `${previewWidth}px`, transform: `scale(${zoom / 100})`, transformOrigin: "top center", marginBottom: `${Math.max(0, (zoom / 100 - 1) * 180)}px` }}
              >
                <div className="flex items-center justify-between border-b bg-white px-4 py-2 text-[9px] text-black/45">
                  <span>{previewMode === "phone" ? "390 × 844" : previewMode === "tablet" ? "768 × 1024" : "Responsive desktop"}</span>
                  <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" />Live draft</span>
                </div>
                <iframe
                  key={previewSrc}
                  title="Live public menu preview"
                  src={previewSrc}
                  className={cn("block w-full border-0 bg-white", previewMode === "phone" ? "h-[720px]" : previewMode === "tablet" ? "h-[760px]" : "h-[820px]")}
                  style={{ fontFamily: fontBody }}
                />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[9px] text-white/35">
              <Sparkles className="size-3" />
              <span>Live draft uses the exact public menu renderer.</span>
              <span className="hidden sm:inline">Change a control → preview updates → Save → public menu uses the same theme.</span>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
