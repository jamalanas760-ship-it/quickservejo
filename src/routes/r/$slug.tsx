import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BellRing,
  Clock3,
  Languages,
  Minus,
  Moon,
  Plus,
  Search,
  ShoppingBag,
  Sun,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
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
import { themeVars, type MenuTheme } from "@/lib/menu-theme";
import { TAG_META, detectTags, type DietTag } from "@/lib/kitchen-tags";
import { isMenuThemeBridgeMessage, MENU_THEME_CHANNEL } from "@/lib/menu-theme-bridge";
import {
  callWaiter,
  loadDinerMenu,
  placePublicOrder,
  placeFulfillmentOrder,
  type CartLine,
  type DinerMenu,
  type DinerItem,
  type PlacedOrder,
} from "@/lib/diner";

const DIET_FILTERS: DietTag[] = ["vegetarian", "vegan", "spicy", "gluten", "nuts", "seafood"];
const searchSchema = z.object({
  t: z.string().optional(),
  preview: z.string().optional(),
  mode: z.string().optional(),
});

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
  const { t: qrToken, preview, mode } = Route.useSearch();
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
  const previewMode = preview === "1";
  const kioskMode = mode === "kiosk";
  const menu = useQuery({
    queryKey: ["diner", slug, qrToken ?? null],
    queryFn: () => loadDinerMenu(slug, qrToken ?? null),
    retry: false,
  });

  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [query, setQuery] = useState("");
  const [diets, setDiets] = useState<DietTag[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<DinerItem | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [appearanceOverride, setAppearanceOverride] = useState<"light" | "dark" | null>(null);

  const restaurant = menu.data?.restaurant;

  useEffect(() => {
    if (!kioskMode) return;
    let timer = 0;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setCart([]);
        setCartOpen(false);
        setDetail(null);
        setOrderNotes("");
        setGuestName("");
        setGuestPhone("");
        setGuestEmail("");
        setDeliveryAddress("");
        setScheduledFor("");
        setPlaced(null);
        setQuery("");
        setDiets([]);
        setActiveCategory("all");
      }, 90_000);
    };
    const events = ["pointerdown", "touchstart", "keydown"] as const;
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [kioskMode]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const queryKey = ["diner", slug, qrToken ?? null] as const;
    const applyTheme = (value: unknown) => {
      if (!isMenuThemeBridgeMessage(value) || value.restaurantId !== restaurant.id) return;
      queryClient.setQueryData(queryKey, (current: any) =>
        current
          ? {
              ...current,
              restaurant: { ...current.restaurant, menu_theme: value.theme },
            }
          : current,
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      applyTheme(event.data);
    };
    window.addEventListener("message", onMessage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(MENU_THEME_CHANNEL);
      channel.addEventListener("message", (event) => applyTheme(event.data));
    } catch {
      channel = null;
    }

    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, [queryClient, qrToken, restaurant?.id, slug]);

  const currency = restaurant?.currency ?? "JOD";
  const showPrices = menu.data?.settings?.show_prices ?? true;
  const onlineEnabled = Boolean(
    menu.data?.settings?.enable_pickup || menu.data?.settings?.enable_delivery || kioskMode,
  );
  const ordersEnabled =
    !previewMode &&
    (menu.data?.settings?.enable_orders ?? true) &&
    (Boolean(menu.data?.table) ||
      (kioskMode ? Boolean(menu.data?.settings?.enable_pickup) : onlineEnabled));
  const dineIn = Boolean(menu.data?.table);
  const effectiveFulfillment: "pickup" | "delivery" = kioskMode
    ? "pickup"
    : menu.data?.settings?.enable_pickup
      ? fulfillment
      : "delivery";

  const tagsByItem = useMemo(() => {
    const map = new Map<string, DietTag[]>();
    for (const item of menu.data?.items ?? []) {
      map.set(
        item.id,
        detectTags(item.name_en, item.name_ar, item.description_en, item.description_ar),
      );
    }
    return map;
  }, [menu.data?.items]);

  const availableDiets = useMemo(
    () => DIET_FILTERS.filter((tag) => [...tagsByItem.values()].some((tags) => tags.includes(tag))),
    [tagsByItem],
  );

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (menu.data?.items ?? []).filter((i) => {
      if (activeCategory !== "all" && i.category_id !== activeCategory) return false;
      if (needle) {
        const haystack = [i.name_en, i.name_ar, i.description_en, i.description_ar]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (diets.length > 0) {
        const tags = tagsByItem.get(i.id) ?? [];
        if (!diets.every((d) => tags.includes(d))) return false;
      }
      return true;
    });
  }, [menu.data?.items, activeCategory, query, diets, tagsByItem]);

  const filtering = query.trim().length > 0 || diets.length > 0;
  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const tax = (subtotal * (restaurant?.tax_rate ?? 0)) / 100;
  const service =
    dineIn && (menu.data?.settings?.enable_service_charge ?? true)
      ? (subtotal * (restaurant?.service_charge ?? 0)) / 100
      : 0;
  const deliveryFee =
    !dineIn && effectiveFulfillment === "delivery"
      ? Number(menu.data?.settings?.delivery_fee ?? 0)
      : 0;
  const total = subtotal + tax + service + deliveryFee;
  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  function addLine(item: DinerItem, modifierIds: string[], notes: string, quantity: number) {
    const modifiers = item.groups
      .flatMap((g) => g.modifiers)
      .filter((m) => modifierIds.includes(m.id));
    const unitPrice = item.price + modifiers.reduce((s, m) => s + m.price_delta, 0);
    const key = `${item.id}|${modifierIds.slice().sort().join(",")}|${notes}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing)
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
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
    if (previewMode) {
      toast.info(
        lang === "ar"
          ? "وضع المعاينة لا يرسل طلبات حقيقية."
          : "Preview mode never submits real orders.",
      );
      return;
    }
    if (!ordersEnabled) return;
    if (!dineIn && !kioskMode && !guestPhone.trim()) {
      toast.error(
        lang === "ar"
          ? "رقم الهاتف مطلوب لطلبات الاستلام والتوصيل."
          : "Phone number is required for pickup and delivery.",
      );
      return;
    }
    if (!dineIn && !kioskMode && effectiveFulfillment === "delivery" && !deliveryAddress.trim()) {
      toast.error(lang === "ar" ? "عنوان التوصيل مطلوب." : "Delivery address is required.");
      return;
    }
    setBusy(true);
    try {
      const guest = { name: guestName, phone: guestPhone, email: guestEmail };
      const result =
        dineIn && qrToken
          ? await placePublicOrder({ qrToken, lines: cart, notes: orderNotes, guest })
          : await placeFulfillmentOrder({
              restaurantSlug: slug,
              fulfillment: kioskMode ? "pickup" : effectiveFulfillment,
              lines: cart,
              notes: orderNotes,
              guest,
              ...(effectiveFulfillment === "delivery" ? { deliveryAddress } : {}),
              scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
            });
      setPlaced(result);
      setCart([]);
      setOrderNotes("");
      setDeliveryAddress("");
      setScheduledFor("");
      setCartOpen(false);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function ringWaiter() {
    if (previewMode) {
      toast.info(
        lang === "ar"
          ? "وضع المعاينة لا يرسل نداءات للنادل."
          : "Preview mode never sends real waiter calls.",
      );
      return;
    }
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

  if (menu.data.menuMode === "pdf") {
    return <Navigate to="/m/$slug" params={{ slug }} search={{ t: qrToken }} replace />;
  }

  const appearanceMode = appearanceOverride ?? menu.data.standardAppearance.mode;
  const theme =
    appearanceMode === "dark"
      ? menu.data.standardAppearance.dark
      : menu.data.standardAppearance.light;
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
      className="relative min-h-screen pb-28 transition-colors duration-300"
      data-standard-menu-theme={appearanceMode}
      style={{
        ...themeVars(theme),
        background: "var(--qs-bg)",
        color: "var(--qs-text)",
        fontFamily: "var(--qs-body-font)",
      }}
    >
      {previewMode ? (
        <div className="sticky top-0 z-50 border-b border-amber-300 bg-amber-100/95 px-4 py-2 text-center text-xs font-bold text-amber-900 backdrop-blur">
          {lang === "ar"
            ? "معاينة مباشرة — الطلبات ونداءات النادل معطلة"
            : "LIVE PREVIEW — ordering and waiter calls are disabled"}
        </div>
      ) : null}
      {kioskMode ? (
        <div className="sticky top-0 z-40 border-b border-orange-200 bg-white/95 px-4 py-2 text-center text-xs font-black uppercase tracking-[.16em] text-[#e85d2a] backdrop-blur">
          {lang === "ar" ? "وضع الطلب الذاتي" : "Self-order kiosk"}
        </div>
      ) : null}
      <StandardMenuStorefront
        menu={menu.data}
        theme={theme}
        appearanceMode={appearanceMode}
        previewMode={previewMode}
        onlineEnabled={onlineEnabled}
        ordersEnabled={ordersEnabled}
        query={query}
        diets={diets}
        availableDiets={availableDiets}
        activeCategory={activeCategory}
        items={items}
        sections={sections}
        filtering={filtering}
        showPrices={showPrices}
        currency={currency}
        onQueryChange={setQuery}
        onDietsChange={setDiets}
        onCategoryChange={setActiveCategory}
        onAppearanceChange={setAppearanceOverride}
        onItemOpen={setDetail}
      />

      {menu.data?.settings?.enable_waiter_calls && menu.data.table ? (
        <div className="mx-auto mt-6 max-w-3xl px-4">
          <Button
            variant="outline"
            className="w-full"
            disabled={previewMode}
            onClick={() => void ringWaiter()}
          >
            <BellRing className="size-4" /> {t("diner.callWaiter")}
          </Button>
        </div>
      ) : null}
      {ordersEnabled && cartCount > 0 ? (
        <div
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t p-3 backdrop-blur"
          style={{
            borderColor: "color-mix(in srgb, var(--qs-muted) 18%, transparent)",
            background: "color-mix(in srgb, var(--qs-surface) 94%, transparent)",
          }}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <Button
              className="flex-1"
              style={{ background: "var(--qs-primary)", color: "var(--qs-primary-text)" }}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag className="size-4" />
              {t("diner.viewCart")} ({cartCount}) · {formatMoney(total, currency, lang)}
            </Button>
          </div>
        </div>
      ) : null}

      <ItemSheet
        item={detail}
        theme={theme}
        currency={currency}
        showPrices={showPrices}
        canOrder={ordersEnabled}
        allowNotes={menu.data?.settings?.allow_special_notes ?? true}
        onClose={() => setDetail(null)}
        onAdd={addLine}
      />
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto"
          style={{ ...themeVars(theme), background: "var(--qs-surface)", color: "var(--qs-text)" }}
        >
          <SheetHeader>
            <SheetTitle style={{ color: "var(--qs-text)" }}>{t("diner.yourOrder")}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 p-4">
            {cart.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="mx-auto size-8" style={{ color: "var(--qs-muted)" }} />
                <p className="mt-3 font-semibold">{t("diner.emptyCart")}</p>
                <p className="mt-1 text-sm" style={{ color: "var(--qs-muted)" }}>
                  {t("diner.emptyCartHelp")}
                </p>
                <Button className="mt-4" variant="outline" onClick={() => setCartOpen(false)}>
                  {t("diner.browseMenu")}
                </Button>
              </div>
            ) : null}
            {cart.map((line) => (
              <div
                key={line.key}
                className="flex items-start gap-3 rounded-lg border p-3"
                style={{ borderColor: "color-mix(in srgb, var(--qs-muted) 20%, transparent)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{pick(line.name_en, line.name_ar)}</p>
                  {line.modifiers.length > 0 ? (
                    <p className="text-xs" style={{ color: "var(--qs-muted)" }}>
                      {line.modifiers.map((m) => pick(m.name_en, m.name_ar)).join(", ")}
                    </p>
                  ) : null}
                  {line.notes ? (
                    <p className="text-xs" style={{ color: "var(--qs-muted)" }}>
                      “{line.notes}”
                    </p>
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
            {!dineIn && !kioskMode ? (
              <div className="space-y-3 rounded-2xl border border-border p-3">
                <div>
                  <p className="text-xs font-bold">
                    {lang === "ar" ? "طريقة الاستلام" : "Fulfillment"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {lang === "ar"
                      ? "اختر الاستلام من المطعم أو التوصيل."
                      : "Choose pickup or delivery."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {menu.data?.settings?.enable_pickup ? (
                    <Button
                      type="button"
                      variant={effectiveFulfillment === "pickup" ? "default" : "outline"}
                      onClick={() => setFulfillment("pickup")}
                    >
                      {lang === "ar" ? "استلام" : "Pickup"}
                    </Button>
                  ) : null}
                  {menu.data?.settings?.enable_delivery ? (
                    <Button
                      type="button"
                      variant={effectiveFulfillment === "delivery" ? "default" : "outline"}
                      onClick={() => setFulfillment("delivery")}
                    >
                      {lang === "ar" ? "توصيل" : "Delivery"}
                    </Button>
                  ) : null}
                </div>
                {effectiveFulfillment === "delivery" ? (
                  <div className="space-y-1.5">
                    <Label>{lang === "ar" ? "عنوان التوصيل" : "Delivery address"}</Label>
                    <Textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      rows={2}
                      maxLength={500}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>{lang === "ar" ? "وقت مطلوب (اختياري)" : "Schedule for (optional)"}</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
            {menu.data?.settings?.collect_guest_details || (!dineIn && !kioskMode) ? (
              <div className="space-y-3 rounded-2xl border border-border p-3">
                <div>
                  <p className="text-xs font-bold">
                    {lang === "ar" ? "بيانات الضيف" : "Guest details"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {!dineIn
                      ? lang === "ar"
                        ? "الهاتف مطلوب للتواصل بخصوص الطلب."
                        : "Phone is required so the restaurant can contact you about the order."
                      : lang === "ar"
                        ? "اختياري، ويساعد المطعم في الولاء وسجل الزيارات."
                        : "Optional. Used for loyalty and visit history when enabled."}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={lang === "ar" ? "الاسم" : "Name"}
                    maxLength={120}
                  />
                  <Input
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder={lang === "ar" ? "الهاتف" : "Phone"}
                    maxLength={50}
                  />
                </div>
                <Input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder={lang === "ar" ? "البريد الإلكتروني (اختياري)" : "Email (optional)"}
                  maxLength={180}
                />
              </div>
            ) : null}
            {(menu.data?.settings?.allow_special_notes ?? true) ? (
              <div className="space-y-1.5">
                <Label>{t("diner.orderNotes")}</Label>
                <Textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  rows={2}
                />
              </div>
            ) : null}
            {cart.length > 0 ? (
              <>
                <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
                  <Row label={t("diner.subtotal")} value={formatMoney(subtotal, currency, lang)} />
                  {tax > 0 ? (
                    <Row label={t("diner.tax")} value={formatMoney(tax, currency, lang)} />
                  ) : null}
                  {service > 0 ? (
                    <Row label={t("diner.service")} value={formatMoney(service, currency, lang)} />
                  ) : null}
                  {deliveryFee > 0 ? (
                    <Row
                      label={lang === "ar" ? "التوصيل" : "Delivery"}
                      value={formatMoney(deliveryFee, currency, lang)}
                    />
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
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={placed !== null} onOpenChange={(o) => !o && setPlaced(null)}>
        <DialogContent
          style={{ ...themeVars(theme), background: "var(--qs-surface)", color: "var(--qs-text)" }}
        >
          <DialogHeader>
            <DialogTitle>{t("diner.confirmedTitle")}</DialogTitle>
            <DialogDescription style={{ color: "var(--qs-muted)" }}>
              {t("diner.confirmedBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg p-4 text-center" style={{ background: "var(--qs-bg)" }}>
            <p className="text-xs" style={{ color: "var(--qs-muted)" }}>
              {t("diner.orderNumber")}
            </p>
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

type StandardSection = { id: string; title: string; items: DinerItem[] };

function StandardMenuStorefront({
  menu,
  theme,
  appearanceMode,
  previewMode,
  onlineEnabled,
  ordersEnabled,
  query,
  diets,
  availableDiets,
  activeCategory,
  items,
  sections,
  filtering,
  showPrices,
  currency,
  onQueryChange,
  onDietsChange,
  onCategoryChange,
  onAppearanceChange,
  onItemOpen,
}: {
  menu: DinerMenu;
  theme: MenuTheme;
  appearanceMode: "light" | "dark";
  previewMode: boolean;
  onlineEnabled: boolean;
  ordersEnabled: boolean;
  query: string;
  diets: DietTag[];
  availableDiets: DietTag[];
  activeCategory: string;
  items: DinerItem[];
  sections: StandardSection[];
  filtering: boolean;
  showPrices: boolean;
  currency: string;
  onQueryChange: (value: string) => void;
  onDietsChange: React.Dispatch<React.SetStateAction<DietTag[]>>;
  onCategoryChange: (value: string) => void;
  onAppearanceChange: (value: "light" | "dark") => void;
  onItemOpen: (item: DinerItem) => void;
}) {
  const { t, lang, pick, toggleLang } = useI18n();
  const restaurant = menu.restaurant;
  const categories = menu.categories;

  return (
    <div className="relative z-10">
      <header className="mx-auto max-w-6xl px-3 pt-3 sm:px-5 sm:pt-5">
        <div
          className="overflow-hidden rounded-[22px] border shadow-[0_18px_60px_rgba(15,23,42,.10)]"
          style={{
            borderColor: "color-mix(in srgb, var(--qs-muted) 22%, transparent)",
            background: "var(--qs-surface)",
          }}
        >
          <div className="relative h-36 overflow-hidden sm:h-56">
            {restaurant.cover_image_url ? (
              <img src={restaurant.cover_image_url} alt="" className="size-full object-cover" />
            ) : (
              <div
                className="grid size-full place-items-center"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--qs-primary) 88%, #111827), color-mix(in srgb, var(--qs-accent) 68%, #111827))",
                }}
              >
                <UtensilsCrossed className="size-12 text-white/70" />
              </div>
            )}
            <div
              className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent"
              aria-hidden
            />
          </div>
          <div className="relative flex flex-col gap-4 px-4 pb-4 pt-5 sm:flex-row sm:items-center sm:px-6 sm:py-5">
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <span
                className="-mt-12 grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl border-4 shadow-lg sm:-mt-16 sm:size-24"
                style={{ borderColor: "var(--qs-surface)", background: "var(--qs-surface)" }}
              >
                {restaurant.logo_url ? (
                  <img src={restaurant.logo_url} alt="" className="size-full object-contain" />
                ) : (
                  <UtensilsCrossed className="size-8" style={{ color: "var(--qs-primary)" }} />
                )}
              </span>
              <div className="min-w-0">
                <h1
                  className="truncate text-xl font-black tracking-tight sm:text-2xl"
                  style={{ fontFamily: "var(--qs-heading-font)" }}
                >
                  {restaurant.name}
                </h1>
                <p
                  className="mt-1 line-clamp-2 text-xs sm:text-sm"
                  style={{ color: "var(--qs-muted)" }}
                >
                  {pick(restaurant.description_en, restaurant.description_ar) || t("brand.tagline")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <button
                type="button"
                onClick={toggleLang}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:-translate-y-0.5 sm:flex-none"
                style={{
                  borderColor: "color-mix(in srgb, var(--qs-muted) 24%, transparent)",
                  color: "var(--qs-text)",
                }}
              >
                <Languages className="size-4" />
                {t("common.language")}
              </button>
              <div
                className="grid min-h-11 grid-cols-2 rounded-xl border p-1"
                role="group"
                aria-label={lang === "ar" ? "مظهر القائمة" : "Menu appearance"}
                style={{
                  borderColor: "color-mix(in srgb, var(--qs-muted) 24%, transparent)",
                  background: "color-mix(in srgb, var(--qs-bg) 72%, var(--qs-surface))",
                }}
              >
                {(["light", "dark"] as const).map((option) => {
                  const selected = appearanceMode === option;
                  const Icon = option === "light" ? Sun : Moon;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-label={
                        option === "light"
                          ? lang === "ar"
                            ? "الوضع الفاتح"
                            : "Light mode"
                          : lang === "ar"
                            ? "الوضع الداكن"
                            : "Dark mode"
                      }
                      aria-pressed={selected}
                      onClick={() => onAppearanceChange(option)}
                      className="grid size-9 place-items-center rounded-lg transition"
                      style={
                        selected
                          ? {
                              background: "var(--qs-primary)",
                              color: "var(--qs-primary-text)",
                              boxShadow:
                                "0 4px 14px color-mix(in srgb, var(--qs-primary) 28%, transparent)",
                            }
                          : { color: "var(--qs-muted)" }
                      }
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex">
          <span
            className="inline-flex min-h-10 items-center rounded-full border px-4 text-[11px] font-black uppercase tracking-[.08em]"
            style={{
              borderColor: "color-mix(in srgb, var(--qs-primary) 32%, transparent)",
              background: "color-mix(in srgb, var(--qs-primary) 10%, var(--qs-surface))",
              color: "var(--qs-primary)",
            }}
          >
            {menu.table
              ? `${t("diner.table")} ${menu.table.table_name || menu.table.table_number}`
              : onlineEnabled
                ? lang === "ar"
                  ? "استلام أو توصيل"
                  : "Pickup or delivery"
                : t("diner.browseOnly")}
          </span>
        </div>
      </header>

      <div
        className={cn(
          "sticky z-30 mt-3 border-y backdrop-blur-xl",
          previewMode ? "top-[33px]" : "top-0",
        )}
        style={{
          borderColor: "color-mix(in srgb, var(--qs-muted) 16%, transparent)",
          background: "color-mix(in srgb, var(--qs-bg) 91%, transparent)",
        }}
      >
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute inset-y-0 start-4 my-auto size-4"
              style={{ color: "var(--qs-muted)" }}
            />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={lang === "ar" ? "ابحث عن طبق…" : "Search dishes…"}
              aria-label={t("diner.searchPlaceholder")}
              className="h-12 w-full rounded-2xl border px-11 text-sm font-medium outline-none transition focus:ring-2"
              style={{
                borderColor: "color-mix(in srgb, var(--qs-muted) 16%, transparent)",
                background: "var(--qs-surface)",
                color: "var(--qs-text)",
                boxShadow: "0 8px 28px rgba(15,23,42,.05)",
              }}
            />
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label={t("common.clear")}
                className="absolute inset-y-0 end-3 my-auto grid size-8 place-items-center rounded-full"
                style={{ color: "var(--qs-muted)" }}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {[{ id: "all", label: t("diner.all") }]
              .concat(
                categories.map((category) => ({
                  id: category.id,
                  label: pick(category.name_en, category.name_ar),
                })),
              )
              .map((chip) => {
                const active = activeCategory === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => onCategoryChange(chip.id)}
                    className="min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition hover:-translate-y-0.5 active:scale-95"
                    style={
                      active
                        ? {
                            borderColor: "var(--qs-primary)",
                            background: "var(--qs-primary)",
                            color: "var(--qs-primary-text)",
                            boxShadow:
                              "0 7px 18px color-mix(in srgb, var(--qs-primary) 24%, transparent)",
                          }
                        : {
                            borderColor: "color-mix(in srgb, var(--qs-muted) 20%, transparent)",
                            background: "var(--qs-surface)",
                            color: "var(--qs-text)",
                          }
                    }
                  >
                    {chip.label}
                  </button>
                );
              })}
          </div>
          {availableDiets.length > 0 ? (
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
              {availableDiets.map((tag) => {
                const active = diets.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onDietsChange((previous) =>
                        previous.includes(tag)
                          ? previous.filter((diet) => diet !== tag)
                          : [...previous, tag],
                      )
                    }
                    className="min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition"
                    style={
                      active
                        ? {
                            background:
                              "color-mix(in srgb, var(--qs-primary) 14%, var(--qs-surface))",
                            color: "var(--qs-primary)",
                          }
                        : { color: "var(--qs-muted)" }
                    }
                  >
                    {TAG_META[tag].icon} {lang === "ar" ? TAG_META[tag].ar : TAG_META[tag].en}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-3 sm:px-5">
        {items.length === 0 ? (
          <div
            className="my-8 rounded-3xl border p-10 text-center"
            style={{
              borderColor: "color-mix(in srgb, var(--qs-muted) 18%, transparent)",
              background: "var(--qs-surface)",
            }}
          >
            <Search className="mx-auto size-7" style={{ color: "var(--qs-muted)" }} />
            <p className="mt-3 text-sm font-bold">
              {filtering ? t("diner.noResults") : t("diner.emptyMenu")}
            </p>
            {filtering ? (
              <>
                <p className="mt-1 text-xs" style={{ color: "var(--qs-muted)" }}>
                  {t("diner.noResultsHelp")}
                </p>
                <button
                  type="button"
                  className="mt-4 min-h-10 rounded-full px-5 text-sm font-bold"
                  style={{ background: "var(--qs-primary)", color: "var(--qs-primary-text)" }}
                  onClick={() => {
                    onQueryChange("");
                    onDietsChange([]);
                  }}
                >
                  {t("diner.clearFilters")}
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-10 py-7 sm:py-9">
            {sections.map((section) => (
              <section key={section.id}>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2
                      className="text-2xl font-black tracking-tight sm:text-[28px]"
                      style={{ fontFamily: "var(--qs-heading-font)" }}
                    >
                      {section.title}
                    </h2>
                    <span
                      className="mt-2 block h-1 w-10 rounded-full"
                      style={{ background: "var(--qs-primary)" }}
                    />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--qs-muted)" }}>
                    {section.items.length}{" "}
                    {lang === "ar" ? "أصناف" : section.items.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <ul className="grid gap-3.5 lg:grid-cols-2">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <StandardProductCard
                        item={item}
                        theme={theme}
                        ordersEnabled={ordersEnabled}
                        showPrices={showPrices}
                        currency={currency}
                        onOpen={() => onItemOpen(item)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StandardProductCard({
  item,
  theme,
  ordersEnabled,
  showPrices,
  currency,
  onOpen,
}: {
  item: DinerItem;
  theme: MenuTheme;
  ordersEnabled: boolean;
  showPrices: boolean;
  currency: string;
  onOpen: () => void;
}) {
  const { t, lang, pick } = useI18n();
  const tags = detectTags(item.name_en, item.name_ar, item.description_en, item.description_ar);
  const description = pick(item.description_en, item.description_ar);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[142px] w-full overflow-hidden rounded-[20px] border text-start shadow-[0_8px_28px_rgba(15,23,42,.055)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_38px_rgba(15,23,42,.10)] active:scale-[.99] sm:min-h-[176px]"
      style={{
        borderColor: "color-mix(in srgb, var(--qs-muted) 18%, transparent)",
        background: "var(--qs-surface)",
      }}
    >
      {theme.showImages && item.image_url ? (
        <img
          src={item.image_url}
          alt=""
          className="w-[116px] shrink-0 object-cover sm:w-[184px]"
          loading="lazy"
        />
      ) : (
        <span
          className="grid w-[104px] shrink-0 place-items-center sm:w-[150px]"
          style={{
            background: "color-mix(in srgb, var(--qs-primary) 9%, var(--qs-bg))",
            color: "var(--qs-primary)",
          }}
        >
          <UtensilsCrossed className="size-7 opacity-70" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-5">
        <span className="flex items-start gap-2">
          <strong
            className="min-w-0 flex-1 text-[15px] font-black leading-5 sm:text-lg"
            style={{ fontFamily: "var(--qs-heading-font)" }}
          >
            {pick(item.name_en, item.name_ar)}
          </strong>
          {item.is_featured ? (
            <span
              className="shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide"
              style={{
                background: "color-mix(in srgb, var(--qs-accent) 16%, var(--qs-surface))",
                color: "var(--qs-accent)",
              }}
            >
              {t("diner.featured")}
            </span>
          ) : null}
        </span>
        {description ? (
          <span
            className="mt-1.5 line-clamp-2 text-[11px] leading-4 sm:text-xs sm:leading-5"
            style={{ color: "var(--qs-muted)" }}
          >
            {description}
          </span>
        ) : null}
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2 py-1 text-[9px] font-semibold"
              style={{
                background: "color-mix(in srgb, var(--qs-bg) 72%, var(--qs-surface))",
                color: "var(--qs-muted)",
              }}
            >
              {TAG_META[tag].icon} {lang === "ar" ? TAG_META[tag].ar : TAG_META[tag].en}
            </span>
          ))}
          {item.preparation_time > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-[9px] font-semibold"
              style={{ color: "var(--qs-muted)" }}
            >
              <Clock3 className="size-3" />
              {item.preparation_time} {lang === "ar" ? "د" : "min"}
            </span>
          ) : null}
        </span>
        <span className="mt-auto flex items-end justify-between gap-3 pt-2">
          <span>
            {showPrices ? (
              <>
                <strong
                  className="text-sm font-black sm:text-base"
                  style={{ color: "var(--qs-primary)" }}
                >
                  {formatMoney(item.price, currency, lang)}
                </strong>
                {item.compare_at_price && item.compare_at_price > item.price ? (
                  <span
                    className="ms-2 text-[10px] line-through"
                    style={{ color: "var(--qs-muted)" }}
                  >
                    {formatMoney(item.compare_at_price, currency, lang)}
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
          <span
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-black transition group-hover:scale-105"
            style={{ background: "var(--qs-primary)", color: "var(--qs-primary-text)" }}
          >
            {ordersEnabled ? (lang === "ar" ? "إضافة" : "Add") : lang === "ar" ? "عرض" : "View"}
            <Plus className="size-3.5" />
          </span>
        </span>
      </span>
    </button>
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
  theme,
  currency,
  showPrices,
  canOrder,
  allowNotes,
  onClose,
  onAdd,
}: {
  item: DinerItem | null;
  theme: MenuTheme;
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
    (g) =>
      g.is_required &&
      g.modifiers.filter((m) => selected.includes(m.id)).length < Math.max(1, g.min_selection),
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
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto"
        style={{ ...themeVars(theme), background: "var(--qs-surface)", color: "var(--qs-text)" }}
      >
        <SheetHeader>
          <SheetTitle style={{ color: "var(--qs-text)" }}>
            {item ? pick(item.name_en, item.name_ar) : ""}
          </SheetTitle>
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
                {group.is_required ? <span className="text-xs text-destructive">*</span> : null}
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
