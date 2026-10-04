import { UtensilsCrossed, Table2 } from "@/components/nav/QuickServeIcons";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CalendarDays,
  SlidersHorizontal,
  ListFilter,
  Clock3,
  FileText,
  Search,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { MasterPageHeader } from "@/components/app/MasterPage";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformOrders, useOrderItems, useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { homePeriodRange, type HomePeriod } from "@/lib/home-period";
import { Button } from "@/components/ui/button";
import { humanError } from "@/lib/errors";
import { markOrderViewed } from "@/lib/order-attention";
import { operationalCountersKey } from "@/hooks/useOperationalCounters";

const TABS = [
  { id: "all", en: "All", ar: "الكل", dot: "bg-slate-400" },
  { id: "new", en: "New", ar: "جديد", dot: "bg-blue-500" },
  { id: "preparing", en: "Preparing", ar: "تحضير", dot: "bg-[#e85d2a]" },
  { id: "ready", en: "Ready", ar: "جاهز", dot: "bg-emerald-500" },
] as const;

const statusClass: Record<string, string> = {
  new: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  accepted: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  preparing: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
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

export function OrdersManager({
  restaurantId,
  recordId,
}: {
  restaurantId: string;
  recordId?: string | undefined;
}) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<HomePeriod | "all">("all");
  const [service, setService] = useState<"all" | "dine-in" | "takeaway">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClock((value) => value + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const desktopOrderLayout = useDesktopOrderLayout();
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant(restaurantId);
  const range =
    period === "all" ? null : homePeriodRange(period, restaurant?.timezone || "Asia/Amman");
  const orders = usePlatformOrders({
    restaurantId,
    ...(range
      ? { from: range.start, to: new Date(new Date(range.end).getTime() - 1).toISOString() }
      : {}),
  });
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

  useEffect(() => {
    if (recordId) {
      setTab("all");
      setSearch("");
      setPeriod("all");
      setService("all");
      setSelectedId(recordId);
    }
  }, [recordId]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter((order) => {
      if (service === "dine-in" && !order.table_id) return false;
      if (service === "takeaway" && order.table_id) return false;
      const normalized = order.status === "accepted" ? "new" : order.status;
      if (tab !== "all" && normalized !== tab) return false;
      if (!term) return true;
      return (
        order.order_number.toLowerCase().includes(term) ||
        (order.table?.table_number ?? "").toLowerCase().includes(term) ||
        order.status.toLowerCase().includes(term)
      );
    });
  }, [orders.data, search, tab, service]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((item) => [
          item.id,
          (orders.data ?? [])
            .filter(
              (order) =>
                service === "all" ||
                (service === "dine-in" ? Boolean(order.table_id) : !order.table_id),
            )
            .filter(
              (order) =>
                item.id === "all" ||
                (order.status === "accepted" ? "new" : order.status) === item.id,
            ).length,
        ]),
      ),
    [orders.data, service],
  );

  const selected =
    (orders.data ?? []).find((order) => order.id === selectedId) ??
    (desktopOrderLayout ? rows[0] : null) ??
    null;

  const periodOptions: Array<{ value: HomePeriod | "all"; en: string; ar: string }> = [
    { value: "all", en: "All dates", ar: "كل التواريخ" },
    { value: "today", en: "Today", ar: "اليوم" },
    { value: "yesterday", en: "Yesterday", ar: "أمس" },
    { value: "week", en: "This week", ar: "هذا الأسبوع" },
    { value: "month", en: "This month", ar: "هذا الشهر" },
  ];
  const periodLabel = periodOptions.find((option) => option.value === period)?.[ar ? "ar" : "en"];
  return (
    <div className="qs-orders-studio flex min-w-0 flex-col gap-4">
      <MasterPageHeader
        title={ar ? "الطلبات" : "Orders"}
        description={ar ? "خدمتك، بكل وضوح." : "Your service, in motion."}
      />
      <div className="qs-orders-toolbar">
        <button type="button" onClick={() => setFiltersOpen(true)}>
          <CalendarDays />
          <span>{periodLabel}</span>
          <ChevronRight className="qs-orders-period-chevron" />
        </button>
        <button type="button" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal />
          {ar ? "تصفية" : "Filter"}
          {service !== "all" ? <span className="qs-orders-filter-dot" /> : null}
        </button>
      </div>
      <div className="qs-search-field qs-orders-search">
        <Search />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={ar ? "ابحث عن طلب أو طاولة…" : "Search orders or tables…"}
          className="qs-search-input"
        />
      </div>
      <div className="qs-orders-tabs" aria-label={ar ? "حالة الطلب" : "Order status"}>
        {TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            <span>{ar ? item.ar : item.en}</span>
            <strong>{counts[item.id] ?? 0}</strong>
          </button>
        ))}
      </div>
      {orders.isPending ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : orders.isError ? (
        <div role="alert" className="qs-card p-5 text-destructive">
          {humanError(orders.error, lang)}
        </div>
      ) : rows.length === 0 ? (
        <div className="qs-card grid min-h-60 place-items-center p-6 text-center">
          <div>
            <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">
              {ar ? "لا توجد طلبات لهذا الفلتر" : "No orders for these filters"}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setTab("all");
                setSearch("");
                setPeriod("all");
                setService("all");
              }}
            >
              {ar ? "عرض جميع الطلبات" : "Show all orders"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="qs-orders-layout">
          <div className="qs-orders-list">
            {rows.map((order) => (
              <article
                key={order.id}
                className="qs-order-card"
                data-status={order.status}
                data-selected={selected?.id === order.id}
              >
                <div className="qs-order-card-heading">
                  <h2>
                    {order.order_number.startsWith("#")
                      ? order.order_number
                      : `#${order.order_number}`}
                  </h2>
                  <span className={cn("qs-status", statusClass[order.status] ?? "bg-muted")}>
                    {orderStatus(order.status, ar)}
                  </span>
                </div>
                <div className="qs-order-card-meta">
                  <span>
                    {order.table?.table_number ? (
                      <>
                        <Table2 />
                        {ar ? "طاولة" : "Table"} {order.table.table_number}
                      </>
                    ) : (
                      <>
                        <ShoppingBag />
                        {ar ? "طلب خارجي" : "Takeaway"}
                      </>
                    )}
                  </span>
                  <span>
                    <Clock3 />
                    {elapsed(order.created_at, ar)}
                  </span>
                </div>
                <p className="qs-order-service">
                  {order.table_id
                    ? ar
                      ? "داخل المطعم"
                      : "Dine-in"
                    : ar
                      ? "طلب خارجي"
                      : "Takeaway"}{" "}
                  ·{" "}
                  {new Date(order.created_at).toLocaleDateString(ar ? "ar-JO" : "en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: restaurant?.timezone || "Asia/Amman",
                  })}
                </p>
                <div className="qs-order-card-total">
                  <span>
                    <UtensilsCrossed />
                    {order.order_items?.[0]?.count ?? "—"} {ar ? "عناصر" : "items"}
                  </span>
                  <strong>
                    {formatMoney(Number(order.total), order.currency || currency, lang)}
                  </strong>
                </div>
                <button
                  type="button"
                  className="qs-order-view"
                  onClick={() => selectOrder(order.id)}
                >
                  <ListFilter />
                  {ar ? "عرض الطلب" : "View order"}
                  <ChevronRight />
                </button>
              </article>
            ))}
          </div>
          {desktopOrderLayout && selected ? (
            <OrderDetail order={selected} currency={selected.currency || currency} />
          ) : null}
        </div>
      )}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent
          className="qs-orders-filter"
          placement="edge"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{ar ? "تصفية الطلبات" : "Filter orders"}</DialogTitle>
            <DialogDescription>
              {ar ? "اختر الفترة ونوع الخدمة." : "Choose a period and service type."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-bold">{ar ? "الفترة" : "Period"}</p>
          <div className="qs-orders-filter-options">
            {periodOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={period === option.value}
                onClick={() => setPeriod(option.value)}
              >
                {ar ? option.ar : option.en}
              </button>
            ))}
          </div>
          <p className="text-sm font-bold">{ar ? "نوع الخدمة" : "Service"}</p>
          <div className="qs-orders-filter-options">
            {(
              [
                { value: "all", en: "All service", ar: "الكل" },
                { value: "dine-in", en: "Dine-in", ar: "داخل المطعم" },
                { value: "takeaway", en: "Takeaway", ar: "خارجي" },
              ] as const
            ).map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={service === option.value}
                onClick={() => setService(option.value)}
              >
                {ar ? option.ar : option.en}
              </button>
            ))}
          </div>
          <Button onClick={() => setFiltersOpen(false)}>
            {ar ? "عرض النتائج" : "Show results"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!desktopOrderLayout && Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-16px)] max-w-2xl gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{ar ? "تفاصيل الطلب" : "Order details"}</DialogTitle>
            <DialogDescription>
              {ar ? "تفاصيل الطلب المحدد" : "Details of the selected order"}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <OrderDetail order={selected} currency={selected.currency || currency} />
          ) : (
            <p className="p-8">{ar ? "الطلب غير متاح" : "Order unavailable"}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function orderStatus(status: string, ar: boolean) {
  const labels: Record<string, [string, string]> = {
    new: ["New", "جديد"],
    accepted: ["Accepted", "مقبول"],
    preparing: ["Preparing", "قيد التحضير"],
    ready: ["Ready", "جاهز"],
    served: ["Served", "تم التقديم"],
    paid: ["Paid", "مدفوع"],
    cancelled: ["Cancelled", "ملغي"],
  };
  return labels[status]?.[ar ? 1 : 0] ?? status;
}

function OrderDetail({ order, currency }: { order: any; currency: string }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const items = useOrderItems(order.id);
  const subtotal = Number(
    order.subtotal ??
      (items.data ?? []).reduce((sum, item) => sum + Number(item.total_price ?? 0), 0),
  );
  const total = Number(order.total ?? subtotal);
  const tax = Number(order.tax_amount ?? 0);

  return (
    <aside className="qs-right-panel flex max-h-[calc(100dvh-24px)] min-h-0 flex-col overflow-hidden xl:max-h-none">
      <div className="qs-panel-header flex shrink-0 items-start justify-between gap-4 p-4 pe-12 xl:pe-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">
            {ar ? "تفاصيل الطلب" : "Order details"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h2 className="break-all font-display text-lg font-bold">{order.order_number}</h2>
            <span className={cn("qs-status capitalize", statusClass[order.status] ?? "bg-muted")}>
              {orderStatus(order.status, ar)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(order.created_at, lang)}
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-muted px-3 py-2 text-end">
          <strong className="block whitespace-nowrap text-sm">
            {elapsed(order.created_at, ar)}
          </strong>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            {ar ? "المدة" : "Elapsed"}
          </span>
        </span>
      </div>

      <div className="qs-scroll-region min-h-0 flex-1 space-y-3 p-3 sm:p-4">
        <section className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0 rtl:divide-x-reverse">
          <Meta
            icon={<UtensilsCrossed className="size-3.5" />}
            label={ar ? "الخدمة" : "Service"}
            value={
              order.table?.table_number
                ? (ar ? "طاولة " : "Table ") + order.table.table_number
                : ar
                  ? "طلب خارجي"
                  : "Takeaway"
            }
          />
          <Meta
            icon={<UserRound className="size-3.5" />}
            label={ar ? "العميل" : "Customer"}
            value={ar ? "ضيف" : "Walk-in Guest"}
          />
          <Meta
            icon={<FileText className="size-3.5" />}
            label={ar ? "العناصر" : "Items"}
            value={String(items.data?.length ?? 0) + " " + (ar ? "عنصر" : "items")}
          />
          <Meta
            icon={<ShoppingBag className="size-3.5" />}
            label={ar ? "نوع الخدمة" : "Service type"}
            value={order.table_id ? (ar ? "داخل المطعم" : "Dine-in") : ar ? "استلام" : "Takeaway"}
          />
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <h3 className="text-xs font-bold">{ar ? "عناصر الطلب" : "Order Items"}</h3>
          </div>
          {items.isPending ? (
            <Skeleton className="m-3 h-28 rounded-xl" />
          ) : (
            <div className="divide-y divide-border">
              {(items.data ?? []).map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-orange-50 text-[#e85d2a] dark:bg-orange-950/30">
                    <UtensilsCrossed className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">
                      {ar
                        ? item.product_name_snapshot_ar || item.product_name_snapshot_en
                        : item.product_name_snapshot_en || item.product_name_snapshot_ar}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {item.quantity} × {formatMoney(Number(item.unit_price ?? 0), currency, lang)}
                    </p>
                  </div>
                  <strong className="text-xs">
                    {formatMoney(item.total_price, currency, lang)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-border bg-muted/15 p-3">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>{ar ? "المجموع الفرعي" : "Subtotal"}</span>
            <span>{formatMoney(subtotal, currency, lang)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{ar ? "الضريبة" : "Tax"}</span>
            <span>{formatMoney(tax, currency, lang)}</span>
          </div>
          {Number(order.service_amount) > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>{ar ? "الخدمة" : "Service"}</span>
              <span>{formatMoney(Number(order.service_amount), currency, lang)}</span>
            </div>
          ) : null}
          {Number(order.discount_amount) > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>{ar ? "الخصم" : "Discount"}</span>
              <span>−{formatMoney(Number(order.discount_amount), currency, lang)}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-1.5 font-display text-base font-bold">
            <span>{ar ? "الإجمالي" : "Total"}</span>
            <span>{formatMoney(total, currency, lang)}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 p-3 text-center">
      <span className="mx-auto grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="mt-2 truncate text-[9px] font-bold uppercase tracking-[.04em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
