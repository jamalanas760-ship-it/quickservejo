import { toast } from "sonner";
import { ActionMenu } from "@/components/app/ActionMenu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccess } from "@/hooks/useSession";
import { membershipHasCapability } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { UtensilsCrossed, Table2 } from "@/components/nav/QuickServeIcons";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CalendarDays,
  SlidersHorizontal,
  ListFilter,
  Clock3,
  FileText,
  CreditCard,
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
import { formatMoney } from "@/lib/format";
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
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="qs-order-detail-dialog"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{ar ? "تفاصيل الطلب" : "Order details"}</DialogTitle>
            <DialogDescription>
              {ar ? "تفاصيل الطلب المحدد" : "Details of the selected order"}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <OrderDetail key={selected.id} order={selected} currency={selected.currency || currency} />
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
  const restaurant = useRestaurant(order.restaurant_id);
  const timezone = restaurant.data?.timezone || "Asia/Amman";
  const subtotal = Number(order.subtotal ?? (items.data ?? []).reduce((sum, item) => sum + Number(item.total_price ?? 0), 0));
  const total = Number(order.total ?? subtotal);
  const quantity = (items.data ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const paymentLabels: Record<string, [string,string]> = {
    paid: ["Paid", "مدفوع"], unpaid: ["Payment pending", "بانتظار الدفع"],
    pending: ["Payment pending", "بانتظار الدفع"], partially_paid: ["Partially paid", "مدفوع جزئياً"],
    refunded: ["Refunded", "مسترد"], failed: ["Payment failed", "فشل الدفع"],
  };
  const service = order.table_id ? (ar ? "داخل المطعم" : "Dine-in")
    : order.fulfillment_type === "delivery" ? (ar ? "توصيل" : "Delivery") : (ar ? "استلام" : "Takeaway");
  const costs = [
    { label: ar ? "المجموع الفرعي" : "Subtotal", amount: subtotal, show: true },
    { label: ar ? "الضريبة" : "Tax", amount: Number(order.tax_amount ?? 0), show: true },
    { label: ar ? "الخدمة" : "Service", amount: Number(order.service_amount ?? 0), show: Number(order.service_amount) > 0 },
    { label: ar ? "التوصيل" : "Delivery", amount: Number(order.delivery_amount ?? 0), show: Number(order.delivery_amount) > 0 },
    { label: ar ? "الخصم" : "Discount", amount: -Number(order.discount_amount ?? 0), show: Number(order.discount_amount) > 0 },
    { label: ar ? "الإكرامية" : "Tip", amount: Number(order.tip_amount ?? 0), show: Number(order.tip_amount) > 0 },
  ];
  return (
    <aside className="qs-right-panel qs-receipt" dir={ar ? "rtl" : "ltr"}>
      <header className="qs-receipt-header">
        <h2>{ar ? "طلب" : "Order"} {order.order_number}</h2>
        <p>{new Intl.DateTimeFormat(ar ? "ar-JO" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(order.created_at))}</p>
      </header>
      <div className="qs-receipt-status">
        <span className={cn("qs-status", statusClass[order.status] ?? "bg-muted")}>{orderStatus(order.status, ar)}</span>
        <span><CreditCard aria-hidden="true" />{paymentLabels[order.payment_status]?.[ar ? 1 : 0] ?? (ar ? "بانتظار الدفع" : "Payment pending")}</span>
      </div>
      <div className="qs-scroll-region qs-receipt-body">
        <section className="qs-receipt-meta" aria-label={ar ? "معلومات الطلب" : "Order information"}>
          <ReceiptMeta icon={<Table2 />} label={ar ? "الطاولة" : "Table"} value={order.table?.table_number ? (ar ? "طاولة " : "Table ") + order.table.table_number : (ar ? "بدون طاولة" : "No table")} />
          <ReceiptMeta icon={<UtensilsCrossed />} label={ar ? "نوع الخدمة" : "Service type"} value={service} />
          <ReceiptMeta icon={<UserRound />} label={ar ? "الضيف" : "Guest"} value={order.guest_name || (ar ? "ضيف بدون حجز" : "Walk-in guest")} />
          <ReceiptMeta icon={<ShoppingBag />} label={ar ? "العناصر" : "Items"} value={items.isPending ? "…" : items.isError ? "—" : `${quantity} ${ar ? "عناصر" : "items"}`} />
        </section>
        <section className="qs-receipt-items">
          <h3>{ar ? "العناصر" : "Items"}</h3>
          {items.isPending ? <Skeleton className="h-24 rounded-xl" /> : items.isError ? (
            <div role="alert" className="py-4 text-sm text-destructive"><p>{ar ? "تعذر تحميل العناصر" : "Could not load items"}</p><Button variant="outline" className="mt-2" onClick={() => void items.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button></div>
          ) : (items.data ?? []).length ? (items.data ?? []).map(item => (
            <div className="qs-receipt-item" key={item.id}>
              <span className="qs-receipt-quantity">{item.quantity} ×</span>
              <div>
                <strong>{ar ? item.product_name_snapshot_ar || item.product_name_snapshot_en : item.product_name_snapshot_en || item.product_name_snapshot_ar}</strong>
                <small>{formatMoney(Number(item.unit_price ?? 0), currency, lang)} {ar ? "للعنصر" : "each"}</small>
                {item.notes ? <p className="qs-receipt-item-note">{item.notes}</p> : null}
              </div>
              <bdi>{formatMoney(Number(item.total_price), currency, lang)}</bdi>
            </div>
          )) : <p className="py-4 text-sm text-muted-foreground">{ar ? "لا توجد عناصر" : "No items"}</p>}
        </section>
        {order.customer_notes ? <section className="qs-receipt-note"><FileText aria-hidden="true" /><div><h3>{ar ? "ملاحظة العميل" : "Customer note"}</h3><p>{order.customer_notes}</p></div></section> : null}
        <dl className="qs-receipt-costs">{costs.filter(cost => cost.show).map(cost => <div key={cost.label}><dt>{cost.label}</dt><dd><bdi>{formatMoney(cost.amount, currency, lang)}</bdi></dd></div>)}</dl>
      </div>
      <footer className="qs-receipt-total"><strong>{ar ? "الإجمالي" : "Total"}</strong><bdi>{formatMoney(total, currency, lang)}</bdi></footer>
      <OrderStatusEditor order={order} />
    </aside>
  );
}

function ReceiptMeta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div><span aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

/** Reuse the kitchen's guarded transition RPC; never expose payment transitions here. */
function OrderStatusEditor({ order }: { order: { id: string; restaurant_id: string; order_number: string; status: string } }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const membership = access.membershipFor(order.restaurant_id);
  const canUpdate = access.isSuperAdmin || Boolean(membership
    && ["restaurant_admin", "manager", "kitchen", "waiter", "cashier"].includes(membership.role)
    && membershipHasCapability(membership.role, membership.permission_overrides, "update_order_status"));
  const qc = useQueryClient();
  const [draft, setDraft] = useState(order.status);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => { setDraft(order.status); }, [order.status]);
  const next = ({ new: "accepted", accepted: "preparing", preparing: "ready", ready: "served" } as Record<string, string>)[order.status];
  const update = useMutation({
    mutationFn: async (status: string) => {
      if (!canUpdate || (status !== next && !(status === "cancelled" && next))) throw new Error(ar ? "هذا التغيير غير متاح." : "This transition is unavailable.");
      const { data, error } = await (supabase as any).rpc("transition_order_status", { _order_id: order.id, _next: status, _note: null });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: async (data) => {
      if (data?.id === order.id) qc.setQueriesData({ queryKey: ["platform", "orders"] }, (rows: unknown) => Array.isArray(rows) ? rows.map(row => row.id === order.id ? { ...row, ...data } : row) : rows);
      setConfirmCancel(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["platform", "orders"] }),
        qc.invalidateQueries({ queryKey: ["kitchen-orders", order.restaurant_id] }),
        qc.invalidateQueries({ queryKey: ["kitchen-order-events", order.restaurant_id] }),
        qc.invalidateQueries({ queryKey: operationalCountersKey(order.restaurant_id) }),
      ]);
      toast.success(ar ? "تم تحديث الطلب" : "Order updated");
    },
    onError: error => toast.error(humanError(error, lang)),
  });
  if (!canUpdate || !next) return null;
  return <div className="qs-receipt-editor">
    <div className="qs-receipt-status-field"><label htmlFor={`order-status-${order.id}`}>{ar ? "الحالة" : "Status"}</label>
      <Select value={draft} disabled={update.isPending} onValueChange={setDraft}>
        <SelectTrigger id={`order-status-${order.id}`} aria-label={ar ? "حالة الطلب" : "Order status"}><SelectValue /></SelectTrigger>
        <SelectContent><SelectGroup>{[order.status, next].map(status => <SelectItem key={status} value={status}>{orderStatus(status, ar)}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </div>
    {update.isError ? <p role="alert" className="text-xs text-destructive">{humanError(update.error, lang)}</p> : null}
    <div className="qs-receipt-actions">
      <ActionMenu ar={ar} label={ar ? "إجراءات الطلب" : "Order actions"} actions={[{ label: ar ? "إلغاء الطلب" : "Cancel order", destructive: true, disabled: update.isPending, onSelect: () => setConfirmCancel(true) }]} />
      <Button disabled={update.isPending || draft === order.status} onClick={() => update.mutate(draft)}>{update.isPending ? (ar ? "جارٍ التحديث…" : "Updating…") : (ar ? "تحديث" : "Update")}</Button>
    </div>
    <AlertDialog open={confirmCancel} onOpenChange={value => !update.isPending && setConfirmCancel(value)}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{ar ? "إلغاء الطلب؟" : "Cancel order?"}</AlertDialogTitle><AlertDialogDescription>{order.order_number} · {ar ? "سيتم إلغاء هذا الطلب. لا يمكن التراجع عن هذا الإجراء." : "This order will be cancelled. This action cannot be undone."}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={update.isPending}>{ar ? "الاحتفاظ بالطلب" : "Keep order"}</AlertDialogCancel><AlertDialogAction disabled={update.isPending} onClick={event => { event.preventDefault(); update.mutate("cancelled"); }}>{ar ? "إلغاء الطلب" : "Cancel order"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}
