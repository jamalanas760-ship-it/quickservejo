import { useMemo, useState } from "react";
import {
  Check,
  CircleDot,
  Clock3,
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

const TABS = [
  { id: "all", en: "All", ar: "الكل" },
  { id: "new", en: "New", ar: "جديد" },
  { id: "preparing", en: "Preparing", ar: "تحضير" },
  { id: "ready", en: "Ready", ar: "جاهز" },
  { id: "served", en: "Served", ar: "مُقدَّم" },
  { id: "paid", en: "Paid", ar: "مدفوع" },
] as const;

const TRACKING = [
  { id: "new", en: "New", ar: "جديد" },
  { id: "preparing", en: "Preparing", ar: "تحضير" },
  { id: "ready", en: "Ready", ar: "جاهز" },
  { id: "served", en: "Served", ar: "مُقدَّم" },
  { id: "paid", en: "Paid", ar: "مدفوع" },
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

function trackingIndex(status: string) {
  if (status === "accepted") return 0;
  return TRACKING.findIndex((step) => step.id === status);
}

export function OrdersManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: restaurant } = useRestaurant(restaurantId);
  const orders = usePlatformOrders({ restaurantId });
  const currency = restaurant?.currency ?? "JOD";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      const normalized = order.status === "accepted" ? "new" : order.status;
      const statusOk = tab === "all" || normalized === tab;
      if (!statusOk) return false;
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
    <div className="space-y-4">
      <header>
        <h1 className="qs-page-title">{ar ? "تتبع الطلبات" : "Order Tracking"}</h1>
        <p className="qs-page-subtitle">{ar ? "عرض مباشر لحالة الطلبات فقط." : "A clear, read-only view of every order and its current stage."}</p>
      </header>

      <div className="qs-card p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={ar ? "رقم الطلب أو الطاولة" : "Search order or table"}
            className="qs-control h-11 ps-10"
          />
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="qs-chip shrink-0"
              data-active={tab === item.id}
            >
              {ar ? item.ar : item.en}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{counts[item.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {orders.isPending ? (
        <Skeleton className="h-[560px] rounded-2xl" />
      ) : rows.length === 0 ? (
        <div className="qs-card p-12 text-center">
          <ShoppingBag className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-semibold">{ar ? "لا توجد طلبات" : "No orders found"}</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.7fr)]">
          <section className="qs-card overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="qs-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>{ar ? "الطلب" : "Order"}</th>
                    <th>{ar ? "الطاولة" : "Table"}</th>
                    <th>{ar ? "الحالة" : "Status"}</th>
                    <th>{ar ? "الوقت" : "Time"}</th>
                    <th>{ar ? "المجموع" : "Total"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => {
                    const active = selected?.id === order.id;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedId(order.id)}
                        className={cn("cursor-pointer", active && "bg-orange-500/[.06]")}
                      >
                        <td><strong className="tabular-nums">{order.order_number}</strong></td>
                        <td>{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : (ar ? "خارجي" : "Takeaway")}</td>
                        <td><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted text-muted-foreground")}>{order.status}</span></td>
                        <td><span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5 text-[#ff5a0a]" />{new Date(order.created_at).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span></td>
                        <td className="font-bold tabular-nums">{formatMoney(order.total, currency, lang)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {rows.map((order) => {
                const active = selected?.id === order.id;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={cn("flex w-full items-center gap-3 p-4 text-start", active && "bg-orange-500/[.06]")}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><ShoppingBag className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><strong className="truncate">{order.order_number}</strong><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span></span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : (ar ? "طلب خارجي" : "Takeaway")} · {new Date(order.created_at).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <strong className="shrink-0 text-sm tabular-nums">{formatMoney(order.total, currency, lang)}</strong>
                  </button>
                );
              })}
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
  const current = trackingIndex(order.status);
  const cancelled = order.status === "cancelled";

  return (
    <aside className="qs-card self-start overflow-hidden xl:sticky xl:top-24">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-bold">{order.order_number}</h2>
              <span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(order.created_at, lang)}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[#ff5a0a]"><Clock3 className="size-4" />{new Date(order.created_at).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-muted"><UserRound className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : (ar ? "عميل" : "Guest")}</p>
            <p className="text-xs text-muted-foreground">{order.table?.table_number ? (ar ? "داخل المطعم" : "Dine-in") : (ar ? "طلب خارجي" : "Takeaway")} · {order.payment_status}</p>
          </div>
          <UtensilsCrossed className="size-4 text-[#ff5a0a]" />
        </div>

        <div className="mt-5 rounded-2xl border border-border bg-muted/25 p-3">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{ar ? "تتبع الحالة" : "Tracking"}</p>
          {cancelled ? (
            <div className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-600 dark:text-rose-400">{ar ? "تم إلغاء الطلب" : "Order cancelled"}</div>
          ) : (
            <div className="grid grid-cols-5 gap-1">
              {TRACKING.map((step, index) => {
                const complete = current >= index;
                const active = current === index;
                return (
                  <div key={step.id} className="qs-tracking-step text-center" data-complete={complete}>
                    <span className={cn(
                      "qs-tracking-node mx-auto grid size-8 place-items-center rounded-full border text-xs transition",
                      complete ? "border-[#ff5a0a] bg-[#ff5a0a] text-white" : "border-border bg-background text-muted-foreground",
                      active && "ring-4 ring-orange-500/10",
                    )}>
                      {complete && !active ? <Check className="size-3.5" /> : <CircleDot className="size-3.5" />}
                    </span>
                    <span className={cn("mt-2 block truncate text-[9px] font-semibold sm:text-[10px]", active ? "text-foreground" : "text-muted-foreground")}>{ar ? step.ar : step.en}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <h3 className="mt-5 text-sm font-bold">{ar ? "العناصر" : "Items"} ({items.data?.length ?? 0})</h3>
        {items.isPending ? (
          <Skeleton className="mt-3 h-28 rounded-xl" />
        ) : (
          <div className="mt-2 divide-y divide-border">
            {(items.data ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-xs font-bold text-[#ff5a0a]">×{item.quantity}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{ar ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</p></div>
                <span className="text-sm font-bold">{formatMoney(item.total_price, currency, lang)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">{ar ? "الإجمالي" : "Total"}</span>
          <strong className="text-lg tabular-nums">{formatMoney(order.total, currency, lang)}</strong>
        </div>
      </div>
    </aside>
  );
}