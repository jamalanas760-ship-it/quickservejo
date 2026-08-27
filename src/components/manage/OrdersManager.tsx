import { useMemo, useState } from "react";
import { ChevronDown, Receipt, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformOrders, useOrderItems, useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cancelReasonLabel } from "@/lib/order-ops";

import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", en: "All", ar: "الكل" },
  { id: "open", en: "Open", ar: "مفتوحة" },
  { id: "ready", en: "Ready", ar: "جاهزة" },
  { id: "served", en: "Served", ar: "مُقدَّمة" },
  { id: "paid", en: "Paid", ar: "مدفوعة" },
  { id: "cancelled", en: "Cancelled", ar: "ملغاة" },
] as const;

const OPEN = ["new", "accepted", "preparing"];

const STATUS_TONE: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  accepted: "bg-primary/15 text-primary",
  preparing: "bg-amber-500/15 text-amber-600",
  ready: "bg-emerald-500/15 text-emerald-600",
  served: "bg-muted text-muted-foreground",
  paid: "bg-emerald-500/15 text-emerald-600",
  cancelled: "bg-destructive/10 text-destructive",
};

/**
 * Native-feeling order list: sticky search, scrollable filter chips and
 * expandable tickets — one column on phones, two on large screens.
 */
export function OrdersManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: restaurant } = useRestaurant(restaurantId);
  const orders = usePlatformOrders({ restaurantId });
  const currency = restaurant?.currency ?? "JOD";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (orders.data ?? []).filter((o) => {
      const statusOk =
        filter === "all"
          ? true
          : filter === "open"
            ? OPEN.includes(o.status)
            : o.status === filter;
      if (!statusOk) return false;
      if (!term) return true;
      return (
        o.order_number.toLowerCase().includes(term) ||
        (o.table?.table_number ?? "").toLowerCase().includes(term)
      );
    });
  }, [orders.data, filter, search]);

  const totals = rows.reduce((acc, o) => acc + Number(o.total ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="sticky top-16 z-20 -mx-4 space-y-3 border-b border-border bg-background/90 px-4 pb-3 pt-1 backdrop-blur sm:top-0 sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="flex items-center justify-between gap-3 pt-2">
          <h1 className="truncate text-lg font-semibold">{t("sa.orders.title")}</h1>
          <span className="shrink-0 text-xs text-muted-foreground">
            {rows.length} · {formatMoney(totals, currency, lang)}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "ar" ? "ابحث برقم الطلب أو الطاولة" : "Search order or table"}
            className="h-11 rounded-xl ps-9"
          />
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {lang === "ar" ? f.ar : f.en}
            </button>
          ))}
        </div>
      </div>

      {orders.isPending ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <Receipt className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("sa.orders.empty")}</p>
        </div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((o) => (
            <li key={o.id} className="panel overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(open === o.id ? null : o.id)}
                className="flex w-full items-center gap-3 p-4 text-start"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-xs font-bold tabular-nums">
                  {o.table?.table_number ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold tabular-nums">
                      {o.order_number}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        STATUS_TONE[o.status] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {o.status}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatDateTime(o.created_at, lang)} · {o.payment_status}
                    {o.status === "cancelled"
                      ? ` · ${cancelReasonLabel(o.cancellation_reason, lang === "ar")}`
                      : ""}
                  </span>

                </span>
                <span className="shrink-0 text-end">
                  <span className="block text-sm font-semibold">
                    {formatMoney(o.total, currency, lang)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "ms-auto mt-1 size-4 text-muted-foreground transition-transform",
                      open === o.id && "rotate-180",
                    )}
                  />
                </span>
              </button>
              {open === o.id ? <OrderDetail orderId={o.id} currency={currency} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderDetail({ orderId, currency }: { orderId: string; currency: string }) {
  const { lang } = useI18n();
  const items = useOrderItems(orderId);

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      {items.isPending ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : (items.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {lang === "ar" ? "لا توجد أصناف." : "No items."}
        </p>
      ) : (
        <ul className="space-y-2">
          {(items.data ?? []).map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                ×{item.quantity}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {lang === "ar"
                    ? item.product_name_snapshot_ar || item.product_name_snapshot_en
                    : item.product_name_snapshot_en || item.product_name_snapshot_ar}
                </span>
                {item.notes ? (
                  <span className="block truncate text-xs text-muted-foreground">{item.notes}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-medium">
                {formatMoney(item.total_price, currency, lang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
