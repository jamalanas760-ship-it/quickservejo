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
  const currency = restaurant?.currency ?? "SAR";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("sa.orders.title")}</h1>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
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
        <div className="panel overflow-x-auto">
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
      )}
    </div>
  );
}
