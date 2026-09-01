import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileImage, Figma, ImagePlus, Layers3, Monitor, Palette, RefreshCw, Sparkles, Smartphone, Tablet, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { generateMenuTheme } from "@/lib/theme.functions";
import { DEFAULT_THEME, parseMenuTheme, type MenuTheme } from "@/lib/menu-theme";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Mode = "create" | "reference";
type Viewport = "phone" | "tablet" | "desktop";

const directions = [
  ["editorial", "Dark Editorial", "Magazine hierarchy, cinematic food photography and confident type."],
  ["levante", "Modern Levantine", "Warm hospitality, organic forms, terracotta and contemporary Arabic character."],
  ["poster", "Modern Poster", "Oversized typography, bold crops and graphic energy."],
  ["human", "Human Crafted", "Paper texture, imperfect rules and tactile print character."],
  ["luxe", "Quiet Luxury", "Restrained palette, editorial serif and premium dining mood."],
  ["street", "Street Food", "High contrast, fast rhythm and contemporary attitude."],
] as const;

function download(name: string, body: string, type = "application/json") {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function SmartMenuStudio({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [provider, setProvider] = useState("openai");
  const [active, setActive] = useState(0);
  const [variants, setVariants] = useState<MenuTheme[]>([]);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [viewport, setViewport] = useState<Viewport>("phone");
  const [zoom, setZoom] = useState(85);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const restaurant = useQuery({
    queryKey: ["smart-menu-studio", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,logo_url,cover_image_url,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["smart-menu-studio-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(9);
      if (error) throw error;
      return data ?? [];
    },
  });

  useMemo(() => {
    if (restaurant.data?.menu_theme) setTheme(parseMenuTheme(restaurant.data.menu_theme));
  }, [restaurant.data?.menu_theme]);

  const currentDirection = directions[active]?.[1] ?? "AI Direction";
  const currency = restaurant.data?.currency ?? "JOD";
  const previewItems = items.data?.length ? items.data : Array.from({ length: 6 }, (_, i) => ({ name_en: `Signature dish ${i + 1}`, name_ar: `طبق مميز ${i + 1}`, description_en: "Prepared fresh with care.", description_ar: "محضر طازجاً بعناية.", price: 8.5, image_url: null }));

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: string[] = [];
    for (const file of Array.from(files).slice(0, 5 - references.length)) {
      if (!file.type.startsWith("image/")) continue;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read image"));
        reader.readAsDataURL(file);
      });
      next.push(data);
    }
    setReferences((old) => [...old, ...next].slice(0, 5));
  }

  async function generateDesign() {
    setBusy(true);
    try {
      const result = await generate({ data: { restaurantId, brief, base: String(currentDirection), tweak: mode === "reference" ? "Reconstruct the reference composition closely, then make every design element editable and preserve its visual DNA." : "Create a genuinely new composition. Do not merely recolour an existing template.", provider: provider as "openai", images: references } });
      const parsed = result.variants.map((value) => parseMenuTheme(JSON.parse(value)));
      setVariants(parsed);
      setTheme(parsed[0] ?? theme);
      setActive(0);
      toast.success("Three design directions generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate design");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme }).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["smart-menu-studio", restaurantId] });
      toast.success("Menu design saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save design");
    } finally {
      setSaving(false);
    }
  }

  function exportDesign(target: "figma" | "canva" | "adobe") {
    const payload = { version: 1, target, restaurant: restaurant.data?.name, mode, referenceCount: references.length, theme, content: previewItems };
    if (target === "figma") download("quickserve-figma-design.json", JSON.stringify(payload, null, 2));
    if (target === "canva") download("quickserve-canva-handoff.json", JSON.stringify(payload, null, 2));
    if (target === "adobe") download("quickserve-adobe-art-direction.json", JSON.stringify({ ...payload, artDirection: { photography: "premium editorial food photography", editableLayers: true, preserveReferenceDNA: mode === "reference" } }, null, 2));
    toast.success(`${target === "figma" ? "Figma" : target === "canva" ? "Canva" : "Adobe"} editable handoff exported`);
  }

  const frameClass = viewport === "phone" ? "w-[360px]" : viewport === "tablet" ? "w-[680px]" : "w-full max-w-[980px]";

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-[#f5f5f3] text-[#171717]">
      <div className="mx-auto max-w-[1700px] px-3 py-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-col gap-4 rounded-[1.75rem] border border-black/[.07] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Sparkles className="size-5" /><h1 className="text-xl font-black tracking-tight">AI Menu Studio</h1><Badge>AI-first</Badge></div>
            <p className="mt-1 text-sm text-black/50">Design from zero or reconstruct a reference — then keep the result editable.</p>
          </div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => download("quickserve-menu-design.json", JSON.stringify(theme, null, 2))}><Download className="me-2 size-4" />Export</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save design"}</Button></div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)_300px]">
          <aside className="space-y-4">
            <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm">
              <div className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-black/40">Creative mode</div>
              <div className="grid grid-cols-2 gap-2">
                {([["create", "Create New", Wand2], ["reference", "Match Reference", ImagePlus]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setMode(id)} className={cn("rounded-2xl border p-3 text-start transition", mode === id ? "border-black bg-black text-white" : "hover:border-black/30")}><Icon className="mb-5 size-5" /><div className="text-sm font-bold">{label}</div><div className={cn("mt-1 text-[11px]", mode === id ? "text-white/60" : "text-black/45")}>{id === "create" ? "Invent a fresh direction" : "Use visual DNA from images"}</div></button>)}
              </div>
            </section>

            {mode === "reference" && <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-[.16em] text-black/40">Reference DNA</div><span className="text-xs text-black/40">{references.length}/5</span></div>
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} />
              <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-black/20 p-5 text-sm font-semibold hover:bg-black/[.025]"><ImagePlus className="size-5" />Attach menu screenshots</button>
              {references.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{references.map((src, i) => <div key={`${src.slice(-20)}-${i}`} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black/5"><img src={src} alt="Reference" className="h-full w-full object-cover" /><button type="button" className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white" onClick={() => setReferences((old) => old.filter((_, n) => n !== i))}>×</button></div>)}</div>}
            </section>}

            <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm">
              <div className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-black/40">Creative brief</div>
              <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. premium Amman steakhouse, cinematic photography, contemporary Arabic + English typography, unexpected asymmetrical layout…" className="min-h-28 resize-none rounded-2xl" />
              <div className="mt-4 text-xs font-bold text-black/50">AI engine</div>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm"><option value="openai">OpenAI — design reasoning</option><option value="gemini">Gemini — visual analysis</option><option value="claude">Claude — editorial reasoning</option><option value="adobe">Adobe — art direction</option><option value="figma">Figma — editable systems</option><option value="canva">Canva — editable pages</option></select>
              <Button className="mt-4 w-full rounded-xl" onClick={generateDesign} disabled={busy}>{busy ? <><RefreshCw className="me-2 size-4 animate-spin" />Designing…</> : <><Sparkles className="me-2 size-4" />Generate 3 directions</>}</Button>
            </section>

            <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm"><div className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-black/40">Design directions</div><div className="space-y-2">{directions.map(([id, name, description], i) => <button key={id} type="button" onClick={() => setActive(i)} className={cn("w-full rounded-2xl border p-3 text-start", active === i ? "border-black bg-black text-white" : "hover:bg-black/[.025]")}><div className="text-sm font-bold">{name}</div><div className={cn("mt-1 text-[11px]", active === i ? "text-white/55" : "text-black/45")}>{description}</div></button>)}</div></section>
          </aside>

          <main className="min-h-[720px] rounded-[1.75rem] border bg-[#dededb] p-3 shadow-sm sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/80 p-2 backdrop-blur"><div className="flex gap-1">{(["phone", "tablet", "desktop"] as Viewport[]).map((v) => <Button key={v} size="sm" variant={viewport === v ? "default" : "ghost"} onClick={() => setViewport(v)}>{v === "phone" ? <Smartphone className="size-4" /> : v === "tablet" ? <Tablet className="size-4" /> : <Monitor className="size-4" />}</Button>)}</div><div className="flex items-center gap-2"><button type="button" onClick={() => setZoom(Math.max(55, zoom - 5))}>−</button><span className="w-10 text-center text-xs">{zoom}%</span><button type="button" onClick={() => setZoom(Math.min(120, zoom + 5))}>+</button></div></div>
            <div className="flex min-h-[650px] items-start justify-center overflow-auto rounded-2xl bg-[#c9c9c6] p-6"><div className={cn(frameClass, "origin-top overflow-hidden rounded-[28px] shadow-2xl transition-all")} style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center", background: theme.bg, color: theme.text }}>
              <div className="relative overflow-hidden p-6 sm:p-9">
                <div className="mb-7 border-b pb-7" style={{ borderColor: `${theme.text}22` }}><div className="text-[11px] font-bold uppercase tracking-[.22em] opacity-50">{restaurant.data?.name ?? "Your Restaurant"}</div><div className="mt-2 text-4xl font-black tracking-tight" style={{ color: theme.primary }}>Menu</div><div className="mt-2 text-sm opacity-55">{theme.tagline || "Crafted for the table."}</div></div>
                <div className={cn("grid gap-5", theme.layout === "grid" || theme.layout === "mosaic" ? "sm:grid-cols-2" : "grid-cols-1")}>
                  {previewItems.map((item, i) => <article key={`${item.name_en}-${i}`} className="group" style={{ background: theme.surface, borderRadius: Math.max(8, theme.radius), overflow: "hidden" }}>
                    {theme.showImages && <div className="aspect-[16/10] overflow-hidden"><img src={item.image_url || ["https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=85", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=85", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85"][i % 3]} alt="Food" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div>}
                    <div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-base font-bold">{lang === "ar" ? item.name_ar : item.name_en}</h3><strong className="shrink-0" style={{ color: theme.primary }}>{Number(item.price).toFixed(2)} {currency}</strong></div><p className="mt-1 text-xs opacity-55">{lang === "ar" ? item.description_ar : item.description_en}</p></div>
                  </article>)}
                </div>
              </div>
            </div></div>
          </main>

          <aside className="space-y-4">
            <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2"><Layers3 className="size-4" /><div className="text-sm font-bold">Design DNA</div></div><div className="space-y-3 text-xs"><div className="flex justify-between"><span className="text-black/45">Direction</span><b>{currentDirection}</b></div><div className="flex justify-between"><span className="text-black/45">Layout</span><b>{theme.layout}</b></div><div className="flex justify-between"><span className="text-black/45">Typography</span><b>{theme.headingFont}</b></div><div className="flex justify-between"><span className="text-black/45">Image treatment</span><b>{theme.imageShape}</b></div><div className="flex justify-between"><span className="text-black/45">Reference DNA</span><b>{references.length ? `${references.length} images` : "None"}</b></div></div></section>
            <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Palette className="size-4" /><div className="text-sm font-bold">Visual system</div></div><div className="flex gap-2">{[theme.bg, theme.surface, theme.primary, theme.accent, theme.text].map((color, i) => <div key={`${color}-${i}`} title={color} className="size-9 rounded-xl border" style={{ background: color }} />)}</div></section>
            <section className="rounded-[1.5rem] border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Figma className="size-4" /><div className="text-sm font-bold">Creative handoff</div></div><p className="mb-3 text-xs leading-5 text-black/50">Export the structured design DNA so the next creative tool can continue editing instead of receiving a flattened screenshot.</p><div className="grid gap-2"><Button variant="outline" onClick={() => exportDesign("figma")}><Figma className="me-2 size-4" />Figma handoff</Button><Button variant="outline" onClick={() => exportDesign("canva")}><FileImage className="me-2 size-4" />Canva handoff</Button><Button variant="outline" onClick={() => exportDesign("adobe")}><Layers3 className="me-2 size-4" />Adobe handoff</Button></div></section>
          </aside>
        </div>
      </div>
    </div>
  );
}
