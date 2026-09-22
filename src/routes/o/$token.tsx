import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ReceiptText } from "lucide-react";

import { PublicGuestShell } from "@/components/public/PublicGuestShell";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublicOrderReceipt } from "@/lib/diner";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
  const ar = lang === "ar";

  const order = useQuery({
    queryKey: ["public-order-receipt", token],
    queryFn: () => fetchPublicOrderReceipt(token),
    refetchInterval: 8000,
  });

  if (order.isPending) {
    return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8"><Skeleton className="mx-auto h-[520px] max-w-2xl rounded-[24px]" /></main>;
  }

  if (!order.data) {
    return <PublicGuestShell title={t("diner.orderNotFound")} description={ar ? "تحقق من رابط الطلب أو اطلب المساعدة من أحد أفراد الفريق." : "Check the order link or ask a team member for help."}><div /></PublicGuestShell>;
  }

  const current = STEPS.indexOf(order.data.status);
  const cancelled = order.data.status === "cancelled";
  const complete = order.data.status === "served" || order.data.status === "paid";

  return (
    <PublicGuestShell
      eyebrow={ar ? "QuickServe · تتبع الطلب" : "QuickServe · Order tracking"}
      title={t("diner.trackOrder")}
      description={ar ? "تابع طلبك من المطبخ حتى يصل إلى طاولتك. يتم تحديث الحالة تلقائياً." : "Follow your order from kitchen to table. Status updates automatically."}
      status={{
        label: STATUS_LABELS[order.data.status]?.[lang] ?? order.data.status,
        tone: cancelled ? "red" : complete ? "green" : "orange",
      }}
      footer={<p className="text-center text-[10px] text-muted-foreground">{ar ? "آخر تحديث تلقائي كل عدة ثوانٍ." : "Updates automatically every few seconds."}</p>}
    >
      <div className="space-y-5">
        <section className="rounded-[18px] border border-border/80 bg-background p-5 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#e34d00]"><ReceiptText className="size-4.5" /></span>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">{t("diner.orderNumber")}</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-[-.04em] tabular-nums">#{order.data.order_number}</p>
        </section>

        {!cancelled ? (
          <section className="rounded-[18px] border border-border/80 bg-card p-4 sm:p-5">
            <h2 className="text-sm font-bold">{ar ? "رحلة الطلب" : "Order progress"}</h2>
            <ol className="mt-4 space-y-3">
              {STEPS.map((step, index) => {
                const done = current >= 0 && index <= current;
                const active = index === current;
                return (
                  <li key={step} className="relative flex items-start gap-3">
                    {index < STEPS.length - 1 ? <span className={cn("absolute start-[15px] top-8 h-[calc(100%+2px)] w-px", done ? "bg-orange-300" : "bg-border")} /> : null}
                    <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border text-xs font-bold", done ? "border-[#e85d2a] bg-[#e85d2a] text-white" : "border-border bg-card text-muted-foreground")}>
                      {done ? <CheckCircle2 className="size-4" /> : index + 1}
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className={cn("text-sm", active ? "font-bold text-foreground" : done ? "font-semibold text-foreground" : "text-muted-foreground")}>{STATUS_LABELS[step]?.[lang] ?? step}</p>
                      {active ? <p className="mt-0.5 text-[10px] text-muted-foreground">{ar ? "هذه هي الحالة الحالية لطلبك." : "This is your order’s current stage."}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="rounded-[18px] border border-border/80 bg-background p-4 sm:p-5">
          <div className="flex items-center gap-2"><Clock3 className="size-4 text-[#e85d2a]" /><h2 className="text-sm font-bold">{ar ? "ملخص الفاتورة" : "Receipt summary"}</h2></div>
          <div className="mt-4 space-y-2.5 text-sm">
            <ReceiptRow label={ar ? "المجموع الفرعي" : "Subtotal"} value={formatMoney(order.data.subtotal, order.data.currency, lang)} />
            {order.data.discount_amount > 0 ? <ReceiptRow label={ar ? "الخصم" : "Discount"} value={`-${formatMoney(order.data.discount_amount, order.data.currency, lang)}`} /> : null}
            {order.data.tax_amount > 0 ? <ReceiptRow label={ar ? "الضريبة" : "Tax"} value={formatMoney(order.data.tax_amount, order.data.currency, lang)} /> : null}
            {order.data.service_amount > 0 ? <ReceiptRow label={ar ? "الخدمة" : "Service"} value={formatMoney(order.data.service_amount, order.data.currency, lang)} /> : null}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-bold"><span>{ar ? "الإجمالي" : "Total"}</span><span className="font-display text-lg">{formatMoney(order.data.total, order.data.currency, lang)}</span></div>
            <p className="pt-1 text-end text-[10px] text-muted-foreground">{formatDateTime(order.data.created_at, lang)}</p>
          </div>
        </section>
      </div>
    </PublicGuestShell>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{value}</span></div>;
}

const STEPS = ["new", "accepted", "preparing", "ready", "served"];
