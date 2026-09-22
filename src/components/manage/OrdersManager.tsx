import { useMemo, useState, useSyncExternalStore } from "react";
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
import { MasterPageHeader } from "@/components/app/MasterPage";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  { id: "preparing", en: "Preparing", ar: "تحضير", dot: "bg-[#e85d2a]" },
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
const DESKTOP_ORDER_MEDIA = "(min-width: 1280px)";

function elapsed(createdAt: string, ar: boolean) {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return ar ? `${minutes} د` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ar ? `${hours} س ${minutes % 60} د` : `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return ar ? `${days} ي ${hours % 24} س` : `${days}d ${hours % 24}h`;
}

function subscribeDesktopOrderLayout(notify: () => void) {
  const media = window.matchMedia(DESKTOP_ORDER_MEDIA);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
function getDesktopOrderLayout() {
  return window.matchMedia(DESKTOP_ORDER_MEDIA).matches;
}
function useDesktopOrderLayout() {
  return useSyncExternalStore(subscribeDesktopOrderLayout, getDesktopOrderLayout, () => false);
}

export function OrdersManager({ restaurantId }: { restaurantId: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const desktopOrderLayout = useDesktopOrderLayout();
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

  const selected = rows.find((order) => order.id === selectedId) ?? (desktopOrderLayout ? rows[0] : null) ?? null;

  return (
    <div className="qs-viewport-fill flex h-full min-h-0 flex-col gap-4">
      <MasterPageHeader
        title={ar ? "الطلبات المباشرة" : "Live Orders"}
        description={ar ? "تابع وراقب جميع الطلبات في الوقت الفعلي." : "Track and monitor all orders in real-time."}
        actions={<span className="qs-live-badge">{ar ? "تحديث مباشر" : "Live updates"}</span>}
      />

      <section className="qs-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5 lg:pb-0">
            {TABS.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={cn("qs-chip shrink-0", tab === item.id && "border-foreground bg-foreground text-background")}>
                <i className={cn("size-2 rounded-full", item.dot)} />{ar ? item.ar : item.en}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{counts[item.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="qs-search-field w-full lg:max-w-[360px]">
            <Search />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? "رقم الطلب أو العميل أو الطاولة..." : "Search by order #, customer name or table..."} className="qs-control qs-search-input h-10" />
          </div>
        </div>
      </section>

      {orders.isPending ? <Skeleton className="h-[620px] rounded-2xl" /> : rows.length === 0 ? (
        <div className="qs-card p-12 text-center"><ShoppingBag className="mx-auto size-8 text-muted-foreground/60" /><p className="mt-3 text-sm font-semibold">{ar ? "لا توجد طلبات" : "No orders found"}</p></div>
      ) : (
        <div className="qs-viewport-fill grid min-h-0 gap-2 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.72fr)]">
          <section className="qs-card flex min-h-0 flex-col overflow-hidden">
            <div className="qs-scroll-region hidden min-h-0 flex-1 overflow-x-hidden md:block">
              <table className="qs-table w-full table-fixed"><colgroup><col className="w-[18%]"/><col className="w-[12%]"/><col className="w-[24%]"/><col className="w-[9%]"/><col className="w-[14%]"/><col className="w-[17%]"/><col className="w-[6%]"/></colgroup>
                <thead><tr><th>{ar ? "رقم الطلب" : "Order #"}</th><th>{ar ? "الوقت" : "Time"}</th><th>{ar ? "العميل / الطاولة" : "Customer / Table"}</th><th>{ar ? "العناصر" : "Items"}</th><th>{ar ? "الحالة" : "Status"}</th><th>{ar ? "المدة" : "Elapsed"}</th><th /></tr></thead>
                <tbody>{rows.map((order) => { const active = selected?.id === order.id; return (
                  <tr key={order.id} onClick={() => selectOrder(order.id)} className={cn("cursor-pointer", active && "outline outline-1 -outline-offset-1 outline-[#e85d2a] bg-orange-500/[.045]")}>
                    <td><strong className="tabular-nums">{order.order_number}</strong></td>
                    <td>{new Date(order.created_at).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td><strong className="block text-xs">{order.table?.table_number ? (ar ? "داخل المطعم" : "Dine In") : (ar ? "خارجي" : "Takeaway")}</strong><span className="text-[10px] text-muted-foreground">{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : "—"}</span></td>
                    <td className="text-muted-foreground">—</td>
                    <td><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted text-muted-foreground")}>{order.status}</span></td>
                    <td className="text-muted-foreground">{elapsed(order.created_at, ar)}</td>
                    <td><ChevronRight className="size-4 text-muted-foreground" /></td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>

            <div className="grid gap-2 bg-muted/20 p-2 md:hidden">
              {rows.map((order) => { const active = selected?.id === order.id; return (
                <button key={order.id} type="button" onClick={() => selectOrder(order.id)} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-start shadow-sm transition hover:border-primary/25", active && "border-primary/30 bg-orange-500/[.055]")}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2"><strong className="truncate text-sm">{order.order_number}</strong><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span></span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span>{order.table?.table_number ? `${ar ? "طاولة" : "Table"} ${order.table.table_number}` : (ar ? "طلب خارجي" : "Takeaway")}</span><span aria-hidden="true">•</span><span>{new Date(order.created_at).toLocaleTimeString(ar ? "ar-JO" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span><span aria-hidden="true">•</span><strong className="font-semibold text-foreground">{elapsed(order.created_at, ar)}</strong></span>
                  </span><ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ); })}
            </div>
          </section>
          {desktopOrderLayout && selected ? <OrderDetail order={selected} currency={currency} /> : null}
        </div>
      )}

      <Dialog open={!desktopOrderLayout && Boolean(selectedId)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-h-[calc(100dvh-16px)] max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only"><DialogTitle>{ar ? "تفاصيل الطلب" : "Order details"}</DialogTitle><DialogDescription>{ar ? "تفاصيل الطلب المحدد" : "Details for the selected order"}</DialogDescription></DialogHeader>
          {selected ? <OrderDetail order={selected} currency={currency} /> : null}
        </DialogContent>
      </Dialog>
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
    <aside className="qs-right-panel flex max-h-[calc(100dvh-24px)] min-h-0 flex-col overflow-hidden xl:max-h-none">
      <div className="qs-panel-header flex shrink-0 items-start justify-between gap-4 p-4 pe-12 xl:pe-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">{ar ? "تفاصيل الطلب" : "Order details"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2"><h2 className="break-all font-display text-lg font-bold">{order.order_number}</h2><span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>{order.status}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(order.created_at, lang)}</p>
        </div>
        <span className="shrink-0 rounded-xl bg-muted px-3 py-2 text-end">
          <strong className="block whitespace-nowrap text-sm">{elapsed(order.created_at, ar)}</strong>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{ar ? "المدة" : "Elapsed"}</span>
        </span>
      </div>

      <div className="qs-scroll-region min-h-0 flex-1 space-y-3 p-3 sm:p-4">
        <section className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card rtl:divide-x-reverse">
          <Meta icon={<UtensilsCrossed className="size-3.5" />} label={ar ? "الخدمة" : "Service"} value={order.table?.table_number ? ((ar ? "طاولة " : "Table ") + order.table.table_number) : (ar ? "طلب خارجي" : "Takeaway")} />
          <Meta icon={<UserRound className="size-3.5" />} label={ar ? "العميل" : "Customer"} value={ar ? "ضيف" : "Walk-in Guest"} />
          <Meta icon={<FileText className="size-3.5" />} label={ar ? "العناصر" : "Items"} value={String(items.data?.length ?? 0) + " " + (ar ? "عنصر" : "items")} />
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2"><h3 className="text-xs font-bold">{ar ? "عناصر الطلب" : "Order Items"}</h3></div>
          {items.isPending ? <Skeleton className="m-3 h-28 rounded-xl" /> : <div className="divide-y divide-border">{(items.data ?? []).map((item) => (
            <div key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-orange-50 text-[#e85d2a] dark:bg-orange-950/30"><UtensilsCrossed className="size-3.5" /></span>
              <div className="min-w-0"><p className="truncate text-xs font-semibold">{ar ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</p><p className="text-[9px] text-muted-foreground">{item.quantity} × {formatMoney(Number(item.unit_price ?? 0), currency, lang)}</p></div>
              <strong className="text-xs">{formatMoney(item.total_price, currency, lang)}</strong>
            </div>
          ))}</div>}
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-muted/15 p-3">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-muted-foreground"><span>{ar ? "المجموع الفرعي" : "Subtotal"}</span><span>{formatMoney(subtotal, currency, lang)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>{ar ? "الضريبة" : "Tax"}</span><span>{formatMoney(tax, currency, lang)}</span></div>
          <div className="flex justify-between pt-1.5 font-display text-base font-bold"><span>{ar ? "الإجمالي" : "Total"}</span><span>{formatMoney(total, currency, lang)}</span></div>
        </div>
      </div>
    </aside>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 p-3 text-center"><span className="mx-auto grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span><p className="mt-2 truncate text-[9px] font-bold uppercase tracking-[.04em] text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-xs font-semibold text-foreground" title={value}>{value}</p></div>;
}
