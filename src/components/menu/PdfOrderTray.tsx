import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Search, ShoppingCart, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { loadDinerMenu, placePublicOrder, type DinerItem } from "@/lib/diner";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

type Line = { itemId: string; name_en: string; name_ar: string; unitPrice: number; quantity: number };

/** Ordering clicker that sits on top of the original PDF menu, unchanged. */
export function PdfOrderTray({ slug, qrToken }: { slug: string; qrToken: string | null }) {
  const { lang, pick } = useI18n();
  const [open, setOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ order_number: string; total: number; currency: string } | null>(null);

  const menu = useQuery({
    queryKey: ["diner", slug, qrToken ?? null],
    queryFn: () => loadDinerMenu(slug, qrToken ?? null),
    retry: false,
  });

  const currency = menu.data?.restaurant.currency ?? "JOD";
  const canOrder = Boolean(qrToken && menu.data?.table && (menu.data?.settings?.enable_orders ?? true));

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = (menu.data?.items ?? []).filter((item) =>
      !needle || `${item.name_en} ${item.name_ar}`.toLowerCase().includes(needle),
    );
    const cats = menu.data?.categories ?? [];
    const grouped = cats
      .map((c) => ({ id: c.id, title: pick(c.name_en, c.name_ar), items: items.filter((i) => i.category_id === c.id) }))
      .filter((s) => s.items.length > 0);
    const loose = items.filter((i) => !i.category_id);
    if (loose.length > 0) grouped.push({ id: "other", title: lang === "ar" ? "أصناف أخرى" : "More items", items: loose });
    return grouped;
  }, [menu.data, query, pick, lang]);

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  function add(item: DinerItem) {
    setLines((prev) => {
      const found = prev.find((l) => l.itemId === item.id);
      if (found) return prev.map((l) => (l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { itemId: item.id, name_en: item.name_en, name_ar: item.name_ar, unitPrice: item.price, quantity: 1 }];
    });
  }

  function step(itemId: string, delta: number) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  async function submit() {
    if (!qrToken || lines.length === 0) return;
    setBusy(true);
    try {
      const order = await placePublicOrder({
        qrToken,
        lines: lines.map((l) => ({ key: l.itemId, itemId: l.itemId, name_en: l.name_en, name_ar: l.name_ar, unitPrice: l.unitPrice, quantity: l.quantity, notes: "", modifiers: [] })),
        notes: "",
      });
      setPlaced({ order_number: order.order_number, total: order.total, currency: order.currency });
      setLines([]);
      setCartOpen(false);
      setOpen(false);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  const itemCount = menu.data?.items.length ?? 0;
  if (menu.isPending || itemCount === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button className="h-12 flex-1" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> {lang === "ar" ? "اختر أصناف من القائمة" : "Select items from this menu"}
          </Button>
          {count > 0 ? (
            <Button variant="outline" className="h-12 shrink-0" onClick={() => setCartOpen(true)}>
              <ShoppingCart className="size-4" /> {count}
            </Button>
          ) : null}
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex h-[88vh] flex-col p-0">
          <SheetHeader className="border-b p-4 text-start">
            <SheetTitle>{lang === "ar" ? "أصناف القائمة" : "Menu items"}</SheetTitle>
            <SheetDescription>
              {canOrder
                ? lang === "ar" ? "اضغط + لإضافة الصنف إلى السلة" : "Tap + to add an item to your cart"
                : lang === "ar" ? "امسح رمز QR الخاص بطاولتك للطلب" : "Scan your table QR code to place an order"}
            </SheetDescription>
          </SheetHeader>
          <div className="border-b p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} className="ps-9" placeholder={lang === "ar" ? "ابحث عن صنف" : "Search items"} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24">
            {sections.map((section) => (
              <section key={section.id} className="mb-6">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const line = lines.find((l) => l.itemId === item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{pick(item.name_en, item.name_ar)}</p>
                          <p className="text-sm text-muted-foreground">{item.price.toFixed(2)} {currency}</p>
                        </div>
                        {line ? (
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="outline" className="size-9" onClick={() => step(item.id, -1)} aria-label="Remove one"><Minus className="size-4" /></Button>
                            <span className="w-6 text-center font-bold">{line.quantity}</span>
                            <Button size="icon" className="size-9" onClick={() => add(item)} aria-label="Add one"><Plus className="size-4" /></Button>
                          </div>
                        ) : (
                          <Button size="icon" className="size-10 rounded-full" onClick={() => add(item)} aria-label={`Add ${item.name_en}`}><Plus className="size-5" /></Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {count > 0 ? (
            <div className="border-t bg-background p-4">
              <Button className="h-12 w-full" onClick={() => setCartOpen(true)}>
                <ShoppingCart className="size-4" /> {lang === "ar" ? "السلة" : "View cart"} · {subtotal.toFixed(2)} {currency}
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-start">
            <SheetTitle>{lang === "ar" ? "سلتك" : "Your cart"}</SheetTitle>
            <SheetDescription>
              {menu.data?.table
                ? `${lang === "ar" ? "الطاولة" : "Table"} ${menu.data.table.table_name || menu.data.table.table_number}`
                : lang === "ar" ? "لم يتم تحديد طاولة" : "No table selected"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {lines.map((line) => (
              <div key={line.itemId} className="flex items-center gap-3 rounded-2xl border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{pick(line.name_en, line.name_ar)}</p>
                  <p className="text-sm text-muted-foreground">{(line.unitPrice * line.quantity).toFixed(2)} {currency}</p>
                </div>
                <Button size="icon" variant="outline" className="size-9" onClick={() => step(line.itemId, -1)} aria-label="Remove one"><Minus className="size-4" /></Button>
                <span className="w-6 text-center font-bold">{line.quantity}</span>
                <Button size="icon" className="size-9" onClick={() => step(line.itemId, 1)} aria-label="Add one"><Plus className="size-4" /></Button>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between text-lg font-bold">
            <span>{lang === "ar" ? "المجموع" : "Subtotal"}</span>
            <span>{subtotal.toFixed(2)} {currency}</span>
          </div>
          <Button className="mt-4 h-12 w-full" disabled={!canOrder || busy || lines.length === 0} onClick={() => void submit()}>
            {canOrder
              ? lang === "ar" ? "إرسال الطلب إلى المطبخ" : "Send order to the kitchen"
              : lang === "ar" ? "امسح رمز الطاولة للطلب" : "Scan a table QR to order"}
          </Button>
        </SheetContent>
      </Sheet>

      <Sheet open={placed !== null} onOpenChange={(o) => !o && setPlaced(null)}>
        <SheetContent side="bottom" className="text-center">
          <CheckCircle2 className="mx-auto mt-4 size-12 text-emerald-600" />
          <SheetHeader>
            <SheetTitle className="text-center">{lang === "ar" ? "تم إرسال طلبك إلى المطبخ" : "Your order is with the kitchen"}</SheetTitle>
            <SheetDescription className="text-center">
              {placed ? `${placed.order_number} · ${placed.total.toFixed(2)} ${placed.currency}` : ""}
            </SheetDescription>
          </SheetHeader>
          <Badge variant="secondary" className="mt-4 rounded-full">{lang === "ar" ? "سيتم تحضير طلبك قريباً" : "Preparation starts shortly"}</Badge>
          <Button className="mt-5 h-12 w-full" onClick={() => setPlaced(null)}>{lang === "ar" ? "تم" : "Done"}</Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
