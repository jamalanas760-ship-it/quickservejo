import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Truck, Receipt, Plus, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Inventory = { id: string; name: string; unit: string; quantity: number; reorder_level: number };
type Supplier = { id: string; name: string; contact: string };
type Expense = { id: string; description: string; category: string; amount: number; expense_date: string; reference: string };
type Movement = { id: string; item_id: string; quantity: number; reason: string; created_at: string };
type FormKind = "item" | "supplier" | "expense" | "stock";
// Boundary for the additive ERP migration; existing generated application types remain intact.
const db = supabase as any;
const selectClass = "flex min-h-11 w-full rounded-xl border bg-background px-3 text-sm";

export function OperationsManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n(); const ar = lang === "ar";
  const access = useAccess();
  const allowed = access.isSuperAdmin || access.membershipFor(restaurantId)?.role === "restaurant_admin";
  const restaurant = useRestaurant(restaurantId);
  const qc = useQueryClient();
  const [form, setForm] = useState<FormKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const data = useQuery({ queryKey: ["operations", restaurantId], enabled: allowed, queryFn: async () => {
    const results = await Promise.all([
      db.from("erp_inventory_balances").select("*").eq("restaurant_id",restaurantId).order("name").limit(1000),
      db.from("erp_suppliers").select("id,name,contact").eq("restaurant_id",restaurantId).order("name").limit(1000),
      db.from("erp_expenses").select("id,description,category,amount,expense_date,reference").eq("restaurant_id",restaurantId).order("expense_date",{ascending:false}).limit(100),
      db.from("erp_stock_movements").select("id,item_id,quantity,reason,created_at").eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(100),
    ]);
    for (const result of results) if (result.error) throw result.error;
    return { inventory: results[0].data as Inventory[], suppliers: results[1].data as Supplier[], expenses: results[2].data as Expense[], movements: results[3].data as Movement[] };
  }});
  const titles = { item: ar ? "صنف مخزون جديد" : "New inventory item", supplier: ar ? "مورد جديد" : "New supplier", expense: ar ? "تسجيل مصروف" : "Record expense", stock: ar ? "حركة مخزون" : "Stock movement" };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form || busy) return;
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? "").trim();
    const number = (name: string) => { const value = Number(text(name)); if (!Number.isFinite(value)) throw new Error("Enter a valid number"); return value; };
    setBusy(true);
    try {
      let table: string, payload: Record<string, unknown>;
      if (form === "item") { table = "erp_inventory"; payload = { name: text("name"), unit: text("unit"), reorder_level: number("reorder") }; }
      else if (form === "supplier") { table = "erp_suppliers"; payload = { name: text("name"), contact: text("contact") }; }
      else if (form === "expense") { table = "erp_expenses"; payload = { description: text("description"), category: text("category"), amount: number("amount"), expense_date: text("date"), reference: text("reference") }; }
      else { table = "erp_stock_movements"; payload = { item_id: text("item"), supplier_id: text("supplier") || null, quantity: number("quantity") * (text("direction") === "out" ? -1 : 1), unit_cost: number("cost"), reason: text("reason") }; }
      const result = await db.from(table).insert({ ...payload, restaurant_id: restaurantId }).select("id").single();
      if (result.error) throw result.error;
      await qc.invalidateQueries({ queryKey: ["operations", restaurantId] });
      setForm(null); toast.success(ar ? "تم حفظ السجل" : "Record saved");
    } catch (error) { toast.error(humanError(error, lang)); } finally { setBusy(false); }
  }
  if (access.isPending) return <Skeleton className="h-80" />;
  if (!allowed) return <p>{ar ? "هذه الصفحة متاحة للمدير فقط." : "Only administrators can access this page."}</p>;
  if (data.isError) return <div role="alert" className="panel space-y-3 p-6"><p>{humanError(data.error,lang)}</p><Button variant="outline" onClick={() => data.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button></div>;
  const inventory = data.data?.inventory ?? [], suppliers = data.data?.suppliers ?? [], expenses = data.data?.expenses ?? [];
  const low = inventory.filter(item => Number(item.quantity) <= Number(item.reorder_level));
  const rows = inventory.filter(item => item.name.toLowerCase().includes(search.toLowerCase()));
  const currency = restaurant.data?.currency ?? "JOD";
  return <section className="space-y-6">
    <div><h2 className="text-2xl font-semibold tracking-tight">{ar ? "عمليات المطعم" : "Restaurant operations"}</h2><p className="mt-2 text-sm text-muted-foreground">{ar ? "المخزون والموردون والمصروفات في مساحة واحدة." : "Inventory, suppliers, and expenses in one workspace."}</p></div>
    <div className="grid gap-3 sm:grid-cols-3">{[[Package,ar?"أصناف المخزون":"Inventory items",inventory.length],[Truck,ar?"الموردون":"Suppliers",suppliers.length],[ArrowRightLeft,ar?"تحتاج إعادة طلب":"At reorder level",low.length]].map(([Icon,label,value],i) => { const MetricIcon = Icon as typeof Package; return <div className="panel flex items-center gap-4 p-5" key={i}><MetricIcon className="size-6 text-primary" /><div><p className="text-sm text-muted-foreground">{label as string}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.isPending ? "—" : value as number}</p></div></div>; })}</div>
    <Tabs defaultValue="inventory" dir={ar ? "rtl" : "ltr"}>
      <TabsList className="grid h-auto grid-cols-3"><TabsTrigger value="inventory" className="min-h-11">{ar?"المخزون":"Inventory"}</TabsTrigger><TabsTrigger value="suppliers" className="min-h-11">{ar?"الموردون":"Suppliers"}</TabsTrigger><TabsTrigger value="expenses" className="min-h-11">{ar?"المصروفات":"Expenses"}</TabsTrigger></TabsList>
      <TabsContent value="inventory" className="mt-5 space-y-4">
        <div className="flex flex-wrap gap-3"><Input className="min-w-40 flex-1" aria-label={ar?"بحث المخزون":"Search inventory"} placeholder={ar?"البحث عن صنف…":"Search inventory…"} value={search} onChange={e => setSearch(e.target.value)} /><Button variant="outline" onClick={() => setForm("stock")} disabled={!inventory.length}><ArrowRightLeft className="size-4" />{ar?"استلام / صرف":"Receive / issue"}</Button><Button onClick={() => setForm("item")}><Plus className="size-4" />{ar?"إضافة صنف":"Add item"}</Button></div>
        {data.isPending ? <Skeleton className="h-56" /> : !rows.length ? <Empty text={ar?"أضف أول صنف لبدء تتبع المخزون.":"Add your first item to start tracking stock."} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(item => <article className="panel p-5" key={item.id}><div className="flex justify-between gap-3"><h3 className="font-semibold">{item.name}</h3>{Number(item.quantity)<=Number(item.reorder_level) ? <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">{ar?"إعادة طلب":"Reorder"}</span>:null}</div><p className="mt-5 text-2xl font-semibold tabular-nums">{Number(item.quantity).toLocaleString(lang)} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span></p><p className="mt-1 text-xs text-muted-foreground">{ar?"حد إعادة الطلب":"Reorder at"}: {item.reorder_level} {item.unit}</p></article>)}</div>}
        <section className="panel p-5"><h3 className="mb-4 font-semibold">{ar?"آخر حركات المخزون (100)":"Latest stock movements (100)"}</h3>{!(data.data?.movements.length) ? <p className="text-sm text-muted-foreground">{ar?"لا توجد حركات بعد.":"No movements yet."}</p> : <ul className="divide-y">{data.data.movements.map(m => <li key={m.id} className="flex items-start justify-between gap-4 py-3 text-sm"><div><p className="font-medium">{inventory.find(i=>i.id===m.item_id)?.name ?? m.item_id}</p><p className="mt-1 text-muted-foreground">{m.reason}</p><time className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString(lang)}</time></div><span className="whitespace-nowrap font-semibold tabular-nums">{Number(m.quantity)>0?"+":""}{m.quantity}</span></li>)}</ul>}</section>
      </TabsContent>
      <TabsContent value="suppliers" className="mt-5 space-y-4"><Button onClick={() => setForm("supplier")}><Plus className="size-4" />{ar?"إضافة مورد":"Add supplier"}</Button>{!suppliers.length ? <Empty text={ar?"أضف الموردين لتربطهم باستلام المخزون.":"Add suppliers to link them to stock receipts."} /> : <div className="grid gap-3 sm:grid-cols-2">{suppliers.map(s=><article key={s.id} className="panel p-5"><h3 className="font-semibold">{s.name}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{s.contact || "—"}</p></article>)}</div>}</TabsContent>
      <TabsContent value="expenses" className="mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{ar?"آخر 100 مصروف مسجل بعملة المطعم.":"Latest 100 recorded expenses in the restaurant currency."}</p><Button onClick={() => setForm("expense")}><Receipt className="size-4" />{ar?"تسجيل مصروف":"Record expense"}</Button></div>{!expenses.length ? <Empty text={ar?"لا توجد مصروفات مسجلة بعد.":"No expenses recorded yet."} /> : <div className="panel divide-y px-5">{expenses.map(e=><article key={e.id} className="flex items-start justify-between gap-4 py-4"><div><h3 className="font-medium">{e.description}</h3><p className="mt-1 text-xs text-muted-foreground">{e.expense_date} · {e.category}{e.reference ? ` · ${e.reference}` : ""}</p></div><p className="whitespace-nowrap text-sm font-semibold">{formatMoney(Number(e.amount),currency,lang)}</p></article>)}</div>}</TabsContent>
    </Tabs>
    <Dialog open={form!==null} onOpenChange={open => { if (!open && !busy) setForm(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{form ? titles[form] : ""}</DialogTitle><DialogDescription>{ar?"تحقق من البيانات قبل الحفظ.":"Check the details before saving."}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        {form === "item" || form === "supplier" ? <label className="block space-y-2 text-sm"><span>{ar?"الاسم":"Name"}</span><Input name="name" required maxLength={160} /></label> : null}
        {form === "item" ? <><label className="block space-y-2 text-sm"><span>{ar?"الوحدة":"Unit"}</span><select name="unit" className={selectClass}>{['kg','g','l','ml','pcs','box'].map(u=><option key={u}>{u}</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar?"حد إعادة الطلب":"Reorder level"}</span><Input name="reorder" required type="number" min="0" step="0.001" defaultValue="0" /></label></> : null}
        {form === "supplier" ? <label className="block space-y-2 text-sm"><span>{ar?"بيانات التواصل":"Contact details"}</span><Input name="contact" maxLength={250} /></label> : null}
        {form === "stock" ? <><label className="block space-y-2 text-sm"><span>{ar?"الصنف":"Item"}</span><select name="item" className={selectClass} required>{inventory.map(i=><option value={i.id} key={i.id}>{i.name} ({i.unit})</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar?"نوع الحركة":"Movement"}</span><select name="direction" className={selectClass}><option value="in">{ar?"استلام / رصيد افتتاحي":"Receive / opening stock"}</option><option value="out">{ar?"صرف / هدر":"Issue / waste"}</option></select></label><label className="block space-y-2 text-sm"><span>{ar?"الكمية":"Quantity"}</span><Input required name="quantity" type="number" min="0.001" step="0.001" /></label><label className="block space-y-2 text-sm"><span>{ar?"المورد (اختياري)":"Supplier (optional)"}</span><select name="supplier" className={selectClass}><option value="">—</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar?"تكلفة الوحدة":"Unit cost"} ({currency})</span><Input name="cost" type="number" min="0" step="0.001" defaultValue="0" required /></label><label className="block space-y-2 text-sm"><span>{ar?"السبب / مرجع الفاتورة":"Reason / invoice reference"}</span><Input name="reason" required maxLength={250} /></label><p className="text-xs text-muted-foreground">{ar?"حركة المخزون لا تسجل مصروفاً تلقائياً.":"Stock movements do not automatically post an expense."}</p></> : null}
        {form === "expense" ? <><label className="block space-y-2 text-sm"><span>{ar?"الوصف":"Description"}</span><Input name="description" required maxLength={250} /></label><label className="block space-y-2 text-sm"><span>{ar?"التصنيف":"Category"}</span><select name="category" className={selectClass}>{[['supplies','Supplies','مستلزمات'],['rent','Rent','إيجار'],['utilities','Utilities','خدمات'],['maintenance','Maintenance','صيانة'],['other','Other','أخرى']].map(([v,en,a])=><option key={v} value={v}>{ar?a:en}</option>)}</select></label><label className="block space-y-2 text-sm"><span>{ar?"المبلغ":"Amount"} ({currency})</span><Input name="amount" type="number" min="0.001" step="0.001" required /></label><label className="block space-y-2 text-sm"><span>{ar?"التاريخ":"Date"}</span><Input name="date" type="date" defaultValue={new Date().toLocaleDateString('en-CA')} required /></label><label className="block space-y-2 text-sm"><span>{ar?"مرجع الفاتورة":"Invoice reference"}</span><Input name="reference" maxLength={100} /></label></> : null}
        <Button className="min-h-11 w-full" disabled={busy}>{busy ? (ar?"جارٍ الحفظ…":"Saving…") : (ar?"حفظ":"Save record")}</Button>
      </form>
    </DialogContent></Dialog>
  </section>;
}
function Empty({ text }: { text: string }) { return <div className="panel grid min-h-48 place-items-center p-6 text-center text-sm text-muted-foreground">{text}</div>; }
