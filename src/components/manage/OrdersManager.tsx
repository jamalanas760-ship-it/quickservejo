import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Ellipsis,
  Filter,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformOrders, useOrderItems, useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", en: "All Orders", ar: "كل الطلبات", dot: "bg-slate-400" },
  { id: "new", en: "New", ar: "جديد", dot: "bg-blue-500" },
  { id: "preparing", en: "Preparing", ar: "قيد التحضير", dot: "bg-[#ff5a0a]" },
  { id: "ready", en: "Ready", ar: "جاهز", dot: "bg-emerald-500" },
  { id: "served", en: "Served", ar: "مُقدَّم", dot: "bg-violet-500" },
  { id: "paid", en: "Paid", ar: "مدفوع", dot: "bg-slate-500" },
] as const;

const statusClass: Record<string, string> = {
  new: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  accepted: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  preparing: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  ready: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  served: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  paid: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  cancelled: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
};

export function OrdersManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const { data: restaurant } = useRestaurant(restaurantId);
  const orders = usePlatformOrders({ restaurantId });
  const currency = restaurant?.currency ?? "JOD";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      const statusOk = tab === "all" ? true : order.status === tab;
      if (!statusOk) return false;
      return !term || order.order_number.toLowerCase().includes(term) || (order.table?.table_number ?? "").toLowerCase().includes(term);
    });
  }, [orders.data, search, tab]);

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((item) => [item.id, (orders.data ?? []).filter((order) => item.id === "all" || order.status === item.id).length])),
    [orders.data],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((order) => order.id === selectedId) ?? rows[0] ?? null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="qs-page-title">{lang === "ar" ? "الطلبات المباشرة" : "Live Orders"}</h1><p className="qs-page-subtitle">{lang === "ar" ? "إدارة وتنفيذ الطلبات في الوقت الفعلي." : "Manage and fulfill orders in real time."}</p></div>
        <button type="button" className="qs-button-primary"><span className="text-xl leading-none">+</span>{lang === "ar" ? "طلب جديد" : "New Order"}</button>
      </header>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("qs-chip min-h-12 flex-1 justify-center", tab === item.id && "border-[#ff5a0a] text-[#ff5a0a]")} data-active={tab === item.id}>
            <span className={cn("size-2 rounded-full", item.dot)} />{lang === "ar" ? item.ar : item.en}<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{counts[item.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="relative"><Search className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === "ar" ? "ابحث برقم الطلب أو الطاولة..." : "Search by order #, table, or item..."} className="qs-control h-12 ps-11" /></div>
        <button type="button" className="qs-control hidden min-w-44 items-center justify-between gap-3 px-4 text-xs font-semibold lg:flex"><span><span className="block text-[9px] text-muted-foreground">Order Type</span>All Types</span><ChevronDown className="size-4 text-muted-foreground" /></button>
        <button type="button" className="qs-control hidden min-w-36 items-center justify-between gap-3 px-4 text-xs font-semibold lg:flex"><span><span className="block text-[9px] text-muted-foreground">Time Range</span>Today</span><ChevronDown className="size-4 text-muted-foreground" /></button>
        <button type="button" className="qs-control hidden items-center gap-2 px-4 text-xs font-semibold lg:flex"><SlidersHorizontal className="size-4" />{lang === "ar" ? "فلاتر" : "More Filters"}</button>
      </div>

      {orders.isPending ? <Skeleton className="h-[620px] rounded-2xl" /> : rows.length === 0 ? <div className="qs-card p-14 text-center text-sm text-muted-foreground">{lang === "ar" ? "لا توجد طلبات." : "No orders found."}</div> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,.65fr)]">
          <section className="qs-card overflow-hidden">
            <div className="qs-scroll overflow-x-auto">
              <table className="qs-table min-w-[850px]">
                <thead><tr><th>#</th><th>{lang === "ar" ? "الطاولة" : "Customer / Table"}</th><th>{lang === "ar" ? "النوع" : "Type"}</th><th>{lang === "ar" ? "الحالة" : "Status"}</th><th>{lang === "ar" ? "الوقت" : "Time"}</th><th>{lang === "ar" ? "المجموع" : "Total"}</th><th>{lang === "ar" ? "إجراءات" : "Actions"}</th></tr></thead>
                <tbody>
                  {rows.map((order) => {
                    const active = selected?.id === order.id;
                    return <tr key={order.id} onClick={() => setSelectedId(order.id)} className={cn("cursor-pointer", active && "bg-orange-500/[.07]")}>
                      <td><div><p className="font-bold tabular-nums">{order.order_number}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(order.created_at, lang)}</p></div></td>
                      <td><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-muted"><UserRound className="size-4" /></span><div><p className="font-semibold">{order.table?.table_number ? `${lang === "ar" ? "طاولة" : "Table"} ${order.table.table_number}` : (lang === "ar" ? "طلب خارجي" : "Takeaway")}</p><p className="text-[10px] text-muted-foreground">{order.payment_status}</p></div></div></td>
                      <td><span className="flex items-center gap-1.5"><UtensilsCrossed className="size-4 text-[#ff5a0a]" />{order.table?.table_number ? (lang === "ar" ? "داخل المطعم" : "Dine-in") : (lang === "ar" ? "خارجي" : "Takeaway")}</span></td>
                      <td><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted text-muted-foreground")}>{order.status}</span></td>
                      <td><span className="flex items-center gap-1.5 font-semibold"><Clock3 className="size-4 text-[#ff5a0a]" />{new Date(order.created_at).toLocaleTimeString(lang === "ar" ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span></td>
                      <td className="font-bold tabular-nums">{formatMoney(order.total, currency, lang)}</td>
                      <td><button type="button" onClick={(event) => event.stopPropagation()} className="grid size-8 place-items-center rounded-lg border border-border hover:bg-muted"><Ellipsis className="size-4" /></button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selected ? <OrderDetail order={selected} currency={currency} /> : null}
        </div>
      )}
    </div>
  );
}

