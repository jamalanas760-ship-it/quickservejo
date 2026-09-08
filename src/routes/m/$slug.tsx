import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Languages, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PdfMenuViewer } from "@/components/menu/PdfMenuViewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import type { Language } from "@/lib/i18n";
import {
  loadDinerMenu,
  placePublicOrder,
  type CartLine,
  type DinerItem,
  type PlacedOrder,
} from "@/lib/diner";

const searchSchema = z.object({
  t: z.string().optional(),
});

export const Route = createFileRoute("/m/$slug")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Menu" },
      {
        name: "description",
        content: "Order directly from the restaurant menu.",
      },
    ],
  }),
  component: PdfOrderPage,
});

function PdfOrderPage() {
  const { slug } = Route.useParams();
  const { t: qrToken } = Route.useSearch();
  // The original PDF and item details never change direction or language.
  // Language selection belongs only to the cart and its confirmation.
  const [lang, setLang] = useState<Language>("en");
  const pick = (en: string | null, ar: string | null) => (lang === "ar" ? ar || en : en || ar);
  const submitting = useRef(false);

  const menu = useQuery({
    queryKey: ["pdf-diner", slug, qrToken ?? null],
    queryFn: () => loadDinerMenu(slug, qrToken ?? null),
    retry: 1,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [detail, setDetail] = useState<DinerItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [busy, setBusy] = useState(false);

  if (menu.isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-background" role="status">
        <Loader2 className="size-6 animate-spin" />
        <span className="sr-only">Loading menu</span>
      </div>
    );
  }

  if (menu.isError || !menu.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Menu unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{humanError(menu.error)}</p>
        </div>
      </div>
    );
  }

  const { restaurant, pdfMenu } = menu.data;

  if (!pdfMenu) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Menu unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This restaurant has no active PDF menu.
          </p>
          <Button asChild className="mt-4">
            <Link to="/r/$slug" params={{ slug }}>
              Open menu
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const canOrder =
    Boolean(qrToken && menu.data.table) && menu.data.settings?.enable_orders !== false;
  const currency = restaurant.currency;
  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const tax = Math.round(subtotal * restaurant.tax_rate) / 100;
  const service = menu.data.settings?.enable_service_charge
    ? Math.round(subtotal * restaurant.service_charge) / 100
    : 0;
  const total = subtotal + tax + service;
  const minimumOrder = menu.data.settings?.minimum_order ?? 0;
  const belowMinimum = subtotal < minimumOrder;
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addLine(item: DinerItem, modifierIds: string[], itemNotes: string, quantity: number) {
    const modifiers = item.groups
      .flatMap((group) => group.modifiers)
      .filter((modifier) => modifierIds.includes(modifier.id));
    const unitPrice =
      item.price + modifiers.reduce((sum, modifier) => sum + modifier.price_delta, 0);
    const key = `${item.id}|${modifierIds.slice().sort().join(",")}|${itemNotes}`;

    setCart((previous) => {
      const existing = previous.find((line) => line.key === key);
      if (existing) {
        return previous.map((line) =>
          line.key === key ? { ...line, quantity: Math.min(50, line.quantity + quantity) } : line,
        );
      }

      return [
        ...previous,
        {
          key,
          itemId: item.id,
          name_en: item.name_en,
          name_ar: item.name_ar,
          unitPrice,
          quantity,
          notes: itemNotes,
          modifiers,
        },
      ];
    });

    setDetail(null);
    toast.success("Added to cart");
  }

  async function submitOrder() {
    if (!qrToken || !cart.length || !canOrder || belowMinimum || submitting.current) return;

    submitting.current = true;

    setBusy(true);
    try {
      const result = await placePublicOrder({
        qrToken,
        lines: cart,
        notes,
      });
      setPlaced(result);
      setCart([]);
      setNotes("");
      setCartOpen(false);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div dir="ltr" lang="en" className="pdf-menu-page min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 h-16 border-b bg-background/95 px-4 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-4xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold">{restaurant.name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {menu.data.table
                ? `Table ${menu.data.table.table_number} · Tap a dish to order`
                : "Browse the menu"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            aria-label={lang === "en" ? "Use Arabic in cart" : "Use English in cart"}
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
          >
            <Languages className="size-4" />
            <span lang={lang === "en" ? "ar" : "en"}>{lang === "en" ? "العربية" : "English"}</span>
          </Button>
        </div>
      </header>

      <main>
        <PdfMenuViewer
          url={pdfMenu.url}
          parts={pdfMenu.parts}
          pageCount={pdfMenu.pageCount}
          links={pdfMenu.links}
          items={menu.data.items}
          onSelect={(item) => {
            if (canOrder) {
              setDetail(item);
            } else {
              toast.error("Scan the QR code on your table to order, or ask a member of staff.");
            }
          }}
        />
        {!canOrder ? (
          <p className="px-4 py-3 text-center text-sm text-muted-foreground">
            {menu.data.settings?.enable_orders === false
              ? "Ordering is currently unavailable."
              : "Scan the QR code on your table to place an order."}
          </p>
        ) : null}
      </main>

      {canOrder && cartCount > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-4xl">
            <Button
              className="h-14 w-full justify-between rounded-2xl px-4 text-base"
              onClick={() => setCartOpen(true)}
            >
              <span className="flex items-center gap-3">
                <ShoppingBag className="size-5" />
                <span>View cart</span>
                <span className="grid size-7 place-items-center rounded-full bg-primary-foreground/15 text-sm tabular-nums">
                  {cartCount}
                </span>
              </span>
              <Money amount={total} currency={currency} />
            </Button>
          </div>
        </div>
      ) : null}

      <PdfItemSheet
        key={detail?.id ?? "closed"}
        item={detail}
        currency={currency}
        canOrder={canOrder}
        allowNotes={menu.data.settings?.allow_special_notes ?? true}
        onClose={() => setDetail(null)}
        onAdd={addLine}
      />

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          dir={lang === "ar" ? "rtl" : "ltr"}
          lang={lang}
          closeLabel={lang === "ar" ? "إغلاق" : "Close"}
          className="pdf-order-surface safe-bottom mx-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl p-5"
        >
          <SheetHeader className="gap-1 pe-10 text-start sm:text-start">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-xl">{lang === "ar" ? "طلبك" : "Your order"}</SheetTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setLang(lang === "ar" ? "en" : "ar")}
                aria-label={lang === "ar" ? "Use English in cart" : "Use Arabic in cart"}
              >
                {lang === "ar" ? "English" : "العربية"}
              </Button>
            </div>
            <SheetDescription>
              {lang === "ar"
                ? "راجع الأصناف والكميات قبل إرسال الطلب."
                : "Review your items before sending your order."}
            </SheetDescription>
          </SheetHeader>
          <fieldset
            disabled={busy}
            className="mt-5 flex min-w-0 flex-col gap-4 disabled:opacity-70"
          >
            {!cart.length ? (
              <p className="py-6 text-center text-muted-foreground">
                {lang === "ar"
                  ? "سلتك فارغة. أضف طبقاً من القائمة."
                  : "Your cart is empty. Choose a dish from the menu."}
              </p>
            ) : null}
            {cart.map((line) => (
              <div
                key={line.key}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-relaxed">
                    {pick(line.name_en, line.name_ar)}
                  </p>
                  {line.modifiers.length ? (
                    <p className="text-xs text-muted-foreground">
                      {line.modifiers
                        .map((modifier) => pick(modifier.name_en, modifier.name_ar))
                        .join(", ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold">
                    <Money amount={line.unitPrice * line.quantity} currency={currency} />
                  </p>
                </div>
                <div dir="ltr" className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={lang === "ar" ? "تقليل الكمية" : "Decrease quantity"}
                    onClick={() =>
                      setCart((previous) =>
                        previous
                          .map((item) =>
                            item.key === line.key ? { ...item, quantity: item.quantity - 1 } : item,
                          )
                          .filter((item) => item.quantity > 0),
                      )
                    }
                  >
                    <Minus className="size-4" />
                  </Button>
                  <span className="w-6 text-center text-sm">{line.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={lang === "ar" ? "زيادة الكمية" : "Increase quantity"}
                    disabled={line.quantity >= 50}
                    onClick={() =>
                      setCart((previous) =>
                        previous.map((item) =>
                          item.key === line.key
                            ? { ...item, quantity: Math.min(50, item.quantity + 1) }
                            : item,
                        ),
                      )
                    }
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={lang === "ar" ? "حذف الصنف" : "Remove item"}
                    onClick={() =>
                      setCart((previous) => previous.filter((item) => item.key !== line.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="cart-notes">{lang === "ar" ? "ملاحظات الطلب" : "Order notes"}</Label>
              <Textarea
                id="cart-notes"
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder={lang === "ar" ? "مثال: بدون بصل" : "Example: no onions"}
              />
            </div>

            <div className="space-y-1 rounded-xl bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span>{lang === "ar" ? "المجموع الفرعي" : "Subtotal"}</span>
                <span>
                  <Money amount={subtotal} currency={currency} />
                </span>
              </div>
              {tax > 0 ? (
                <div className="flex justify-between">
                  <span>{lang === "ar" ? "الضريبة" : "Tax"}</span>
                  <span>
                    <Money amount={tax} currency={currency} />
                  </span>
                </div>
              ) : null}
              {service > 0 ? (
                <div className="flex justify-between">
                  <span>{lang === "ar" ? "الخدمة" : "Service"}</span>
                  <span>
                    <Money amount={service} currency={currency} />
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>{lang === "ar" ? "الإجمالي" : "Total"}</span>
                <span>
                  <Money amount={total} currency={currency} />
                </span>
              </div>
            </div>

            {belowMinimum && cart.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {lang === "ar" ? "الحد الأدنى للطلب: " : "Minimum order: "}
                <Money amount={minimumOrder} currency={currency} />
              </p>
            ) : null}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={busy || !cart.length || !canOrder || belowMinimum}
              onClick={() => void submitOrder()}
            >
              {busy
                ? lang === "ar"
                  ? "جارٍ إرسال الطلب…"
                  : "Sending…"
                : lang === "ar"
                  ? "إرسال الطلب"
                  : "Submit order"}
            </Button>
          </fieldset>
        </SheetContent>
      </Sheet>

      <Dialog open={placed !== null} onOpenChange={(open) => !open && setPlaced(null)}>
        <DialogContent
          className="pdf-order-surface"
          dir={lang === "ar" ? "rtl" : "ltr"}
          lang={lang}
        >
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "تم إرسال الطلب" : "Order sent"}</DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "تم إرسال طلبك للمطبخ بنجاح."
                : "Your order has been sent to the kitchen successfully."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-muted p-4 text-center">
            <p className="text-xs text-muted-foreground">
              {lang === "ar" ? "رقم الطلب" : "Order number"}
            </p>
            <p dir="ltr" className="text-2xl font-bold">
              {placed?.order_number}
            </p>
            <p className="mt-1 text-sm">
              <Money amount={placed?.total ?? 0} currency={placed?.currency ?? currency} />
            </p>
          </div>
          <DialogFooter>
            {placed ? (
              <Button asChild>
                <Link to="/o/$token" params={{ token: placed.public_token }}>
                  {lang === "ar" ? "تتبع الطلب" : "Track order"}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setPlaced(null)}>
              {lang === "ar" ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PdfItemSheet({
  item,
  currency,
  canOrder,
  allowNotes,
  onClose,
  onAdd,
}: {
  item: DinerItem | null;
  currency: string;
  canOrder: boolean;
  allowNotes: boolean;
  onClose: () => void;
  onAdd: (item: DinerItem, modifierIds: string[], notes: string, quantity: number) => void;
}) {
  const pick = (en: string | null, ar: string | null) => en || ar;
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);

  const modifiers = item?.groups.flatMap((group) => group.modifiers) ?? [];
  const extra = modifiers
    .filter((modifier) => selected.includes(modifier.id))
    .reduce((sum, modifier) => sum + modifier.price_delta, 0);
  const missingRequired = (item?.groups ?? []).some((group) => {
    const selectedCount = group.modifiers.filter((modifier) =>
      selected.includes(modifier.id),
    ).length;
    return (
      selectedCount < Math.max(group.is_required ? 1 : 0, group.min_selection) ||
      selectedCount > group.max_selection
    );
  });

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        dir="ltr"
        lang="en"
        className="pdf-order-surface safe-bottom mx-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl p-5"
      >
        <SheetHeader className="pe-10 text-start sm:text-start">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle>{item ? pick(item.name_en, item.name_ar) : ""}</SheetTitle>
              <SheetDescription className="mt-2 text-sm leading-relaxed">
                {item ? pick(item.description_en, item.description_ar) : ""}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {item ? (
          <div className="mt-5 flex flex-col gap-5">
            <div className="text-lg font-bold">
              <Money amount={item.price + extra} currency={currency} />
            </div>

            {modifiers.length ? (
              <div className="space-y-3">
                {item.groups.map((group) => (
                  <div key={group.id} className="rounded-xl border p-3">
                    <div className="font-semibold">{pick(group.name_en, group.name_ar)}</div>
                    <div className="mt-2 space-y-2">
                      {group.modifiers.map((modifier) => {
                        const checked = selected.includes(modifier.id);
                        const isSingle = group.max_selection === 1;
                        return (
                          <label key={modifier.id} className="flex items-center gap-3 text-sm">
                            <input
                              type={isSingle ? "radio" : "checkbox"}
                              name={group.id}
                              checked={checked}
                              disabled={
                                !checked &&
                                !isSingle &&
                                group.modifiers.filter((row) => selected.includes(row.id)).length >=
                                  group.max_selection
                              }
                              onChange={() =>
                                setSelected((previous) => {
                                  if (!isSingle) {
                                    return checked
                                      ? previous.filter((id) => id !== modifier.id)
                                      : [...previous, modifier.id];
                                  }

                                  return [
                                    ...previous.filter(
                                      (id) => !group.modifiers.some((row) => row.id === id),
                                    ),
                                    modifier.id,
                                  ];
                                })
                              }
                            />
                            <span className="flex-1">
                              {pick(modifier.name_en, modifier.name_ar)}
                            </span>
                            {modifier.price_delta ? (
                              <span>
                                <Money amount={modifier.price_delta} currency={currency} />
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {allowNotes ? (
              <div>
                <Label htmlFor="item-notes">Special note</Label>
                <Textarea
                  id="item-notes"
                  maxLength={1000}
                  className="mt-1.5"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-8 text-center font-semibold">{quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Increase quantity"
                  disabled={quantity >= 50}
                  onClick={() => setQuantity((value) => Math.min(50, value + 1))}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <Button
                className="h-11 flex-1 rounded-xl"
                disabled={!canOrder || missingRequired}
                onClick={() => onAdd(item, selected, notes, quantity)}
              >
                Add to cart
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Money({ amount, currency }: { amount: number; currency: string }) {
  return (
    <bdi dir="ltr" className="whitespace-nowrap tabular-nums">
      {formatMoney(amount, currency, "en")}
    </bdi>
  );
}
