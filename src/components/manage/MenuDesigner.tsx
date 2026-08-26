import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Sparkles, ExternalLink, Plus, ImagePlus, X, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { useI18n } from "@/lib/i18n";
import { generateMenuTheme } from "@/lib/theme.functions";
import {
  BG_STYLE_LABELS,
  BUTTON_STYLE_LABELS,
  CARD_STYLE_LABELS,
  DENSITY_LABELS,
  DEFAULT_THEME,
  FONT_LABELS,
  FONT_STACKS,
  HERO_LABELS,
  LAYOUT_LABELS,
  TEMPLATES,
  imageShapeClass,
  parseMenuTheme,
  themeVars,
  buttonStyle as buttonStyleFor,
  pageBackground,
  surfaceStyle,
  type BgStyleId,
  type ButtonStyleId,
  type CardStyleId,
  type DensityId,
  type FontId,
  type HeroId,
  type ImageShape,
  type LayoutId,
  type MenuTheme,
  type TemplateId,
} from "@/lib/menu-theme";
import { cn } from "@/lib/utils";

const FONT_IDS: FontId[] = ["sans", "serif", "rounded", "mono", "display"];
const MAX_IMAGES = 3;

const AI_IDEAS: { en: string; ar: string }[] = [
  { en: "Warm premium steakhouse, dark and confident", ar: "ستيك هاوس فخم دافئ وجاد" },
  { en: "Bright modern café, airy and minimal", ar: "مقهى عصري مشرق وبسيط" },
  { en: "Bold street food, playful and high contrast", ar: "أكل شارع جسور ومرح وعالي التباين" },
  { en: "Elegant Levantine fine dining", ar: "مطبخ شامي راقٍ وأنيق" },
  { en: "Fresh juice bar, fruity and energetic", ar: "بار عصائر منعش وحيوي" },
];

