import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

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
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/super-admin/orders")({
  head: () => ({
    meta: [
      { title: "Platform orders — QuickServe admin" },
      {
        name: "description",
        content: "Monitor every order across all restaurants with status, payment and date filters.",
      },
      { property: "og:title", content: "Platform orders — QuickServe admin" },
      { property: "og:description", content: "Cross-tenant order monitoring for QuickServe." },
    ],
  }),
  component: PlatformOrdersPage,
});

const STATUSES = ["new", "accepted", "preparing", "ready", "served", "paid", "cancelled"];
const PAYMENTS = ["unpaid", "paid", "refunded"];

function PlatformOrdersPage() {
  const { t, lang, pick } = useI18n();
  const queryClient = useQueryClient();
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
  const current = (orders.data ?? []).find((o) => o.id === openOrder) ?? null;

  async function cancelOrder(id: string, rId: string) {
    try {
      const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      await logAudit("order.cancelled", { restaurantId: rId, entity: "orders", entityId: id });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
      setOpenOrder(null);
    } catch (error) {
      toast.error(humanError(error, lang));
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("sa.orders.title")}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger>
            <SelectValue placeholder={t("sa.orders.restaurant")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {(restaurants.data ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder={t("sa.orders.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={payment} onValueChange={setPayment}>
          <SelectTrigger>
            <SelectValue placeholder={t("sa.orders.payment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("sa.filter.all")}</SelectItem>
            {PAYMENTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("sa.orders.dateFrom")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("sa.orders.dateTo")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {orders.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (orders.data ?? []).length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {t("sa.orders.empty")}
        </p>
      ) : (
        <>
          {/* Phone: tappable cards. Desktop: full table. */}
          <div className="grid gap-2 md:hidden">
            {(orders.data ?? []).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOpenOrder(o.id)}
                className="panel w-full space-y-2 p-4 text-start active:bg-muted/60"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold tabular-nums">{o.order_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.restaurant?.name ?? "—"}
                      {o.table?.table_number ? ` · ${t("sa.orders.table")} ${o.table.table_number}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={o.status === "cancelled" ? "outline" : "secondary"}
                    className="shrink-0"
                  >
                    {o.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatMoney(o.total, o.restaurant?.currency ?? o.currency, lang)}
                  </span>
                  <span>{o.payment_status}</span>
                  <span className="tabular-nums">{formatDateTime(o.created_at, lang)}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t("sa.orders.number")}</th>
                  <th className="p-3 text-start">{t("sa.orders.restaurant")}</th>
                  <th className="p-3 text-start">{t("sa.orders.table")}</th>
                  <th className="p-3 text-start">{t("sa.orders.status")}</th>
                  <th className="p-3 text-start">{t("sa.orders.payment")}</th>
                  <th className="p-3 text-start">{t("sa.orders.total")}</th>
                  <th className="p-3 text-start">{t("sa.orders.created")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(orders.data ?? []).map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setOpenOrder(o.id)}
                  >
                    <td className="p-3 font-medium">{o.order_number}</td>
                    <td className="p-3">{o.restaurant?.name ?? "—"}</td>
                    <td className="p-3">{o.table?.table_number ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant={o.status === "cancelled" ? "outline" : "secondary"}>
                        {o.status}
                      </Badge>
                    </td>
                    <td className="p-3">{o.payment_status}</td>
                    <td className="p-3 tabular-nums">
                      {formatMoney(o.total, o.restaurant?.currency ?? o.currency, lang)}
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {formatDateTime(o.created_at, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={openOrder !== null} onOpenChange={(o) => !o && setOpenOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("sa.orders.details")} {current?.order_number}
            </DialogTitle>
            <DialogDescription>{current?.restaurant?.name ?? ""}</DialogDescription>
          </DialogHeader>

          {items.isPending ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : (
            <ul className="divide-y text-sm">
              {(items.data ?? []).map((it) => (
                <li key={it.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {it.quantity}× {pick(it.product_name_snapshot_en, it.product_name_snapshot_ar)}
                    {it.notes ? (
                      <span className="block text-xs text-muted-foreground">{it.notes}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(it.total_price, current?.currency ?? "JOD", lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {current ? (
            <dl className="space-y-1 border-t pt-3 text-sm">
              <Line label={t("sa.orders.subtotal")} value={formatMoney(current.subtotal, current.currency, lang)} />
              <Line label={t("sa.orders.tax")} value={formatMoney(current.tax_amount, current.currency, lang)} />
              <Line label={t("sa.orders.service")} value={formatMoney(current.service_amount, current.currency, lang)} />
              <Line label={t("sa.orders.discount")} value={formatMoney(current.discount_amount, current.currency, lang)} />
              <Line
                label={t("sa.orders.total")}
                value={formatMoney(current.total, current.currency, lang)}
                strong
              />
            </dl>
          ) : null}

          <DialogFooter>
            {current && current.status !== "cancelled" && current.status !== "paid" ? (
              <Button
                variant="destructive"
                onClick={() => void cancelOrder(current.id, current.restaurant_id)}
              >
                {t("sa.orders.cancel")}
              </Button>
            ) : null}
            <Button onClick={() => setOpenOrder(null)}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
