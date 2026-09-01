import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, Download, Eye, FileImage, Figma, ImagePlus, Layers3, Loader2, Palette, RefreshCw, Save, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THEME, FONT_LABELS, LAYOUT_LABELS, parseMenuTheme, type MenuTheme } from "@/lib/menu-theme";
import { generateMenuTheme } from "@/lib/theme.functions";
import { cn } from "@/lib/utils";

type Provider = "openai" | "gemini" | "claude" | "adobe" | "figma" | "canva";
type Mode = "create" | "reference";

type Concept = { id: string; title: string; description: string; theme: MenuTheme };

const DIRECTIONS = [
  ["Editorial dining", "Magazine hierarchy, cinematic imagery, confident typography"],
  ["Modern Levantine", "Warm materials, contemporary Arabic character, organic geometry"],
  ["Quiet luxury", "Restrained palette, premium spacing, sophisticated editorial type"],
  ["Experimental poster", "Unexpected scale, bold crops, graphic composition"],
  ["Human crafted", "Tactile paper, imperfect rules, hand-made visual language"],
  ["Street culture", "High contrast, energetic rhythm, modern food-market attitude"],
] as const;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read reference image"));
    reader.readAsDataURL(file);
  });
}

function Preview({ theme, restaurant, items }: { theme: MenuTheme; restaurant: any; items: any[] }) {
  const rows = items.slice(0, 6);
  const title = restaurant?.name || "Your Restaurant";
  return (
    <div className="h-full min-h-[620px] overflow-hidden rounded-[2rem] border border-black/10 bg-[#101112] p-3 shadow-2xl">
      <div className="mx-auto flex h-full max-w-[440px] flex-col overflow-hidden rounded-[1.6rem] border border-white/10" style={{ background: theme.bg, color: theme.text }}>
        <div className="relative overflow-hidden px-7 pb-7 pt-9">
          {restaurant?.cover_image_url ? <img src={restaurant.cover_image_url} className="absolute inset-0 h-full w-full object-cover opacity-35" alt="" /> : null}
          <div className="relative">
            {restaurant?.logo_url ? <img src={restaurant.logo_url} className="mb-5 h-10 w-auto max-w-36 object-contain" alt="" /> : null}
            <div className="text-[11px] uppercase tracking-[.22em] opacity-55">{theme.upperTitles ? "Menu" : "Welcome"}</div>
            <h1 className="mt-2 text-4xl font-semibold leading-[.95]" style={{ fontFamily: theme.headingFont === "sans" ? "ui-sans-serif" : theme.headingFont === "serif" || theme.headingFont === "display" ? "Georgia" : "ui-sans-serif" }}>{title}</h1>
            {theme.tagline ? <p className="mt-3 max-w-[280px] text-sm opacity-65">{theme.tagline}</p> : null}
          </div>
        </div>
        <div className="flex-1 overflow-auto px-5 pb-8 pt-2">
          {["Signature", "Mains", "Drinks"].map((section, si) => (
            <section key={section} className="mb-7">
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[.18em]" style={{ color: theme.primary }}>{section}</h2>
                <div className="h-px flex-1 opacity-15" style={{ background: theme.text }} />
              </div>
              {(rows.length ? rows : [{ name_en: "Signature dish", description_en: "Prepared fresh with care.", price: 8.5, image_url: null }]).slice(si * 2, si * 2 + 2).map((item: any, i: number) => (
                <article key={`${section}-${i}`} className="mb-3 flex gap-3 rounded-[1rem] p-2.5" style={{ background: theme.surface, borderRadius: theme.radius }}>
                  {theme.showImages ? <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ borderRadius: theme.imageShape === "circle" ? 999 : theme.radius }}><img src={item.image_url || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80"} className="h-full w-full object-cover" alt="" /></div> : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold leading-tight">{item.name_en || "Signature dish"}</h3><span className="shrink-0 text-xs font-bold" style={{ color: theme.primary }}>{Number(item.price || 8.5).toFixed(2)}</span></div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed opacity-55">{item.description_en || "Prepared fresh with care."}</p>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AIStudioMenuDesigner({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [provider, setProvider] = useState<Provider>("openai");
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selected, setSelected] = useState(0);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"creative" | "layers" | "brand">("creative");

  const restaurant = useQuery({
    queryKey: ["ai-menu-studio-restaurant", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,logo_url,cover_image_url,menu_theme,currency,primary_color,accent_color").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });
  const items = useQuery({
    queryKey: ["ai-menu-studio-items", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_items").select("id,name_en,name_ar,description_en,description_ar,price,image_url").eq("restaurant_id", restaurantId).eq("is_available", true).order("display_order", { ascending: true }).limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentConcept = concepts[selected];
  const meta = useMemo(() => {
    const layout = LAYOUT_LABELS[theme.layout];
    const font = FONT_LABELS[theme.headingFont];
    return { layout: layout?.en || theme.layout, font: font?.en || theme.headingFont };
  }, [theme]);

  async function generateDesign() {
    setGenerating(true);
    try {
      const base = mode === "reference" ? "Reference-driven reconstruction: preserve the reference's composition, hierarchy, spacing, image treatment and visual rhythm while keeping content editable." : "Invent a genuinely new menu composition. Do not merely recolor an existing template. Explore a new grid, hierarchy and visual rhythm appropriate for hospitality.";
      const result = await generate({ data: { restaurantId, brief, base, provider, images: references } });
      const parsed = (result.variants ?? []).map((raw, i) => {
        const value = parseMenuTheme(JSON.parse(raw));
        return { id: `${Date.now()}-${i}`, title: ["Primary direction", "Alternative direction", "Wildcard direction"][i] || "AI direction", description: "AI art-directed composition ready for editing.", theme: value };
      });
      if (!parsed.length) throw new Error("No design variants returned");
      setConcepts(parsed);
      setSelected(0);
      setTheme(parsed[0]!.theme);
      toast.success(`${parsed.length} new design directions created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the menu design");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme }).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["ai-menu-studio-restaurant", restaurantId] });
      toast.success("Menu design saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save design");
    } finally { setSaving(false); }
  }

  async function addReferences(files: FileList | null) {
    if (!files) return;
    try {
      const next = await Promise.all(Array.from(files).slice(0, 5 - references.length).map(fileToDataUrl));
      setReferences((old) => [...old, ...next]);
      setMode("reference");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not attach image"); }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#171717]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#f5f5f2]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-7">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-black text-white"><Sparkles className="size-5" /></div><div><h1 className="text-base font-bold tracking-tight">AI Menu Studio</h1><p className="text-[11px] text-black/45">Creative direction, editing & export</p></div></div>
          <div className="flex items-center gap-2"><Button variant="outline" className="hidden sm:flex rounded-xl" onClick={() => fileRef.current?.click()}><ImagePlus className="me-2 size-4" />Reference</Button><Button className="rounded-xl bg-black text-white hover:bg-black/85" onClick={save} disabled={saving}><Save className="me-2 size-4" />{saving ? "Saving" : "Save design"}</Button></div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 p-4 lg:grid-cols-[360px_minmax(0,1fr)_300px] lg:p-7">
        <aside className="space-y-4">
          <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm">
            <div className="mb-4 flex rounded-xl bg-black/[.04] p-1"><button onClick={() => setMode("create")} className={cn("flex-1 rounded-lg py-2 text-xs font-semibold", mode === "create" && "bg-white shadow-sm")}>Create new</button><button onClick={() => setMode("reference")} className={cn("flex-1 rounded-lg py-2 text-xs font-semibold", mode === "reference" && "bg-white shadow-sm")}>Match reference</button></div>
            <label className="mb-2 block text-xs font-bold">Creative brief</label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe the mood, cuisine, audience, materials, typography or anything you want the art director to understand…" className="min-h-28 resize-none rounded-xl border-black/10 bg-[#fafaf8] text-sm" />
            <div className="mt-4"><label className="mb-2 block text-xs font-bold">AI creative engine</label><div className="relative"><select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className="h-10 w-full appearance-none rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold"><option value="openai">OpenAI — Creative Director</option><option value="gemini">Gemini — Visual Analysis</option><option value="claude">Claude — Editorial Reasoning</option><option value="adobe">Adobe — Art Direction</option><option value="figma">Figma — Editable Systems</option><option value="canva">Canva — Editable Pages</option></select><ChevronDown className="pointer-events-none absolute end-3 top-3 size-4 opacity-40" /></div></div>
            <Button onClick={generateDesign} disabled={generating} className="mt-4 h-11 w-full rounded-xl bg-black text-white hover:bg-black/85">{generating ? <><Loader2 className="me-2 size-4 animate-spin" />Art-directing…</> : <><Wand2 className="me-2 size-4" />Generate 3 directions</>}</Button>
          </section>

          <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold">Reference DNA</h2><p className="text-[11px] text-black/45">Upload up to 5 visual references</p></div><button onClick={() => fileRef.current?.click()} className="grid size-9 place-items-center rounded-xl bg-black text-white"><ImagePlus className="size-4" /></button></div>
            <div className="grid grid-cols-3 gap-2">{references.map((src, i) => <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-black/10"><img src={src} className="h-full w-full object-cover" alt="Reference" /><button onClick={() => setReferences(references.filter((_, j) => j !== i))} className="absolute end-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white">×</button></div>)}{references.length === 0 && <button onClick={() => fileRef.current?.click()} className="col-span-3 grid h-24 place-items-center rounded-xl border border-dashed border-black/15 bg-black/[.02] text-center text-xs text-black/45"><FileImage className="mb-1 size-5" />Drop a menu screenshot here</button>}</div>
          </section>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addReferences(e.target.files)} />
        </aside>

        <section className="min-h-[720px] rounded-[1.8rem] border border-black/10 bg-[#202123] p-3 shadow-xl lg:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1"><div className="flex items-center gap-2 text-white"><Eye className="size-4 opacity-60" /><span className="text-xs font-semibold">Live composition</span><span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/55">{meta.layout} · {meta.font}</span></div><div className="flex gap-1 rounded-xl bg-white/10 p-1"><button onClick={() => setTab("creative")} className={cn("rounded-lg px-3 py-1.5 text-[10px] font-semibold", tab === "creative" ? "bg-white text-black" : "text-white/60")}>Canvas</button><button onClick={() => setTab("layers")} className={cn("rounded-lg px-3 py-1.5 text-[10px] font-semibold", tab === "layers" ? "bg-white text-black" : "text-white/60")}>Layers</button><button onClick={() => setTab("brand")} className={cn("rounded-lg px-3 py-1.5 text-[10px] font-semibold", tab === "brand" ? "bg-white text-black" : "text-white/60")}>Brand</button></div></div>
          <div className="mx-auto max-w-[560px]"><Preview theme={theme} restaurant={restaurant.data} items={items.data ?? []} /></div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">AI concepts</h2><button onClick={generateDesign} disabled={generating} className="grid size-8 place-items-center rounded-lg bg-black text-white"><RefreshCw className={cn("size-3.5", generating && "animate-spin")} /></button></div>{concepts.length === 0 ? <div className="rounded-xl bg-black/[.03] p-5 text-center text-xs text-black/40">Generate directions to see radically different compositions here.</div> : <div className="space-y-2">{concepts.map((concept, i) => <button key={concept.id} onClick={() => { setSelected(i); setTheme(concept.theme); }} className={cn("w-full rounded-xl border p-3 text-start transition", selected === i ? "border-black bg-black text-white" : "border-black/10 hover:border-black/25")}><div className="flex items-center justify-between"><span className="text-xs font-bold">{concept.title}</span>{selected === i && <Check className="size-3.5" />}</div><p className={cn("mt-1 text-[10px] leading-relaxed", selected === i ? "text-white/55" : "text-black/45")}>{concept.description}</p></button>)}</div>}</section>

          <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Layers3 className="size-4" /><h2 className="text-sm font-bold">Design DNA</h2></div><div className="space-y-2 text-xs"><div className="flex justify-between border-b border-black/5 py-2"><span className="text-black/45">Layout</span><strong>{meta.layout}</strong></div><div className="flex justify-between border-b border-black/5 py-2"><span className="text-black/45">Heading</span><strong>{meta.font}</strong></div><div className="flex justify-between border-b border-black/5 py-2"><span className="text-black/45">Images</span><strong>{theme.showImages ? "Art-directed" : "Hidden"}</strong></div><div className="flex items-center justify-between py-2"><span className="text-black/45">Palette</span><div className="flex gap-1"><span className="size-5 rounded-full border border-black/10" style={{ background: theme.bg }} /><span className="size-5 rounded-full border border-black/10" style={{ background: theme.primary }} /><span className="size-5 rounded-full border border-black/10" style={{ background: theme.accent }} /></div></div></div></section>

          <section className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm"><h2 className="mb-3 text-sm font-bold">Creative handoff</h2><div className="grid grid-cols-3 gap-2"><button className="rounded-xl border border-black/10 p-3 text-center text-[10px] font-semibold hover:bg-black/[.03]"><Figma className="mx-auto mb-1 size-4" />Figma</button><button className="rounded-xl border border-black/10 p-3 text-center text-[10px] font-semibold hover:bg-black/[.03]"><Palette className="mx-auto mb-1 size-4" />Canva</button><button className="rounded-xl border border-black/10 p-3 text-center text-[10px] font-semibold hover:bg-black/[.03]"><Download className="mx-auto mb-1 size-4" />Export</button></div><p className="mt-3 text-[10px] leading-relaxed text-black/40">The design stays structured so future Figma, Canva and Adobe handoffs can preserve editable layers instead of flattening the menu.</p></section>
        </aside>
      </main>
    </div>
  );
}