/** Downscales an uploaded reference image to a compact data URL for the AI call. */
async function toCompactDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 900;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot read image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function MenuDesigner({ restaurantId }: { restaurantId: string }) {
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMenuTheme);
  const [theme, setTheme] = useState<MenuTheme>(DEFAULT_THEME);
  const [brief, setBrief] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const restaurant = useQuery({
    queryKey: ["design", restaurantId],
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
    queryKey: ["design", "sample", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name_en, name_ar, description_en, description_ar, price, image_url")
        .eq("restaurant_id", restaurantId)
        .eq("is_available", true)
        .order("display_order", { ascending: true })
        .limit(4);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (restaurant.data) setTheme(parseMenuTheme(restaurant.data.menu_theme));
  }, [restaurant.data]);

  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ menu_theme: theme as unknown as never })
        .eq("id", restaurantId);
      if (error) throw error;
      await logAudit("menu.theme_updated", {
        restaurantId,
        entity: "restaurants",
        entityId: restaurantId,
        metadata: { template: theme.template },
      });
      await queryClient.invalidateQueries({ queryKey: ["design"] });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function addRefs(files: FileList | null) {
    if (!files?.length) return;
    try {
      const room = MAX_IMAGES - refs.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      const urls = await Promise.all(picked.map(toCompactDataUrl));
      setRefs((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  async function runAi() {
    setAiBusy(true);
    try {
      const result = await generate({
        data: {
          restaurantId,
          ...(brief.trim() ? { brief: brief.trim() } : {}),
          ...(refs.length ? { images: refs } : {}),
        },
      });
      setTheme(parseMenuTheme(JSON.parse(result.themeJson)));
      toast.success(t("design.aiDone"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setAiBusy(false);
    }
  }

  if (restaurant.isPending) return <Skeleton className="h-96 rounded-xl" />;

  const colorFields: { key: keyof MenuTheme; labelKey: string }[] = [
    { key: "bg", labelKey: "design.bg" },
    { key: "surface", labelKey: "design.surface" },
    { key: "text", labelKey: "design.text" },
    { key: "muted", labelKey: "design.muted" },
    { key: "primary", labelKey: "design.primary" },
    { key: "primaryText", labelKey: "design.primaryText" },
    { key: "accent", labelKey: "design.accent" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("design.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("design.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/r/${restaurant.data?.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> {t("design.openMenu")}
            </a>
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="panel space-y-3 p-4">
            <h3 className="text-sm font-semibold">{t("design.templates")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
                const preset = TEMPLATES[id];
                const active = theme.template === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(preset.theme)}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-all",
                      active ? "ring-2 ring-primary" : "hover:border-primary/40",
                    )}
                  >
                    <div
                      className="mb-2 h-16 w-full rounded-lg border"
                      style={{ background: preset.theme.bg }}
                    >
                      <div
                        className="m-2 h-6 rounded"
                        style={{ background: preset.theme.surface }}
                      />
                      <div className="mx-2 flex gap-1">
                        <span
                          className="h-3 w-8 rounded"
                          style={{ background: preset.theme.primary }}
                        />
                        <span
                          className="h-3 w-4 rounded"
                          style={{ background: preset.theme.accent }}
                        />
                      </div>
                    </div>
                    <p className="text-sm font-medium">{preset.label[lang]}</p>
                    <p className="text-xs text-muted-foreground">
                      {LAYOUT_LABELS[preset.theme.layout][lang]}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Wand2 className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{t("design.aiStudio")}</h3>
                <p className="text-xs text-muted-foreground">{t("design.aiStudioHint")}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("design.aiBrief")}</Label>
              <Textarea
                rows={3}
                value={brief}
                placeholder={t("design.aiPlaceholder")}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {AI_IDEAS.map((idea) => (
                <button
                  key={idea.en}
                  type="button"
                  onClick={() => setBrief(idea[lang])}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  {idea[lang]}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label>{t("design.aiRefs")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                {refs.map((src, index) => (
                  <div key={src.slice(-24) + index} className="relative">
                    <img
                      src={src}
                      alt=""
                      className="size-16 rounded-lg border object-cover"
                    />
                    <button
                      type="button"
                      aria-label={t("common.delete")}
                      onClick={() => setRefs((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full border bg-background shadow"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {refs.length < MAX_IMAGES ? (
                  <label className="grid size-16 cursor-pointer place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                    <ImagePlus className="size-5" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void addRefs(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{t("design.aiRefsHint")}</p>
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button className="flex-1 sm:flex-none" disabled={aiBusy} onClick={() => void runAi()}>
                <Sparkles className="size-4" />
                {aiBusy ? t("design.aiWorking") : t("design.ai")}
              </Button>
              <Button variant="ghost" onClick={() => setTheme(TEMPLATES[theme.template].theme)}>
                {t("design.reset")}
              </Button>
            </div>
          </section>

          <section className="panel space-y-3 p-4">
            <h3 className="text-sm font-semibold">{t("design.colors")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colorFields.map((field) => (
                <div key={String(field.key)} className="space-y-1.5">
                  <Label>{t(field.labelKey)}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={String(theme[field.key])}
                      onChange={(e) =>
                        setTheme((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="size-9 cursor-pointer rounded border bg-transparent"
                      aria-label={t(field.labelKey)}
                    />
                    <Input
                      value={String(theme[field.key])}
                      onChange={(e) =>
                        setTheme((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("design.headingFont")}</Label>
              <Select
                value={theme.headingFont}
                onValueChange={(v) => setTheme((p) => ({ ...p, headingFont: v as FontId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_IDS.map((f) => (
                    <SelectItem key={f} value={f} style={{ fontFamily: FONT_STACKS[f] }}>
                      {FONT_LABELS[f][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("design.bodyFont")}</Label>
              <Select
                value={theme.bodyFont}
                onValueChange={(v) => setTheme((p) => ({ ...p, bodyFont: v as FontId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_IDS.map((f) => (
                    <SelectItem key={f} value={f} style={{ fontFamily: FONT_STACKS[f] }}>
                      {FONT_LABELS[f][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("design.layout")}</Label>
              <Select
                value={theme.layout}
                onValueChange={(v) => setTheme((p) => ({ ...p, layout: v as LayoutId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LAYOUT_LABELS) as LayoutId[]).map((l) => (
                    <SelectItem key={l} value={l}>
                      {LAYOUT_LABELS[l][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("design.hero")}</Label>
              <Select
                value={theme.hero}
                onValueChange={(v) => setTheme((p) => ({ ...p, hero: v as HeroId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(HERO_LABELS) as HeroId[]).map((h) => (
                    <SelectItem key={h} value={h}>
                      {HERO_LABELS[h][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>
                {t("design.radius")} — {theme.radius}px
              </Label>
              <Slider
                value={[theme.radius]}
                min={0}
                max={32}
                step={1}
                onValueChange={([v]) => setTheme((p) => ({ ...p, radius: v ?? 0 }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label>{t("design.showImages")}</Label>
              <Switch
                checked={theme.showImages}
                onCheckedChange={(v) => setTheme((p) => ({ ...p, showImages: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label>{t("design.showIcons")}</Label>
              <Switch
                checked={theme.showIcons}
                onCheckedChange={(v) => setTheme((p) => ({ ...p, showIcons: v }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("design.imageShape")}</Label>
              <Select
                value={theme.imageShape}
                onValueChange={(v) => setTheme((p) => ({ ...p, imageShape: v as ImageShape }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rounded">{lang === "ar" ? "حواف ناعمة" : "Rounded"}</SelectItem>
                  <SelectItem value="circle">{lang === "ar" ? "دائري" : "Circle"}</SelectItem>
                  <SelectItem value="square">{lang === "ar" ? "مربّع" : "Square"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("design.buttonStyle")}</Label>
              <Select
                value={theme.buttonStyle}
                onValueChange={(v) => setTheme((p) => ({ ...p, buttonStyle: v as ButtonStyleId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BUTTON_STYLE_LABELS) as ButtonStyleId[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {BUTTON_STYLE_LABELS[k][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("design.cardStyle")}</Label>
              <Select
                value={theme.cardStyle}
                onValueChange={(v) => setTheme((p) => ({ ...p, cardStyle: v as CardStyleId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CARD_STYLE_LABELS) as CardStyleId[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CARD_STYLE_LABELS[k][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("design.bgStyle")}</Label>
              <Select
                value={theme.bgStyle}
                onValueChange={(v) => setTheme((p) => ({ ...p, bgStyle: v as BgStyleId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BG_STYLE_LABELS) as BgStyleId[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {BG_STYLE_LABELS[k][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("design.density")}</Label>
              <Select
                value={theme.density}
                onValueChange={(v) => setTheme((p) => ({ ...p, density: v as DensityId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DENSITY_LABELS) as DensityId[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {DENSITY_LABELS[k][lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-sm font-semibold">{t("design.preview")}</p>
          <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-background shadow-xl">
            <div
              className="max-h-[560px] overflow-y-auto p-3"
              style={{
                ...themeVars(theme),
                ...pageBackground(theme),
                color: "var(--qs-text)",
                fontFamily: "var(--qs-body-font)",
              }}
            >
              {theme.hero === "cover" && restaurant.data?.cover_image_url ? (
                <img
                  src={restaurant.data.cover_image_url}
                  alt=""
                  className="mb-3 h-24 w-full object-cover"
                  style={{ borderRadius: "var(--qs-radius)" }}
                />
              ) : theme.hero === "gradient" ? (
                <div
                  className="mb-3 h-20 w-full"
                  style={{
                    borderRadius: "var(--qs-radius)",
                    background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
                  }}
                />
              ) : null}

              <div
                className="mb-3 flex items-center gap-2 p-3"
                style={surfaceStyle(theme)}
              >
                {restaurant.data?.logo_url ? (
                  <img
                    src={restaurant.data.logo_url}
                    alt=""
                    className={cn("size-10 object-cover", imageShapeClass(theme))}
                  />
                ) : null}
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-bold"
                    style={{ fontFamily: "var(--qs-heading-font)" }}
                  >
                    {restaurant.data?.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--qs-muted)" }}>
                    {lang === "ar" ? "طاولة 1" : "Table 1"}
                  </p>
                </div>
              </div>

              <div className="mb-3 flex gap-1.5">
                <span className="px-2.5 py-1 text-[11px] font-medium" style={buttonStyleFor(theme)}>
                  {lang === "ar" ? "الكل" : "All"}
                </span>
                <span className="px-2.5 py-1 text-[11px]" style={buttonStyleFor(theme, false)}>
                  {lang === "ar" ? "الأطباق" : "Dishes"}
                </span>
              </div>

              <div className={cn(theme.layout === "grid" ? "grid grid-cols-2 gap-2" : "space-y-2")}>
                {(sample.data ?? []).length === 0
                  ? [1, 2, 3].map((i) => (
                      <PreviewCard
                        key={i}
                        theme={theme}
                        title={lang === "ar" ? `صنف ${i}` : `Sample item ${i}`}
                        description={lang === "ar" ? "وصف قصير للصنف" : "A short item description"}
                        price="9.50"
                        image={null}
                        currency={restaurant.data?.currency ?? "JOD"}
                      />
                    ))
                  : (sample.data ?? []).map((item) => (
                      <PreviewCard
                        key={item.id}
                        theme={theme}
                        title={pick(item.name_en, item.name_ar)}
                        description={pick(item.description_en, item.description_ar)}
                        price={Number(item.price).toFixed(2)}
                        image={item.image_url}
                        currency={restaurant.data?.currency ?? "JOD"}
                      />
                    ))}
              </div>

              <div
                className="mt-3 py-2.5 text-center text-xs font-semibold"
                style={buttonStyleFor(theme)}
              >
                {lang === "ar" ? "إرسال الطلب" : "Send order"}
              </div>
            </div>
          </div>
          <div className="mt-2 text-center">
            <Badge variant="outline">{TEMPLATES[theme.template].label[lang]}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  theme,
  title,
  description,
  price,
  image,
  currency,
}: {
  theme: MenuTheme;
  title: string;
  description: string;
  price: string;
  image: string | null;
  currency: string;
}) {
  const stacked = theme.layout !== "list";
  return (
    <div
      className={cn("p-2", stacked ? "" : "flex items-center gap-2")}
      style={surfaceStyle(theme)}
    >
      {theme.showImages ? (
        image ? (
          <img
            src={image}
            alt=""
            className={cn(
              "object-cover",
              imageShapeClass(theme),
              stacked ? "mb-1.5 h-20 w-full" : "size-14 shrink-0",
            )}
          />
        ) : (
          <div
            className={cn(
              imageShapeClass(theme),
              stacked ? "mb-1.5 h-20 w-full" : "size-14 shrink-0",
            )}
            style={{ background: `${theme.accent}33` }}
          />
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-xs font-semibold"
          style={{ fontFamily: "var(--qs-heading-font)" }}
        >
          {title}
        </p>
        <p className="line-clamp-2 text-[10px]" style={{ color: "var(--qs-muted)" }}>
          {description}
        </p>
        <p className="mt-0.5 text-[11px] font-bold" style={{ color: "var(--qs-accent)" }}>
          {currency} {price}
        </p>
      </div>
      {theme.showIcons ? (
        <Plus className="size-4 shrink-0" style={{ color: "var(--qs-muted)" }} />
      ) : null}
    </div>
  );
}
