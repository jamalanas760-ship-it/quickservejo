import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Clock3,
  FileText,
  Search,
  ShoppingBag,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformOrders, useOrderItems, useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markOrderViewed } from "@/lib/order-attention";
import { operationalCountersKey } from "@/hooks/useOperationalCounters";

const TABS = [
  { id: "all", en: "All", ar: "الكل", dot: "bg-slate-400" },
  { id: "new", en: "New", ar: "جديد", dot: "bg-blue-500" },
  { id: "preparing", en: "Preparing", ar: "تحضير", dot: "bg-[#ff5a0a]" },
  { id: "ready", en: "Ready", ar: "جاهز", dot: "bg-emerald-500" },
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

function elapsed(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  return `${minutes} min`;
}

export function OrdersManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const orders = usePlatformOrders({ restaurantId });
  const currency = restaurant?.currency ?? "JOD";
  const viewed = useMutation({
    mutationFn: (orderId: string) => markOrderViewed(orderId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: operationalCountersKey(restaurantId) });
    },
    onError: (error) => console.warn("Could not mark order as viewed:", error),
  });

  function selectOrder(orderId: string) {
    setSelectedId(orderId);
    viewed.mutate(orderId);
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      const normalized = order.status === "accepted" ? "new" : order.status;
      if (tab !== "all" && normalized !== tab) return false;
      if (!term) return true;
      return order.order_number.toLowerCase().includes(term)
        || (order.table?.table_number ?? "").toLowerCase().includes(term)
        || order.status.toLowerCase().includes(term);
    });
  }, [orders.data, search, tab]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((item) => [
    item.id,
    (orders.data ?? []).filter((order) => item.id === "all" || (order.status === "accepted" ? "new" : order.status) === item.id).length,
  ])), [orders.data]);

  const selected = rows.find((order) => order.id === selectedId) ?? rows[0] ?? null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="qs-page-title">{ar ? "الطلبات المباشرة" : "Live Orders"}</h1><p className="qs-page-subtitle">{ar ? "تابع وراقب جميع الطلبات في الوقت الفعلي." : "Track and monitor all orders in real-time."}</p></div>
        <span className="text-end text-[11px] text-muted-foreground"><span className="flex items-center justify-end gap-2 font-semibold text-foreground"><i className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.10)]" />{ar ? "تحديث مباشر" : "Live updates"}</span><span>{ar ? "تتحدث تلقائياً" : "Updates automatically"}</span></span>
      </header>

      <section className="qs-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5 lg:pb-0">
            {TABS.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className="qs-chip shrink-0" data-active={tab === item.id}>
                <i className={cn("size-2 rounded-full", item.dot)} />{ar ? item.ar : item.en}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{counts[item.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-[340px]">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? "رقم الطلب أو العميل أو الطاولة..." : "Search by order #, customer name or table..."} className="qs-control h-11 ps-10" />
          </div>
        </div>
      </section>

      {orders.isPending ? <Skeleton className="h-[620px] rounded-2xl" /> : rows.length === 0 ? (
        <div className="qs-card p-12 text-center"><ShoppingBag className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-semibold">{ar ? "لا توجد طلبات" : "No orders found"}</p></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(330px,.72fr)]">
          <section className="qs-card overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="qs-table min-w-[760px]">
                <thead><tr><th>{ar ? "رقم الطلب" : "Order #"}</th><th>{ar ? "الوقت" : "Time"}</th><th>{ar ? "العميل / الطاولة" : "Customer / Table"}</th><th>{ar ? "العناصر" : "Items"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "المدة" : "Elapsed"}</th><th /></tr></thead>
                <tbody>{rows.map((order) => { const active = selected?.id === order.id; return (
                  <tr key={order.id} onClick={() => selectOrder(order.id)} className={cn("cursor-pointer", active && "outline outline-1 -outline-offset-1 outline-[#ff5a0a] bg-orange-500/[.045]")}>
                    <td><strong className="tabular-nums">{order.order_number}</strong></td>
                    <td>{new Date(order.created_at).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td><strong className="block text-xs">{order.table?.table_number ? (ar ? "داخل المطعم" : "Dine In") : (ar ? "خارجي" : "Takeaway")}</strong><span className="text-[10px] text-muted-foreground">{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : "—"}</span></td>
                    <td className="text-muted-foreground">—</td>
                    <td><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted text-muted-foreground")}>{order.status}</span></td>
                    <td className="text-muted-foreground">{elapsed(order.created_at)}</td>
                    <td><ChevronRight className="size-4 text-muted-foreground" /></td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {rows.map((order) => { const active = selected?.id === order.id; return (
                <button key={order.id} type="button" onClick={() => selectOrder(order.id)} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 p-4 text-start", active && "bg-orange-500/[.055]")}>
                  <span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate">{order.order_number}</strong><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : (ar ? "طلب خارجي" : "Takeaway")} · {elapsed(order.created_at)}</span></span><ChevronRight className="mt-2 size-4 text-muted-foreground" />
                </button>
              ); })}
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
  const ar = lang === "ar";
  const items = useOrderItems(order.id);
  const subtotal = (items.data ?? []).reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);
  const total = Number(order.total ?? subtotal);
  const tax = Math.max(0, total - subtotal);

  return (
    <aside className="qs-right-panel self-start xl:sticky xl:top-24">
      <div className="qs-panel-header">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">{order.order_number}</h2><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(order.created_at, lang)}</p></div>
        <span className="text-end"><strong className="block text-sm">{elapsed(order.created_at)}</strong><span className="text-[10px] text-muted-foreground">{ar ? "المدة" : "Elapsed"}</span></span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <Meta icon={<UtensilsCrossed className="size-4" />} label={ar ? "نوع الطلب" : "Dine In"} value={order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : (ar ? "طلب خارجي" : "Takeaway")} />
        <Meta icon={<UserRound className="size-4" />} label={ar ? "العميل" : "Customer"} value={ar ? "ضيف" : "Walk-in Guest"} />
        <Meta icon={<FileText className="size-4" />} label={ar ? "العناصر" : "Items"} value={`${items.data?.length ?? 0} ${ar ? "عنصر" : "items"}`} />

        <div className="border-t border-border pt-4"><h3 className="text-sm font-bold">{ar ? "عناصر الطلب" : "Order Items"}</h3>
          {items.isPending ? <Skeleton className="mt-3 h-28 rounded-xl" /> : <div className="mt-2 divide-y divide-border">{(items.data ?? []).map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-[#ff5a0a] dark:bg-orange-950/30"><UtensilsCrossed className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{ar ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</p><p className="text-[10px] text-muted-foreground">{item.quantity} × {formatMoney(Number(item.unit_price ?? 0), currency, lang)}</p></div><strong className="text-sm">{formatMoney(item.total_price, currency, lang)}</strong></div>
          ))}</div>}
        </div>

        <div className="space-y-2 border-t border-border pt-4 text-sm"><div className="flex justify-between text-muted-foreground"><span>{ar ? "المجموع الفرعي" : "Subtotal"}</span><span>{formatMoney(subtotal, currency, lang)}</span></div><div className="flex justify-between text-muted-foreground"><span>{ar ? "الضريبة" : "Tax"}</span><span>{formatMoney(tax, currency, lang)}</span></div><div className="flex justify-between pt-2 text-lg font-bold"><span>{ar ? "الإجمالي" : "Total"}</span><span>{formatMoney(total, currency, lang)}</span></div></div>
      </div>
    </aside>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span><div><p className="text-sm font-bold">{label}</p><p className="text-xs text-muted-foreground">{value}</p></div></div>;
}
