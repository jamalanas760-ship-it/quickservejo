import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadDinerMenu } from "@/lib/diner";
import { FONT_STACKS, parseMenuTheme, pageBackground, surfaceStyle, themeVars, type MenuTheme } from "@/lib/menu-theme";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/$slug")({
  head: () => ({ meta: [{ title: "QuickServe Menu Preview" }] }),
  component: PreviewPage,
});

type PreviewTheme = MenuTheme & { composition?: Record<string, unknown> };

function PreviewPage() {
  const { slug } = Route.useParams();
  const menu = useQuery({ queryKey: ["menu-studio-preview", slug], queryFn: () => loadDinerMenu(slug, null), retry: false });
  const [draftTheme, setDraftTheme] = useState<PreviewTheme | null>(null);

  useEffect(() => {
    const allowedOrigin = window.location.origin;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin || event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.type !== "QUICKSERVE_MENU_PREVIEW" || data.version !== 1) return;
      if (!data.theme || typeof data.theme !== "object") return;
      setDraftTheme(data.theme as PreviewTheme);
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "QUICKSERVE_MENU_PREVIEW_READY", version: 1 }, allowedOrigin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const restaurant = menu.data?.restaurant;
  const categories = menu.data?.categories ?? [];
  const items = menu.data?.items ?? [];
  const theme = useMemo(() => draftTheme ?? parseMenuTheme(restaurant?.menu_theme), [draftTheme, restaurant?.menu_theme]);

  if (menu.isPending) return <div className="mx-auto max-w-3xl space-y-4 p-5"><Skeleton className="h-44 rounded-[28px]" /><Skeleton className="h-24 rounded-[28px]" /><Skeleton className="h-24 rounded-[28px]" /></div>;
  if (menu.isError || !restaurant) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-bold">Preview unavailable</h1><p className="mt-2 text-sm text-muted-foreground">The restaurant menu could not be loaded.</p></div></div>;

  const card = surfaceStyle(theme);
  const categorySections = categories.map((category) => ({ id: category.id, title: category.name_en || category.name_ar, items: items.filter((item) => item.category_id === category.id) })).filter((section) => section.items.length > 0);
  if (items.some((item) => !item.category_id)) categorySections.push({ id: "other", title: "Menu", items: items.filter((item) => !item.category_id) });

  return (
    <main className="min-h-screen" style={{ ...themeVars(theme), ...pageBackground(theme), color: "var(--qs-text)", fontFamily: "var(--qs-body-font)" }}>
      <div className="mx-auto min-h-screen max-w-3xl px-4 pb-10 pt-5 sm:px-6">
        <header className="relative overflow-hidden p-2" style={{ borderRadius: Math.max(12, theme.radius) }}>
          {restaurant.cover_image_url && theme.showImages ? <div className="relative h-48 overflow-hidden rounded-[inherit] sm:h-64"><img src={restaurant.cover_image_url} alt="" className="size-full object-cover" /><div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${theme.bg}, transparent 70%)` }} /></div> : null}
          <div className={cn("relative px-2 pb-4", restaurant.cover_image_url && theme.showImages ? "-mt-12" : "")}>
            <div className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em]" style={{ background: theme.primary, color: theme.primaryText }}>QuickServe preview</div>
            <div className="mt-3 flex items-end gap-3">
              {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="size-14 rounded-2xl object-cover shadow-md" /> : null}
              <div><h1 className="text-4xl font-black leading-none tracking-[-.04em]" style={{ fontFamily: FONT_STACKS[theme.headingFont] }}>{restaurant.name}</h1><p className="mt-2 text-sm" style={{ color: theme.muted }}>{theme.tagline || restaurant.description_en || restaurant.description_ar || "Freshly prepared."}</p></div>
            </div>
          </div>
        </header>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1"><Badge className="rounded-full px-3 py-1" style={{ background: theme.primary, color: theme.primaryText }}>All</Badge>{categories.slice(0, 8).map((category) => <span key={category.id} className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: `${theme.text}18`, background: theme.surface }}>{category.name_en || category.name_ar}</span>)}</div>

        <div className="mt-6 space-y-8">{(categorySections.length ? categorySections : [{ id: "menu", title: "Menu", items }]).map((section) => (
          <section key={section.id}>
            <div className="mb-3 flex items-end justify-between gap-3"><h2 className="text-xl font-black" style={{ fontFamily: FONT_STACKS[theme.headingFont], textTransform: theme.upperTitles ? "uppercase" : "none" }}>{section.title}</h2><span className="h-px flex-1" style={{ background: `${theme.text}20` }} /></div>
            <div className={cn("grid gap-3", theme.columns === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
              {section.items.slice(0, 8).map((item) => <article key={item.id} className="overflow-hidden p-3 transition" style={card}>
                {theme.showImages && item.image_url ? <img src={item.image_url} alt="" className="mb-3 aspect-[16/9] w-full object-cover" style={{ borderRadius: theme.imageShape === "circle" ? 999 : theme.imageShape === "square" ? 0 : Math.max(10, theme.radius - 4) }} /> : null}
                <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="font-bold leading-tight">{item.name_en || item.name_ar}</h3>{item.description_en || item.description_ar ? <p className="mt-1 text-xs leading-5" style={{ color: theme.muted }}>{item.description_en || item.description_ar}</p> : null}</div><span className="shrink-0 font-black" style={{ color: theme.primary }}>{formatMoney(item.price, restaurant.currency, "en")}</span></div>
                <Button className="mt-3 h-9 rounded-xl text-xs" style={{ background: theme.primary, color: theme.primaryText }}>Add to order</Button>
              </article>)}
            </div>
          </section>
        ))}</div>
      </div>
    </main>
  );
}
