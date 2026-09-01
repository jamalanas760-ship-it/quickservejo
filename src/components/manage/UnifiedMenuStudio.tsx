import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Camera, Check, FileImage, Layers3, LayoutTemplate, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_THEME, parseMenuTheme, type MenuTheme } from "@/lib/menu-theme";
import { orchestrateSmartMenuDesign } from "@/lib/smart-menu-orchestrator.server";
import { cn } from "@/lib/utils";

type CreativeMode = "new" | "reference";

const moods = [
  ["Editorial", "Magazine-led, confident and art-directed"],
  ["Modern Levantine", "Warm, cultural and contemporary"],
  ["Quiet Luxury", "Restrained, premium and tactile"],
  ["Experimental", "Unexpected composition and bold rhythm"],
  ["Human Crafted", "Print texture, imperfection and character"],
  ["Photography First", "Food imagery drives the composition"],
] as const;

export function UnifiedMenuStudio({ restaurantId }: { restaurantId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const orchestrate = useServerFn(orchestrateSmartMenuDesign);
  const [mode, setMode] = useState<CreativeMode>("new");
  const [brief, setBrief] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [mood, setMood] = useState("Editorial");
  const [concepts, setConcepts] = useState<Array<{ id: string; theme: string }>>([]);
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const restaurant = useQuery({
    queryKey: ["unified-menu-studio", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name,menu_theme,currency").eq("id", restaurantId).single();
      if (error) throw error;
      return data;
    },
  });

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const encoded: string[] = [];
    for (const file of Array.from(files).slice(0, 5 - references.length)) {
      if (!file.type.startsWith("image/")) continue;
      encoded.push(await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }));
    }
    setReferences((old) => [...old, ...encoded].slice(0, 5));
  }

  async function design() {
    setBusy(true);
    try {
      const result = await orchestrate({ data: { restaurantId, brief, references, direction: mood, language: "en" } });
      const next = result.concepts.map((concept) => ({ id: concept.id, theme: concept.theme }));
      setConcepts(next);
      const first = next[0] ? parseMenuTheme(JSON.parse(next[0].theme)) : DEFAULT_THEME;
      setTheme(first);
      setActive(0);
      toast.success("Your creative stack has designed 3 distinct menus");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the menu");
    } finally {
      setBusy(false);
    }
  }

  function selectConcept(index: number) {
    setActive(index);
    const value = concepts[index];
    if (value) setTheme(parseMenuTheme(JSON.parse(value.theme)));
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("restaurants").update({ menu_theme: theme }).eq("id", restaurantId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["unified-menu-studio", restaurantId] });
      toast.success("Humanized menu design saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save design");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] bg-[#f4f2ee] text-[#171717]">
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 overflow-hidden rounded-[2rem] border border-black/10 bg-[#171717] p-6 text-white shadow-xl sm:p-8">
          <div className="max-w-4xl">
            <div className="mb-3 flex flex-wrap items-center gap-2"><Badge className="border-white/20 bg-white/10 text-white">CREATIVE INTELLIGENCE</Badge><span className="text-xs text-white/45">QuickServe Menu Studio</span></div>
            <h1 className="text-3xl font-black tracking-[-.04em] sm:text-5xl">A designer, not a template machine.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base">QuickServe combines AI reasoning with Figma-style structure, Canva-style editability and Adobe-level visual art direction into one creative workflow.</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-white/70">
              {["Understand", "Art-direct", "Compose", "Humanize", "Make editable", "Quality-check"].map((step, i) => <span key={step} className="rounded-full border border-white/10 bg-white/[.06] px-3 py-2"><span className="mr-1 text-white/30">0{i + 1}</span>{step}</span>)}
            </div>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-[1.75rem] border bg-white p-5 shadow-sm">
              <div className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-black/40">What should I create?</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMode("new")} className={cn("rounded-2xl border p-4 text-left", mode === "new" ? "border-black bg-black text-white" : "hover:border-black/30")}><Wand2 className="mb-7 size-5" /><div className="font-bold">New direction</div><p className="mt-1 text-xs opacity-55">Invent something original.</p></button>
                <button onClick={() => setMode("reference")} className={cn("rounded-2xl border p-4 text-left", mode === "reference" ? "border-black bg-black text-white" : "hover:border-black/30")}><FileImage className="mb-7 size-5" /><div className="font-bold">Use reference</div><p className="mt-1 text-xs opacity-55">Understand the visual DNA.</p></button>
              </div>
            </section>

            {mode === "reference" && <section className="rounded-[1.75rem] border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-[.18em] text-black/40">Visual DNA</div><span className="text-xs text-black/40">{references.length}/5</span></div>
              <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
              <button onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-black/20 p-5 text-sm font-semibold"><FileImage className="size-5" />Upload menu references</button>
              {references.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{references.map((src, index) => <div key={src.slice(-30) + index} className="relative aspect-[3/4] overflow-hidden rounded-xl"><img src={src} alt="Reference" className="h-full w-full object-cover" /><button onClick={() => setReferences((old) => old.filter((_, i) => i !== index))} className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-1 text-xs text-white">×</button></div>)}</div>}
              <p className="mt-3 text-xs leading-5 text-black/45">The AI extracts hierarchy, grid, typography, crop logic, spacing, material and rhythm. It rebuilds the system instead of placing the screenshot behind the menu.</p>
            </section>}

            <section className="rounded-[1.75rem] border bg-white p-5 shadow-sm">
              <div className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-black/40">Creative brief</div>
              <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Tell the designer what the restaurant should feel like…" className="min-h-28 resize-none rounded-2xl" />
              <div className="mt-4 text-xs font-bold uppercase tracking-[.18em] text-black/40">Creative personality</div>
              <div className="mt-2 grid grid-cols-2 gap-2">{moods.map(([name, description]) => <button key={name} onClick={() => setMood(name)} className={cn("rounded-xl border p-3 text-left", mood === name ? "border-black bg-black text-white" : "hover:bg-black/[.025]")}><div className="text-xs font-bold">{name}</div><div className="mt-1 text-[10px] opacity-50">{description}</div></button>)}</div>
              <Button className="mt-4 w-full rounded-xl" onClick={design} disabled={busy}>{busy ? <><Sparkles className="mr-2 size-4 animate-pulse" />Creative director working…</> : <><Sparkles className="mr-2 size-4" />Create my menu</>}</Button>
            </section>
          </aside>

          <main className="rounded-[2rem] border bg-[#ddd9d2] p-3 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/80 p-3 backdrop-blur">
              <div><div className="text-sm font-bold">{restaurant.data?.name ?? "Restaurant"} — Creative Canvas</div><div className="text-xs text-black/40">One unified design system</div></div>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save design"}</Button>
            </div>

            <div className="mb-4 grid gap-2 sm:grid-cols-3">
              {concepts.map((concept, index) => <button key={concept.id} onClick={() => selectConcept(index)} className={cn("rounded-2xl border bg-white p-3 text-left", active === index ? "border-black ring-2 ring-black/10" : "hover:border-black/30")}><div className="flex items-center gap-2 text-xs font-bold"><span className="grid size-6 place-items-center rounded-full bg-black text-white">{index + 1}</span>Creative concept {index + 1}</div><div className="mt-2 text-[11px] text-black/45">{index === 0 ? "Balanced editorial direction" : index === 1 ? "Alternative composition" : "Unexpected visual language"}</div></button>)}
              {!concepts.length && <div className="sm:col-span-3 rounded-2xl border border-dashed border-black/15 bg-white/40 p-6 text-center text-sm text-black/40">Create a direction to see the AI canvas.</div>}
            </div>

            <div className="grid min-h-[680px] place-items-center overflow-auto rounded-[1.5rem] bg-[#c9c5bd] p-6">
              <div className="w-full max-w-[760px] overflow-hidden rounded-[2rem] bg-white shadow-2xl" style={{ background: theme.bg, color: theme.text }}>
                <div className="p-7 sm:p-10">
                  <div className="mb-8 flex items-end justify-between gap-5 border-b pb-7" style={{ borderColor: `${theme.text}18` }}>
                    <div><div className="text-[10px] font-bold uppercase tracking-[.25em] opacity-45">{restaurant.data?.name ?? "Your Restaurant"}</div><h2 className="mt-2 text-4xl font-black tracking-[-.04em]" style={{ color: theme.primary }}>Menu</h2><p className="mt-2 text-sm opacity-50">{theme.tagline || "Made with intention."}</p></div>
                    <div className="hidden text-right text-[10px] font-bold uppercase tracking-[.18em] opacity-35 sm:block">Creative<br />Edition</div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, index) => <article key={index} className="overflow-hidden" style={{ background: theme.surface, borderRadius: Math.max(8, theme.radius) }}>
                      {theme.showImages && <div className="aspect-[4/3]" style={{ background: `linear-gradient(135deg, ${theme.primary}22, ${theme.accent}22)` }}><div className="grid h-full place-items-center"><Camera className="size-8 opacity-20" /></div></div>}
                      <div className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">Signature Dish {index + 1}</h3><p className="mt-1 text-xs opacity-50">Fresh ingredients, thoughtful preparation.</p></div><span className="shrink-0 font-bold" style={{ color: theme.primary }}>{(8.5 + index).toFixed(2)}</span></div></div>
                    </article>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[{ icon: BrainCircuit, title: "AI Creative Director", text: "Makes the design decision." }, { icon: Layers3, title: "Figma thinking", text: "Keeps every structure editable." }, { icon: Camera, title: "Adobe art direction", text: "Makes imagery feel photographed." }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl bg-white/75 p-4"><Icon className="size-4" /><div className="mt-3 text-sm font-bold">{title}</div><div className="mt-1 text-xs text-black/45">{text}</div><div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-black/45"><Check className="size-3" /> Built into one workflow</div></div>)}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
