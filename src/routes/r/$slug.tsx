import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BellRing, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buttonStyle as buttonStyleFor,
  densityGap,
  imageShapeClass,
  itemMotion,
  pageBackground,
  sectionFrameStyle,
  surfaceStyle,
  themeVars,
} from "@/lib/menu-theme";
import {
  DecorBand,
  MenuHero,
  PriceLine,
  SectionHeading,
  TextureLayer,
} from "@/components/menu/MenuChrome";
import {
  callWaiter,
  loadDinerMenu,
  placePublicOrder,
  type CartLine,
  type DinerItem,
  type PlacedOrder,
} from "@/lib/diner";

const searchSchema = z.object({ t: z.string().optional() });

export const Route = createFileRoute("/r/$slug")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Order from your table — QuickServe" },
      {
        name: "description",
        content:
          "Scan, browse the menu and send your order straight to the kitchen from your table.",
      },
      { property: "og:title", content: "Order from your table — QuickServe" },
      {
        property: "og:description",
        content: "Browse the menu, build your order and send it to the kitchen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DinerPage,
});

function DinerPage() {
  const { slug } = Route.useParams();
  const { t: qrToken } = Route.useSearch();
  const { t, lang, pick, toggleLang } = useI18n();

  const menu = useQuery({
    queryKey: ["diner", slug, qrToken ?? null],
    queryFn: () => loadDinerMenu(slug, qrToken ?? null),
    retry: false,
  });

  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<DinerItem | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [busy, setBusy] = useState(false);

  const restaurant = menu.data?.restaurant;
  const currency = restaurant?.currency ?? "JOD";
  const showPrices = menu.data?.settings?.show_prices ?? true;
  const ordersEnabled = (menu.data?.settings?.enable_orders ?? true) && Boolean(menu.data?.table);

  const items = useMemo(() => {
    const all = menu.data?.items ?? [];
    return activeCategory === "all" ? all : all.filter((i) => i.category_id === activeCategory);
  }, [menu.data?.items, activeCategory]);

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const tax = (subtotal * (restaurant?.tax_rate ?? 0)) / 100;
  const service =
    (menu.data?.settings?.enable_service_charge ?? true)
      ? (subtotal * (restaurant?.service_charge ?? 0)) / 100
      : 0;
  const total = subtotal + tax + service;
  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  function addLine(item: DinerItem, modifierIds: string[], notes: string, quantity: number) {
    const modifiers = item.groups
      .flatMap((g) => g.modifiers)
      .filter((m) => modifierIds.includes(m.id));
    const unitPrice = item.price + modifiers.reduce((s, m) => s + m.price_delta, 0);
    const key = `${item.id}|${modifierIds.slice().sort().join(",")}|${notes}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [
        ...prev,
        {
          key,
          itemId: item.id,
          name_en: item.name_en,
          name_ar: item.name_ar,
          unitPrice,
          quantity,
          notes,
          modifiers,
        },
      ];
    });
    toast.success(t("diner.added"));
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  async function submitOrder() {
    if (!qrToken) return;
    setBusy(true);
    try {
      const result = await placePublicOrder({ qrToken, lines: cart, notes: orderNotes });
      setPlaced(result);
      setCart([]);
      setOrderNotes("");
      setCartOpen(false);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function ringWaiter() {
    if (!qrToken) return;
    try {
      await callWaiter(qrToken, "");
      toast.success(t("diner.waiterCalled"));
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  if (menu.isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  if (menu.isError || !restaurant) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">{t("diner.notFound")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("diner.notFoundHelp")}</p>
        </div>
      </div>
    );
  }

  const theme = restaurant.menu_theme;
  const cardStyle = surfaceStyle(theme);
  const gap = densityGap(theme);
  const categories = menu.data?.categories ?? [];
  const sections =
    activeCategory === "all"
      ? [
          ...categories
            .map((c) => ({
              id: c.id,
              title: pick(c.name_en, c.name_ar),
              items: items.filter((i) => i.category_id === c.id),
            }))
            .filter((s) => s.items.length > 0),
          ...(items.some((i) => !i.category_id)
            ? [{ id: "other", title: t("diner.all"), items: items.filter((i) => !i.category_id) }]
            : []),
        ]
      : [
          {
            id: activeCategory,
            title:
              pick(
                categories.find((c) => c.id === activeCategory)?.name_en ?? "",
                categories.find((c) => c.id === activeCategory)?.name_ar ?? "",
              ) || t("diner.all"),
            items,
          },
        ];

  return (
    <div
      className="relative min-h-screen pb-28"
      style={{
        ...themeVars(theme),
        ...pageBackground(theme),
        color: "var(--qs-text)",
        fontFamily: "var(--qs-body-font)",
      }}
    >
      <TextureLayer theme={theme} />

      <div className="relative z-10">
        <header className="mx-auto max-w-3xl">
          <MenuHero
            theme={theme}
            name={restaurant.name}
            subtitle={
              pick(restaurant.description_en, restaurant.description_ar) || t("brand.tagline")
            }
            logoUrl={restaurant.logo_url}
            coverUrl={restaurant.cover_image_url}
            aside={
              <Button
                size="sm"
                variant="ghost"
                className="h-10 shrink-0 px-2"
                onClick={toggleLang}
                style={{ color: "var(--qs-muted)" }}
              >
                {t("common.language")}
              </Button>
            }
          />
          <div className="mt-3 px-4">
            <span
              className="inline-block px-2.5 py-1 text-[11px] font-medium"
              style={menu.data?.table ? buttonStyleFor(theme) : buttonStyleFor(theme, false)}
            >
              {menu.data?.table
                ? `${t("diner.table")} ${menu.data.table.table_name || menu.data.table.table_number}`
                : t("diner.browseOnly")}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4">
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
            {[{ id: "all", label: t("diner.all") } as const]
              .concat(
                categories.map((c) => ({
                  id: c.id,
                  label: pick(c.name_en, c.name_ar),
                })) as never,
              )
              .map((chip) => {
                const active = activeCategory === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setActiveCategory(chip.id)}
                    className="min-h-10 shrink-0 px-4 py-2 text-sm font-medium transition-transform active:scale-95"
                    style={buttonStyleFor(theme, active)}
                  >
                    {chip.label}
                  </button>
                );
              })}
          </div>

          {items.length === 0 ? (
            <div
              className="mt-4 p-8 text-center text-sm"
              style={{ ...cardStyle, color: "var(--qs-muted)" }}
            >
              {t("diner.emptyMenu")}
            </div>
          ) : (
            <div className="mt-5 space-y-6">
              {sections.map((section) => (
                <section key={section.id} style={sectionFrameStyle(theme)}>
                  <SectionHeading theme={theme} title={section.title} />
                  <ul
                    className={cn(
                      "grid",
                      theme.layout === "grid"
                        ? theme.columns === 2
                          ? "grid-cols-2 sm:grid-cols-3"
                          : "grid-cols-1 sm:grid-cols-3"
                        : theme.layout === "magazine"
                          ? "sm:grid-cols-2"
                          : theme.layout === "columns"
                            ? theme.columns === 2
                              ? "grid-cols-2 sm:grid-cols-2"
                              : "grid-cols-1 sm:grid-cols-2"
                            : "grid-cols-1",
                    )}
                    style={{ gap }}
                  >
                    {section.items.map((item, itemIndex) => {
                      const printed = theme.layout === "columns";
                      const stacked = theme.layout === "grid" || theme.layout === "magazine";
                      const motion = itemMotion(theme, itemIndex);
                      const showImage = theme.showImages && Boolean(item.image_url);
                      return (
                        <li key={item.id} className={motion.className} style={motion.style}>
                          <button
                            type="button"
                            className={cn(
                              "w-full text-start transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]",
                              printed ? "py-2" : "p-3",
                              stacked ? "block h-full" : "flex items-start gap-3",
                            )}
                            style={printed ? undefined : cardStyle}
                            onClick={() => setDetail(item)}
                          >
                            {showImage ? (
                              <img
                                src={item.image_url as string}
                                alt=""
                                className={cn(
                                  "shrink-0 object-cover",
                                  imageShapeClass(theme),
                                  stacked
                                    ? theme.layout === "magazine"
                                      ? "mb-2 h-40 w-full"
                                      : "mb-2 h-28 w-full"
                                    : printed
                                      ? "size-14"
                                      : "size-20",
                                )}
                                loading="lazy"
                              />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <p
                                  className={cn(
                                    "min-w-0 truncate font-semibold",
                                    theme.upperTitles ? "tracking-wide uppercase" : "",
                                  )}
                                  style={{ fontFamily: "var(--qs-heading-font)" }}
                                >
                                  {pick(item.name_en, item.name_ar)}
                                </p>
                                {item.is_featured ? (
                                  <span
                                    className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase"
                                    style={{
                                      background: "var(--qs-accent)",
                                      color: "var(--qs-primary-text)",
                                      borderRadius: "999px",
                                    }}
                                  >
                                    {t("diner.featured")}
                                  </span>
                                ) : null}
                                {showPrices && theme.priceStyle !== "inline" ? (
                                  <PriceLine
                                    theme={theme}
                                    price={formatMoney(item.price, currency, lang)}
                                    className={cn(
                                      "shrink-0 text-sm",
                                      theme.priceStyle === "right" ? "ms-auto" : "",
                                    )}
                                  />
                                ) : null}
                              </div>
                              <p
                                className="line-clamp-2 text-xs"
                                style={{ color: "var(--qs-muted)" }}
                              >
                                {pick(item.description_en, item.description_ar)}
                              </p>
                              {showPrices && theme.priceStyle === "inline" ? (
                                <p
                                  className="mt-1 text-sm font-semibold"
                                  style={{ color: "var(--qs-accent)" }}
                                >
                                  {formatMoney(item.price, currency, lang)}
                                </p>
                              ) : null}
                            </div>
                            {ordersEnabled && theme.showIcons ? (
                              <Plus className="size-5 shrink-0" style={{ color: "var(--qs-muted)" }} />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <DecorBand theme={theme} className="mt-6" />
        </div>
      </div>



      {menu.data?.settings?.enable_waiter_calls && menu.data.table ? (
        <div className="mx-auto mt-6 max-w-3xl px-4">
          <Button variant="outline" className="w-full" onClick={() => void ringWaiter()}>
            <BellRing className="size-4" /> {t("diner.callWaiter")}
          </Button>
        </div>
      ) : null}

      {ordersEnabled && cartCount > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <Button className="flex-1" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="size-4" />
              {t("diner.viewCart")} ({cartCount}) · {formatMoney(total, currency, lang)}
            </Button>
          </div>
        </div>
      ) : null}

      <ItemSheet
        item={detail}
        currency={currency}
        showPrices={showPrices}
        canOrder={ordersEnabled}
        allowNotes={menu.data?.settings?.allow_special_notes ?? true}
        onClose={() => setDetail(null)}
        onAdd={addLine}
      />

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("diner.yourOrder")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-4">
            {cart.map((line) => (
              <div key={line.key} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{pick(line.name_en, line.name_ar)}</p>
                  {line.modifiers.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {line.modifiers.map((m) => pick(m.name_en, m.name_ar)).join(", ")}
                    </p>
                  ) : null}
                  {line.notes ? (
                    <p className="text-xs text-muted-foreground">“{line.notes}”</p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold">
                    {formatMoney(line.unitPrice * line.quantity, currency, lang)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" onClick={() => changeQty(line.key, -1)}>
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center text-sm">{line.quantity}</span>
                  <Button size="icon" variant="outline" onClick={() => changeQty(line.key, 1)}>
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setCart((prev) => prev.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            {menu.data?.settings?.allow_special_notes ?? true ? (
              <div className="space-y-1.5">
                <Label>{t("diner.orderNotes")}</Label>
                <Textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                />
              </div>
            ) : null}

            <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <Row label={t("diner.subtotal")} value={formatMoney(subtotal, currency, lang)} />
              {tax > 0 ? (
                <Row label={t("diner.tax")} value={formatMoney(tax, currency, lang)} />
              ) : null}
              {service > 0 ? (
                <Row label={t("diner.service")} value={formatMoney(service, currency, lang)} />
              ) : null}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>{t("diner.total")}</span>
                <span>{formatMoney(total, currency, lang)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={busy || cart.length === 0}
              onClick={() => void submitOrder()}
            >
              {t("diner.sendToKitchen")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={placed !== null} onOpenChange={(o) => !o && setPlaced(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("diner.confirmedTitle")}</DialogTitle>
            <DialogDescription>{t("diner.confirmedBody")}</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-xs text-muted-foreground">{t("diner.orderNumber")}</p>
            <p className="text-2xl font-bold">{placed?.order_number}</p>
            <p className="mt-1 text-sm">
              {formatMoney(placed?.total ?? 0, placed?.currency ?? currency, lang)}
            </p>
          </div>
          <DialogFooter>
            {placed ? (
              <Button asChild>
                <Link to="/o/$token" params={{ token: placed.public_token }}>
                  {t("diner.trackOrder")}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setPlaced(null)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ItemSheet({
  item,
  currency,
  showPrices,
  canOrder,
  allowNotes,
  onClose,
  onAdd,
}: {
  item: DinerItem | null;
  currency: string;
  showPrices: boolean;
  canOrder: boolean;
  allowNotes: boolean;
  onClose: () => void;
  onAdd: (item: DinerItem, modifierIds: string[], notes: string, quantity: number) => void;
}) {
  const { t, lang, pick } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);

  const key = item?.id ?? "none";

  const modifiers = (item?.groups ?? []).flatMap((g) => g.modifiers);
  const extra = modifiers
    .filter((m) => selected.includes(m.id))
    .reduce((s, m) => s + m.price_delta, 0);

  function reset() {
    setSelected([]);
    setNotes("");
    setQuantity(1);
  }

  const missingRequired = (item?.groups ?? []).some(
    (g) => g.is_required && g.modifiers.filter((m) => selected.includes(m.id)).length < Math.max(1, g.min_selection),
  );

  return (
    <Sheet
      key={key}
      open={item !== null}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item ? pick(item.name_en, item.name_ar) : ""}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-4">
          {item?.image_url ? (
            <img src={item.image_url} alt="" className="h-44 w-full rounded-lg object-cover" />
          ) : null}
          <p className="text-sm text-muted-foreground">
            {item ? pick(item.description_en, item.description_ar) : ""}
          </p>

          {(item?.groups ?? []).map((group) => (
            <div key={group.id} className="space-y-2">
              <p className="text-sm font-medium">
                {pick(group.name_en, group.name_ar)}{" "}
                {group.is_required ? (
                  <span className="text-xs text-destructive">*</span>
                ) : null}
              </p>
              {group.modifiers.map((mod) => {
                const checked = selected.includes(mod.id);
                return (
                  <label key={mod.id} className="flex items-center gap-3 rounded-md border p-2">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          if (!v) return prev.filter((id) => id !== mod.id);
                          const inGroup = group.modifiers
                            .map((m) => m.id)
                            .filter((id) => prev.includes(id));
                          const max = Math.max(1, group.max_selection);
                          const next =
                            inGroup.length >= max
                              ? prev.filter((id) => !inGroup.slice(0, 1).includes(id))
                              : prev;
                          return [...next, mod.id];
                        })
                      }
                    />
                    <span className="flex-1 text-sm">{pick(mod.name_en, mod.name_ar)}</span>
                    {showPrices && mod.price_delta !== 0 ? (
                      <span className="text-xs text-muted-foreground">
                        +{formatMoney(mod.price_delta, currency, lang)}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ))}

          {canOrder && allowNotes ? (
            <div className="space-y-1.5">
              <Label>{t("diner.itemNotes")}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          ) : null}

          {canOrder ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-8 text-center">{quantity}</span>
                <Button size="icon" variant="outline" onClick={() => setQuantity((q) => q + 1)}>
                  <Plus className="size-4" />
                </Button>
              </div>
              <Button
                className="flex-1"
                disabled={!item || missingRequired}
                onClick={() => {
                  if (!item) return;
                  onAdd(item, selected, notes, quantity);
                  reset();
                  onClose();
                }}
              >
                {t("diner.addToCart")}
                {showPrices && item
                  ? ` · ${formatMoney((item.price + extra) * quantity, currency, lang)}`
                  : ""}
              </Button>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">{t("diner.scanToOrder")}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
