import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, CircleDot, ReceiptText } from "lucide-react";

import { MasterEyebrow, MasterPageHeader } from "@/components/app/MasterPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useOrderItems,
  usePlatformOrders,
  useRestaurantsWithStats,
} from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/orders")({
  head: () => ({
    meta: [
      { title: "Platform orders — QuickServe admin" },
      { name: "description", content: "Read-only monitoring for every order across all restaurants." },
      { property: "og:title", content: "Platform orders — QuickServe admin" },
      { property: "og:description", content: "Cross-tenant order monitoring for QuickServe." },
    ],
  }),
  component: PlatformOrdersPage,
});

const STATUSES = ["new", "accepted", "preparing", "ready", "served", "paid", "cancelled"];
const PAYMENTS = ["unpaid", "paid", "refunded"];
const TRACKING = ["new", "preparing", "ready", "served", "paid"] as const;

function currentStep(status: string) {
  if (status === "accepted") return 0;
  return TRACKING.indexOf(status as (typeof TRACKING)[number]);
}

function PlatformOrdersPage() {
  const { t, lang, pick } = useI18n();
  const restaurants = useRestaurantsWithStats();
  const [restaurantId, setRestaurantId] = useState("all");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  const orders = usePlatformOrders({
    ...(restaurantId !== "all" ? { restaurantId } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(payment !== "all" ? { paymentStatus: payment } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
  });
  const items = useOrderItems(openOrder);
  const current = (orders.data ?? []).find((order) => order.id === openOrder) ?? null;

  return (
    <div className="space-y-4">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={ReceiptText}>{lang === "ar" ? "مراقبة الطلبات" : "Order monitoring"}</MasterEyebrow>}
        title={t("sa.orders.title")}
        description={lang === "ar" ? "مراقبة وتتبع جميع طلبات المطاعم بدون تعديل بيانات التشغيل." : "Monitor every restaurant order across the platform without changing tenant operations."}
      />

      <div className="qs-card grid items-end gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5 sm:p-4">
        <FilterField label={t("sa.orders.restaurant")}>
          <Select value={restaurantId} onValueChange={setRestaurantId}>
            <SelectTrigger className="h-14"><SelectValue placeholder={t("sa.orders.restaurant")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
              {(restaurants.data ?? []).map((restaurant) => <SelectItem key={restaurant.id} value={restaurant.id}>{restaurant.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("sa.orders.status")}>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-14"><SelectValue placeholder={t("sa.orders.status")} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("sa.filter.all")}</SelectItem>{STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("sa.orders.payment")}>
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger className="h-14"><SelectValue placeholder={t("sa.orders.payment")} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("sa.filter.all")}</SelectItem>{PAYMENTS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label={t("sa.orders.dateFrom")}><Input className="h-14" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></FilterField>
        <FilterField label={t("sa.orders.dateTo")}><Input className="h-14" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></FilterField>
      </div>

      {orders.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (orders.data ?? []).length === 0 ? (
        <p className="qs-card p-8 text-center text-sm text-muted-foreground">{t("sa.orders.empty")}</p>
      ) : (
        <>
          <div className="grid gap-2 md:hidden">
            {(orders.data ?? []).map((order) => (
              <button key={order.id} type="button" onClick={() => setOpenOrder(order.id)} className="qs-card w-full space-y-2 p-4 text-start active:bg-muted/60">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0"><p className="truncate font-semibold tabular-nums">{order.order_number}</p><p className="truncate text-xs text-muted-foreground">{order.restaurant?.name ?? "—"}{order.table?.table_number ? ` · ${t("sa.orders.table")} ${order.table.table_number}` : ""}</p></div>
                  <Badge variant={order.status === "cancelled" ? "outline" : "secondary"} className="shrink-0">{order.status}</Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{formatMoney(order.total, order.restaurant?.currency ?? order.currency, lang)}</span><span>{order.payment_status}</span><span className="tabular-nums">{formatDateTime(order.created_at, lang)}</span></div>
              </button>
            ))}
          </div>

          <div className="qs-card hidden overflow-x-auto md:block">
            <table className="qs-table min-w-[850px]">
              <thead><tr><th>{t("sa.orders.number")}</th><th>{t("sa.orders.restaurant")}</th><th>{t("sa.orders.table")}</th><th>{t("sa.orders.status")}</th><th>{t("sa.orders.payment")}</th><th>{t("sa.orders.total")}</th><th>{t("sa.orders.created")}</th></tr></thead>
              <tbody>
                {(orders.data ?? []).map((order) => (
                  <tr key={order.id} className="cursor-pointer" onClick={() => setOpenOrder(order.id)}>
                    <td className="font-medium">{order.order_number}</td><td>{order.restaurant?.name ?? "—"}</td><td>{order.table?.table_number ?? "—"}</td><td><Badge variant={order.status === "cancelled" ? "outline" : "secondary"}>{order.status}</Badge></td><td>{order.payment_status}</td><td className="tabular-nums">{formatMoney(order.total, order.restaurant?.currency ?? order.currency, lang)}</td><td className="whitespace-nowrap text-muted-foreground">{formatDateTime(order.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={openOrder !== null} onOpenChange={(open) => !open && setOpenOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("sa.orders.details")} {current?.order_number}</DialogTitle><DialogDescription>{current?.restaurant?.name ?? ""}</DialogDescription></DialogHeader>
          {current ? <Tracking status={current.status} lang={lang} /> : null}
          {items.isPending ? <Skeleton className="h-32 rounded-lg" /> : (
            <ul className="divide-y text-sm">
              {(items.data ?? []).map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2"><span>{item.quantity}× {pick(item.product_name_snapshot_en, item.product_name_snapshot_ar)}{item.notes ? <span className="block text-xs text-muted-foreground">{item.notes}</span> : null}</span><span className="tabular-nums">{formatMoney(item.total_price, current?.currency ?? "JOD", lang)}</span></li>
              ))}
            </ul>
          )}
          {current ? (
            <dl className="space-y-1 border-t pt-3 text-sm">
              <Line label={t("sa.orders.subtotal")} value={formatMoney(current.subtotal, current.currency, lang)} />
              <Line label={t("sa.orders.tax")} value={formatMoney(current.tax_amount, current.currency, lang)} />
              <Line label={t("sa.orders.service")} value={formatMoney(current.service_amount, current.currency, lang)} />
              <Line label={t("sa.orders.discount")} value={formatMoney(current.discount_amount, current.currency, lang)} />
              <Line label={t("sa.orders.total")} value={formatMoney(current.total, current.currency, lang)} strong />
            </dl>
          ) : null}
          <DialogFooter><Button onClick={() => setOpenOrder(null)}>{t("common.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-2"><Label className="block h-4 text-xs font-medium text-muted-foreground">{label}</Label>{children}</div>;
}

function Tracking({ status, lang }: { status: string; lang: "en" | "ar" }) {
  const index = currentStep(status);
  if (status === "cancelled") return <div className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-600 dark:text-rose-400">{lang === "ar" ? "تم إلغاء الطلب" : "Order cancelled"}</div>;
  return (
    <div className="rounded-xl border bg-muted/25 p-3">
      <div className="grid grid-cols-5 gap-1">
        {TRACKING.map((step, stepIndex) => {
          const complete = index >= stepIndex;
          const active = index === stepIndex;
          const label = lang === "ar" ? ({ new: "جديد", preparing: "تحضير", ready: "جاهز", served: "مُقدَّم", paid: "مدفوع" } as const)[step] : step;
          return (
            <div key={step} className="qs-tracking-step text-center" data-complete={complete}>
              <span className={cn("qs-tracking-node mx-auto grid size-8 place-items-center rounded-full border", complete ? "border-[#e85d2a] bg-[#e85d2a] text-white" : "border-border bg-background text-muted-foreground", active && "ring-4 ring-orange-500/10")}>{complete && !active ? <Check className="size-3.5" /> : <CircleDot className="size-3.5" />}</span>
              <span className="mt-2 block truncate text-[9px] font-semibold text-muted-foreground sm:text-[10px]">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><dt className={strong ? "" : "text-muted-foreground"}>{label}</dt><dd className="tabular-nums">{value}</dd></div>;
}