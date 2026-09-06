import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BellRing, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PdfMenuViewer } from "@/components/menu/PdfMenuViewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { callWaiter, loadDinerMenu, placePublicOrder, type CartLine, type DinerItem, type PlacedOrder } from "@/lib/diner";

const searchSchema = z.object({ t: z.string().optional() });

export const Route = createFileRoute("/m/$slug")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Order from the menu — QuickServe" }, { name: "description", content: "View the restaurant's original PDF menu and tap products to order." }] }),
  component: PdfOrderPage,
});

function PdfOrderPage() {
  const { slug } = Route.useParams();
  const { t: qrToken } = Route.useSearch();
  const { lang, pick, toggleLang } = useI18n();
  const menu = useQuery({ queryKey: ["pdf-diner", slug, qrToken ?? null], queryFn: () => loadDinerMenu(slug, qrToken ?? null), retry: false });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [detail, setDetail] = useState<DinerItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [busy, setBusy] = useState(false);

  if (menu.isPending) return <div className="grid min-h-screen place-items-center"><p className="text-sm text-muted-foreground">Loading menu…</p></div>;
  if (menu.isError || !menu.data) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-bold">Menu unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{humanError(menu.error)}</p></div></div>;

  const { restaurant, pdfMenu } = menu.data;
  if (!pdfMenu) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="text-xl font-bold">PDF menu is not active</h1><p className="mt-2 text-sm text-muted-foreground">This QR is not currently connected to an uploaded PDF menu.</p><Button asChild className="mt-4"><Link to="/r/$slug" params={{ slug }}>Open regular menu</Link></Button></div></div>;

  const canOrder = Boolean(qrToken && menu.data.table && menu.data.settings?.enable_orders !== false);
  const currency = restaurant.currency;
  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const tax = subtotal * (restaurant.tax_rate / 100);
  const service = menu.data.settings?.enable_service_charge ? subtotal * (restaurant.service_charge / 100) : 0;
  const total = subtotal + tax + service;
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function addLine(item: DinerItem, modifierIds: string[], itemNotes: string, quantity: number) {
    const modifiers = item.groups.flatMap((group) => group.modifiers).filter((modifier) => modifierIds.includes(modifier.id));
    const unitPrice = item.price + modifiers.reduce((sum, modifier) => sum + modifier.price_delta, 0);
    const key = `${item.id}|${modifierIds.slice().sort().join(",")}|${itemNotes}`;
    setCart((previous) => {
      const existing = previous.find((line) => line.key === key);
      if (existing) return previous.map((line) => line.key === key ? { ...line, quantity: line.quantity + quantity } : line);
      return [...previous, { key, itemId: item.id, name_en: item.name_en, name_ar: item.name_ar, unitPrice, quantity, notes: itemNotes, modifiers }];
    });
    setDetail(null);
    toast.success(lang === "ar" ? "تمت الإضافة للسلة" : "Added to cart");
  }

  async function submitOrder() {
    if (!qrToken || !cart.length) return;
    setBusy(true);
    try {
      const result = await placePublicOrder({ qrToken, lines: cart, notes });
      setPlaced(result);
      setCart([]);
      setNotes("");
      setCartOpen(false);
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function ringWaiter() {
    if (!qrToken) return;
    try { await callWaiter(qrToken, ""); toast.success(lang === "ar" ? "تم استدعاء النادل" : "Waiter called"); } catch (error) { toast.error(humanError(error, lang)); }
  }

  return <div className="min-h-screen bg-background pb-24">
    <header className="sticky top-0 z-40 border-b bg-background/92 px-3 py-2.5 backdrop-blur-xl sm:px-5"><div className="mx-auto flex max-w-4xl items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{restaurant.name}</p><p className="truncate text-[11px] text-muted-foreground">{menu.data.table ? `${lang === "ar" ? "الطاولة" : "Table"} ${menu.data.table.table_name || menu.data.table.table_number}` : (lang === "ar" ? "عرض القائمة" : "Menu preview")}</p></div><Button size="sm" variant="ghost" onClick={toggleLang}>{lang === "ar" ? "EN" : "ع"}</Button>{canOrder && cartCount > 0 ? <Button size="sm" onClick={() => setCartOpen(true)}><ShoppingBag className="size-4"/> {cartCount}</Button> : null}</div></header>
    <main className="pt-2"><PdfMenuViewer url={pdfMenu.url} parts={pdfMenu.parts} pageCount={pdfMenu.pageCount} links={pdfMenu.links} items={menu.data.items} onSelect={(item) => canOrder && setDetail(item)} cartCount={cartCount} onCart={() => setCartOpen(true)} showCart={canOrder}/></main>
    {menu.data.settings?.enable_waiter_calls && menu.data.table ? <div className="mx-auto max-w-4xl px-4 pb-6"><Button variant="outline" className="w-full" onClick={() => void ringWaiter()}><BellRing className="size-4"/> {lang === "ar" ? "استدعاء النادل" : "Call waiter"}</Button></div> : null}
    {canOrder && cartCount > 0 ? <div className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 p-3 backdrop-blur"><div className="mx-auto max-w-4xl"><Button className="w-full" onClick={() => setCartOpen(true)}><ShoppingBag className="size-4"/> {lang === "ar" ? "عرض السلة" : "View cart"} ({cartCount}) · {formatMoney(total, currency, lang)}</Button></div></div> : null}
    <PdfItemSheet item={detail} currency={currency} canOrder={canOrder} allowNotes={menu.data.settings?.allow_special_notes ?? true} onClose={() => setDetail(null)} onAdd={addLine}/>
    <Sheet open={cartOpen} onOpenChange={setCartOpen}><SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto"><SheetHeader><SheetTitle>{lang === "ar" ? "طلبك" : "Your order"}</SheetTitle></SheetHeader><div className="space-y-3 p-4">{cart.map((line) => <div key={line.key} className="flex items-start gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><p className="font-semibold">{pick(line.name_en, line.name_ar)}</p>{line.modifiers.length ? <p className="text-xs text-muted-foreground">{line.modifiers.map((modifier) => pick(modifier.name_en, modifier.name_ar)).join(", ")}</p> : null}<p className="mt-1 text-sm font-semibold">{formatMoney(line.unitPrice * line.quantity, currency, lang)}</p></div><div className="flex items-center gap-1"><Button size="icon" variant="outline" onClick={() => setCart((previous) => previous.map((item) => item.key === line.key ? { ...item, quantity: item.quantity - 1 } : item).filter((item) => item.quantity > 0))}><Minus className="size-4"/></Button><span className="w-6 text-center text-sm">{line.quantity}</span><Button size="icon" variant="outline" onClick={() => setCart((previous) => previous.map((item) => item.key === line.key ? { ...item, quantity: item.quantity + 1 } : item))}><Plus className="size-4"/></Button><Button size="icon" variant="ghost" onClick={() => setCart((previous) => previous.filter((item) => item.key !== line.key))}><Trash2 className="size-4"/></Button></div></div>)}{menu.data.settings?.allow_special_notes ? <div className="space-y-1.5"><Label>{lang === "ar" ? "ملاحظات" : "Order notes"}</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2}/></div> : null}<div className="space-y-1 rounded-xl bg-muted p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal, currency, lang)}</span></div>{tax > 0 ? <div className="flex justify-between"><span>Tax</span><span>{formatMoney(tax, currency, lang)}</span></div> : null}{service > 0 ? <div className="flex justify-between"><span>Service</span><span>{formatMoney(service, currency, lang)}</span></div> : null}<div className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span>{formatMoney(total, currency, lang)}</span></div></div><Button className="w-full" disabled={busy || !cart.length || !canOrder} onClick={() => void submitOrder()}>{busy ? "Sending…" : (lang === "ar" ? "إرسال للمطبخ" : "Send to kitchen")}</Button></div></SheetContent></Sheet>
    <Dialog open={placed !== null} onOpenChange={(open) => !open && setPlaced(null)}><DialogContent><DialogHeader><DialogTitle>{lang === "ar" ? "تم إرسال الطلب" : "Order sent"}</DialogTitle><DialogDescription>{lang === "ar" ? "تم إرسال طلبك للمطبخ بنجاح." : "Your order has been sent to the kitchen successfully."}</DialogDescription></DialogHeader><div className="rounded-xl bg-muted p-4 text-center"><p className="text-xs text-muted-foreground">{lang === "ar" ? "رقم الطلب" : "Order number"}</p><p className="text-2xl font-bold">{placed?.order_number}</p><p className="mt-1 text-sm">{formatMoney(placed?.total ?? 0, placed?.currency ?? currency, lang)}</p></div><DialogFooter>{placed ? <Button asChild><Link to="/o/$token" params={{ token: placed.public_token }}>{lang === "ar" ? "تتبع الطلب" : "Track order"}</Link></Button> : null}<Button variant="outline" onClick={() => setPlaced(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function PdfItemSheet({ item, currency, canOrder, allowNotes, onClose, onAdd }: { item: DinerItem | null; currency: string; canOrder: boolean; allowNotes: boolean; onClose: () => void; onAdd: (item: DinerItem, modifierIds: string[], notes: string, quantity: number) => void }) {
  const { lang, pick } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const modifiers = item?.groups.flatMap((group) => group.modifiers) ?? [];
  const extra = modifiers.filter((modifier) => selected.includes(modifier.id)).reduce((sum, modifier) => sum + modifier.price_delta, 0);
  const missingRequired = (item?.groups ?? []).some((group) => group.is_required && group.modifiers.filter((modifier) => selected.includes(modifier.id)).length < Math.max(1, group.min_selection));
  return <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}><SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto"><SheetHeader><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><SheetTitle>{item ? pick(item.name_en, item.name_ar) : ""}</SheetTitle><p className="mt-1 text-sm text-muted-foreground">{item ? pick(item.description_en, item.description_ar) : ""}</p></div><Button size="icon" variant="ghost" onClick={onClose}><X className="size-4"/></Button></div></SheetHeader>{item ? <div className="space-y-5 p-4"><div className="text-lg font-bold">{formatMoney(item.price + extra, currency, lang)}</div>{modifiers.length ? <div className="space-y-3">{item.groups.map((group) => <div key={group.id} className="rounded-xl border p-3"><div className="font-semibold">{pick(group.name_en, group.name_ar)}</div><div className="mt-2 space-y-2">{group.modifiers.map((modifier) => <label key={modifier.id} className="flex items-center gap-3 text-sm"><input type={group.max_selection === 1 ? "radio" : "checkbox"} name={group.id} checked={selected.includes(modifier.id)} onChange={() => setSelected((previous) => group.max_selection === 1 ? [...previous.filter((id) => !group.modifiers.some((row) => row.id === id)), modifier.id] : previous.includes(modifier.id) ? previous.filter((id) => id !== modifier.id) : [...previous, modifier.id])}/><span className="flex-1">{pick(modifier.name_en, modifier.name_ar)}</span>{modifier.price_delta ? <span>{formatMoney(modifier.price_delta, currency, lang)}</span> : null}</label>)}</div></div>)}</div> : null}{allowNotes ? <div><Label>{lang === "ar" ? "ملاحظة" : "Special note"}</Label><Textarea className="mt-1.5" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2}/></div> : null}<div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => setQuantity((value) => Math.max(1, value - 1))}><Minus className="size-4"/></Button><span className="w-8 text-center font-semibold">{quantity}</span><Button size="icon" variant="outline" onClick={() => setQuantity((value) => value + 1)}><Plus className="size-4"/></Button></div><Button className="flex-1" disabled={!canOrder || missingRequired} onClick={() => onAdd(item, selected, notes, quantity)}>{lang === "ar" ? "أضف للسلة" : "Add to cart"}</Button></div></div> : null}</SheetContent></Sheet>;
}
