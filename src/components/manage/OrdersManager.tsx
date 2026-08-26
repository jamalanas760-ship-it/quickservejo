import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlatformOrders, useRestaurant } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatMoney } from "@/lib/format";

const STATUSES = ["new", "accepted", "preparing", "ready", "served", "paid", "cancelled"];

/** Orders for a single restaurant. RLS restricts rows to that tenant anyway. */
export function OrdersManager({ restaurantId }: { restaurantId: string }) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState("all");
  const { data: restaurant } = useRestaurant(restaurantId);
  const orders = usePlatformOrders({
    restaurantId,
    ...(status !== "all" ? { status } : {}),
  });
  const currency = restaurant?.currency ?? "JOD";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <h1 className="truncate text-lg font-semibold">{t("sa.orders.title")}</h1>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 shrink-0 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.status")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (orders.data ?? []).length === 0 ? (
        <p className="panel p-8 text-center text-sm text-muted-foreground">
          {t("sa.orders.empty")}
        </p>
      ) : (
        <>
          <div className="grid gap-2 md:hidden">
            {(orders.data ?? []).map((o) => (
              <div key={o.id} className="panel space-y-2 p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold tabular-nums">{o.order_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("sa.orders.table")}: {o.table?.table_number ?? "—"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {o.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {formatMoney(o.total, currency, lang)}
                  </span>
                  <span>{o.payment_status}</span>
                  <span>{formatDateTime(o.created_at, lang)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b text-start text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">{t("sa.orders.number")}</th>
                  <th className="p-3 text-start">{t("sa.orders.table")}</th>
                  <th className="p-3 text-start">{t("sa.orders.status")}</th>
                  <th className="p-3 text-start">{t("sa.orders.payment")}</th>
                  <th className="p-3 text-start">{t("sa.orders.total")}</th>
                  <th className="p-3 text-start">{t("sa.orders.created")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(orders.data ?? []).map((o) => (
                  <tr key={o.id}>
                    <td className="p-3 font-medium">{o.order_number}</td>
                    <td className="p-3">{o.table?.table_number ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary">{o.status}</Badge>
                    </td>
                    <td className="p-3">{o.payment_status}</td>
                    <td className="p-3">{formatMoney(o.total, currency, lang)}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatDateTime(o.created_at, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
