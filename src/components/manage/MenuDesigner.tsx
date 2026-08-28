import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check, ExternalLink, ImagePlus, Sparkles, Wand2, X } from "lucide-react";
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
import {
  ANIMATION_LABELS,
  DEFAULT_THEME,
  SIGNATURE_TEMPLATES,
  TEMPLATES,
  TWEAKS,
  densityGap,
  imageShapeClass,
  itemMotion,
  pageBackground,
  parseMenuTheme,
  sectionFrameStyle,
  surfaceStyle,
  themeVars,
  buttonStyle as buttonStyleFor,
  type MenuTheme,
  type TemplateId,
} from "@/lib/menu-theme";
import {
  isTicket,
  itemImageClass,
  itemSpanClass,
  itemVariant,
  itemsContainerClass,
} from "@/lib/menu-layout";
import {
  DecorBand,
  MenuHero,
  PriceLine,
  SectionHeading,
  TextureLayer,
} from "@/components/menu/MenuChrome";
import { cn } from "@/lib/utils";

const MAX_IMAGES = 3;

const AI_IDEAS: { en: string; ar: string }[] = [
  { en: "Warm premium steakhouse, dark and confident", ar: "ستيك هاوس فخم دافئ وجاد" },
  { en: "Bright modern café, airy and minimal", ar: "مقهى عصري مشرق وبسيط" },
  { en: "Bold street food, playful and high contrast", ar: "أكل شارع جسور ومرح وعالي التباين" },
  { en: "Elegant Levantine fine dining", ar: "مطبخ شامي راقٍ وأنيق" },
  { en: "Artisan bakery, editorial and typographic", ar: "مخبز حرفي بطابع تحريري" },
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
  const [tweak, setTweak] = useState("");
  const [base, setBase] = useState<TemplateId | "">("");
  const [refs, setRefs] = useState<string[]>([]);
  const [variants, setVariants] = useState<MenuTheme[]>([]);
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
          ...(tweak.trim() ? { tweak: tweak.trim() } : {}),
          ...(base ? { base } : {}),
          ...(refs.length ? { images: refs } : {}),
        },
      });
      const parsed = result.variants.map((json) => parseMenuTheme(JSON.parse(json)));
      setVariants(parsed);
      if (parsed[0]) setTheme(parsed[0]);
      toast.success(t("design.aiDone"));
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setAiBusy(false);
    }
  }

  if (restaurant.isPending) return <Skeleton className="h-96 rounded-xl" />;

  const previewItems = (sample.data ?? []).length
    ? (sample.data ?? []).map((item) => ({
        id: item.id,
        title: pick(item.name_en, item.name_ar),
        description: pick(item.description_en, item.description_ar),
        price: Number(item.price).toFixed(2),
        image: item.image_url,
      }))
    : [1, 2, 3].map((i) => ({
        id: String(i),
        title: lang === "ar" ? `صنف ${i}` : `Sample item ${i}`,
        description: lang === "ar" ? "وصف قصير للصنف" : "A short item description",
        price: "9.50",
        image: null as string | null,
      }));

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
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Wand2 className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{t("design.aiStudio")}</h3>
                <p className="text-xs text-muted-foreground">{t("design.aiStudioHint")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{lang === "ar" ? "قاعدة التصميم" : "Design base"}</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SIGNATURE_TEMPLATES.map((id) => {
                  const template = TEMPLATES[id];
                  const active = base === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setBase(active ? "" : id);
                        setTheme(template.theme);
                      }}
                      className={cn(
                        "overflow-hidden rounded-xl border text-start transition-colors",
                        active ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40",
                      )}
                    >
                      <TemplateSwatch theme={template.theme} />
                      <span className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium">
                        {active ? <Check className="size-3 text-primary" /> : null}
                        {template.label[lang]}
                      </span>
                    </button>
                  );
                })}
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
              <Label>{lang === "ar" ? "تعديل سريع" : "Quick tweak"}</Label>
              <div className="flex flex-wrap gap-2">
                {TWEAKS.map((item) => {
                  const active = tweak === item[lang];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTweak(active ? "" : item[lang])}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:border-primary/50 hover:bg-primary/5",
                      )}
                    >
                      {item[lang]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("design.aiRefs")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                {refs.map((src, index) => (
                  <div key={src.slice(-24) + index} className="relative">
                    <img src={src} alt="" className="size-16 rounded-lg border object-cover" />
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

          {variants.length > 0 ? (
            <section className="panel space-y-3 p-4">
              <h3 className="text-sm font-semibold">
                {lang === "ar" ? "الاقتراحات المولّدة" : "Generated directions"}
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {variants.map((variant, index) => {
                  const active = theme === variant;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setTheme(variant)}
                      className={cn(
                        "overflow-hidden rounded-xl border text-start transition-colors",
                        active ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40",
                      )}
                    >
                      <TemplateSwatch theme={variant} />
                      <span className="block px-2 py-1.5 text-[11px] font-medium">
                        {(lang === "ar" ? "اتجاه " : "Direction ") + (index + 1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-sm font-semibold">{t("design.preview")}</p>
          <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-background shadow-xl">
            <div
              className="relative max-h-[560px] overflow-y-auto pb-4"
              style={{
                ...themeVars(theme),
                ...pageBackground(theme),
                color: "var(--qs-text)",
                fontFamily: "var(--qs-body-font)",
              }}
            >
              <TextureLayer theme={theme} />
              <div className="relative z-10">
                <MenuHero
                  theme={theme}
                  compact
                  name={restaurant.data?.name ?? ""}
                  subtitle={lang === "ar" ? "طاولة ١" : "Table 1"}
                  logoUrl={restaurant.data?.logo_url ?? null}
                  coverUrl={restaurant.data?.cover_image_url ?? null}
                />

                <div className="px-3">
                  <div className="mt-3 mb-3 flex gap-1.5">
                    <span
                      className="px-2.5 py-1 text-[11px] font-medium"
                      style={buttonStyleFor(theme)}
                    >
                      {lang === "ar" ? "الكل" : "All"}
                    </span>
                    <span className="px-2.5 py-1 text-[11px]" style={buttonStyleFor(theme, false)}>
                      {lang === "ar" ? "الأطباق" : "Dishes"}
                    </span>
                  </div>

                  <div style={sectionFrameStyle(theme)}>
                    <SectionHeading
                      theme={theme}
                      compact
                      title={lang === "ar" ? "الأطباق الرئيسية" : "Main course"}
                    />
                    <div
                      className={cn(
                        "grid",
                        theme.layout === "grid" || theme.layout === "columns"
                          ? theme.columns === 2
                            ? "grid-cols-2"
                            : "grid-cols-1"
                          : "grid-cols-1",
                      )}
                      style={{ gap: densityGap(theme) }}
                    >
                      {previewItems.map((item, index) => (
                        <PreviewCard
                          key={item.id}
                          index={index}
                          theme={theme}
                          title={item.title}
                          description={item.description}
                          price={item.price}
                          image={item.image}
                          currency={restaurant.data?.currency ?? "JOD"}
                        />
                      ))}
                    </div>
                  </div>

                  <DecorBand theme={theme} className="mt-3" />

                  <div
                    className="mt-2 py-2.5 text-center text-xs font-semibold"
                    style={buttonStyleFor(theme)}
                  >
                    {lang === "ar" ? "إرسال الطلب" : "Send order"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Badge variant="outline">{TEMPLATES[theme.template].label[lang]}</Badge>
            <Badge variant="outline">{ANIMATION_LABELS[theme.animation][lang]}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tiny palette + type swatch used in the base and variation pickers. */
function TemplateSwatch({ theme }: { theme: MenuTheme }) {
  return (
    <span className="relative block h-16 w-full overflow-hidden" style={pageBackground(theme)}>
      <span
        className="absolute inset-x-2 top-2 block h-4 rounded-sm"
        style={{ background: theme.surface, opacity: 0.9 }}
      />
      <span
        className="absolute start-2 top-8 block h-2 w-12 rounded-full"
        style={{ background: theme.accent }}
      />
      <span
        className="absolute start-2 top-12 block h-1.5 w-20 rounded-full"
        style={{ background: theme.muted }}
      />
      <span
        className="absolute end-2 bottom-2 block size-5 rounded-full"
        style={{ background: theme.primary }}
      />
    </span>
  );
}

function PreviewCard({
  index,
  theme,
  title,
  description,
  price,
  image,
  currency,
}: {
  index: number;
  theme: MenuTheme;
  title: string;
  description: string;
  price: string;
  image: string | null;
  currency: string;
}) {
  const printed = theme.layout === "columns";
  const stacked = theme.layout === "grid" || theme.layout === "magazine";
  const motion = itemMotion(theme, index);
  return (
    <div
      className={cn(printed ? "py-1.5" : "p-2", stacked ? "" : "flex items-center gap-2", motion.className)}
      style={{ ...(printed ? {} : surfaceStyle(theme)), ...motion.style }}
    >
      {theme.showImages ? (
        image ? (
          <img
            src={image}
            alt=""
            className={cn(
              "object-cover",
              imageShapeClass(theme),
              stacked ? "mb-1.5 h-20 w-full" : printed ? "size-10 shrink-0" : "size-14 shrink-0",
            )}
          />
        ) : (
          <div
            className={cn(
              imageShapeClass(theme),
              stacked ? "mb-1.5 h-20 w-full" : printed ? "size-10 shrink-0" : "size-14 shrink-0",
            )}
            style={{ background: `${theme.accent}33` }}
          />
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1">
          <p
            className={cn(
              "min-w-0 truncate text-xs font-semibold",
              theme.upperTitles ? "tracking-wide uppercase" : "",
            )}
            style={{ fontFamily: "var(--qs-heading-font)" }}
          >
            {title}
          </p>
          {theme.priceStyle !== "inline" ? (
            <PriceLine
              theme={theme}
              price={`${currency} ${price}`}
              className={cn("shrink-0 text-[11px]", theme.priceStyle === "right" ? "ms-auto" : "")}
            />
          ) : null}
        </div>
        <p className="line-clamp-2 text-[10px]" style={{ color: "var(--qs-muted)" }}>
          {description}
        </p>
        {theme.priceStyle === "inline" ? (
          <p className="mt-0.5 text-[11px] font-bold" style={{ color: "var(--qs-accent)" }}>
            {currency} {price}
          </p>
        ) : null}
      </div>
    </div>
  );
}
