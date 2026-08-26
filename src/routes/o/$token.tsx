import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublicOrderStatus } from "@/lib/diner";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  new: { en: "Sent to kitchen", ar: "أُرسل إلى المطبخ" },
  accepted: { en: "Accepted", ar: "تم القبول" },
  preparing: { en: "Being prepared", ar: "قيد التحضير" },
  ready: { en: "Ready", ar: "جاهز" },
  served: { en: "Served", ar: "تم التقديم" },
  paid: { en: "Paid", ar: "مدفوع" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};

export const Route = createFileRoute("/o/$token")({
  head: () => ({
    meta: [
      { title: "Your order status — QuickServe" },
      { name: "description", content: "Follow your table order from kitchen to table in real time." },
      { property: "og:title", content: "Your order status — QuickServe" },
      { property: "og:description", content: "Follow your order from kitchen to table." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderStatusPage,
});

function OrderStatusPage() {
  const { token } = Route.useParams();
  const { lang, t } = useI18n();

  const order = useQuery({
    queryKey: ["public-order", token],
    queryFn: () => fetchPublicOrderStatus(token),
    refetchInterval: 8000,
  });

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("diner.trackOrder")}</h1>
      {order.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !order.data ? (
        <p className="text-sm text-muted-foreground">{t("diner.orderNotFound")}</p>
      ) : (
        <div className="panel space-y-3 p-6 text-center">
          <p className="text-xs text-muted-foreground">{t("diner.orderNumber")}</p>
          <p className="text-3xl font-bold">{order.data.order_number}</p>
          <Badge variant="secondary" className="text-sm">
            {STATUS_LABELS[order.data.status]?.[lang] ?? order.data.status}
          </Badge>
          <p className="text-sm font-medium">
            {formatMoney(order.data.total, order.data.currency, lang)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(order.data.created_at, lang)}
          </p>
        </div>
      )}
    </div>
  );
}