function OrderDetail({ order, currency }: { order: any; currency: string }) {
  const { lang } = useI18n();
  const items = useOrderItems(order.id);
  return (
    <aside className="qs-card self-start overflow-hidden xl:sticky xl:top-24">
      <div className="border-b border-border p-5">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="font-display text-xl font-bold">{order.order_number}</h2><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span></div><span className="flex items-center gap-1 text-sm font-bold text-[#ff5a0a]"><Clock3 className="size-4" />{new Date(order.created_at).toLocaleTimeString(lang === "ar" ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">{order.table?.table_number ? `${lang === "ar" ? "داخل المطعم · طاولة" : "Dine-in · Table"} ${order.table.table_number}` : (lang === "ar" ? "طلب خارجي" : "Takeaway")} · {formatDateTime(order.created_at, lang)}</p>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-3 border-b border-border pb-4"><span className="grid size-11 place-items-center rounded-full bg-muted"><UserRound className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-bold">{order.table?.table_number ? `${lang === "ar" ? "طاولة" : "Table"} ${order.table.table_number}` : (lang === "ar" ? "عميل" : "Guest")}</p><p className="text-xs text-muted-foreground">{order.payment_status}</p></div></div>

        <h3 className="mt-5 text-sm font-bold">{lang === "ar" ? "العناصر" : "Items"} ({items.data?.length ?? 0})</h3>
        {items.isPending ? <Skeleton className="mt-3 h-32 rounded-xl" /> : <div className="mt-2 divide-y divide-border">{(items.data ?? []).map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-50 font-bold text-[#ff5a0a]">×{item.quantity}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{lang === "ar" ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</p><p className="text-[10px] text-muted-foreground">{lang === "ar" ? "عنصر طلب" : "Order item"}</p></div><span className="text-sm font-bold">{formatMoney(item.total_price, currency, lang)}</span></div>)}</div>}

        <div className="mt-4 border-t border-border pt-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{lang === "ar" ? "الإجمالي" : "Total"}</span><strong className="text-lg">{formatMoney(order.total, currency, lang)}</strong></div></div>

        <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" className="qs-button-secondary"><Filter className="size-4" />{lang === "ar" ? "إعادة تعيين" : "Reassign"}</button><button type="button" className="qs-button-secondary"><Ellipsis className="size-4" />{lang === "ar" ? "المزيد" : "More Actions"}</button></div>
        <div className="mt-2 grid grid-cols-3 gap-2"><button type="button" className="rounded-xl bg-orange-500 px-2 py-3 text-xs font-bold text-white">{lang === "ar" ? "تحضير" : "Preparing"}</button><button type="button" className="rounded-xl bg-emerald-500 px-2 py-3 text-xs font-bold text-white"><Check className="me-1 inline size-4" />{lang === "ar" ? "جاهز" : "Ready"}</button><button type="button" className="rounded-xl bg-muted px-2 py-3 text-xs font-bold text-muted-foreground">{lang === "ar" ? "تم" : "Delivered"}</button></div>
      </div>
    </aside>
  );
}
