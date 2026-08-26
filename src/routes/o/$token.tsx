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
    <div className="safe-top safe-bottom mx-auto w-full max-w-md space-y-4 px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold sm:text-xl">{t("diner.trackOrder")}</h1>
      {order.isPending ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : !order.data ? (
        <p className="text-sm text-muted-foreground">{t("diner.orderNotFound")}</p>
      ) : (
        <div className="panel space-y-5 p-5 sm:p-6">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{t("diner.orderNumber")}</p>
            <p className="text-3xl font-bold tabular-nums sm:text-4xl">
              {order.data.order_number}
            </p>
            <Badge variant="secondary" className="mt-2 text-sm">
              {STATUS_LABELS[order.data.status]?.[lang] ?? order.data.status}
            </Badge>
          </div>

          <ol className="space-y-2">
            {STEPS.map((step, index) => {
              const current = STEPS.indexOf(order.data?.status ?? "");
              const done = current >= 0 && index <= current;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={
                      done
                        ? "grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                        : "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {index + 1}
                  </span>
                  <span
                    className={
                      done ? "text-sm font-medium" : "text-sm text-muted-foreground"
                    }
                  >
                    {STATUS_LABELS[step]?.[lang] ?? step}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
            <span className="font-semibold">
              {formatMoney(order.data.total, order.data.currency, lang)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(order.data.created_at, lang)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const STEPS = ["new", "accepted", "preparing", "ready", "served"];
