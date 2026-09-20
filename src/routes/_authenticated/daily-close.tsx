import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardCheck, Package, Receipt, RotateCcw, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader } from "@/components/app/MasterPage";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/daily-close")({
  head: () => ({
    meta: [
      { title: "Manager Daily Close — QuickServe" },
      { name: "description", content: "Finalize immutable daily restaurant close snapshots with cash, payments, labor and inventory controls." },
    ],
  }),
  component: DailyClosePage,
});

type Summary = {
  date: string;
  timezone: string;
  orders: { count:number; cancelled:number; paid_total:number; tax:number; service:number; discounts:number; delivery:number; tips:number };
  payments: { gross:number; refunds:number; net:number; tips:number; cash:number; card:number; wallet:number; gift_card:number; other:number };
  cash: { sessions:number; open_sessions:number; opening_float:number; closing_cash:number; expected_cash:number; variance:number };
  labor: { staff_count:number; hours:number };
  inventory: { movement_count:number; unusual_movements:number; unusual_value:number };
};

type CloseRow = {
  id:string;
  close_date:string;
  status:"draft"|"finalized"|"reopened";
  snapshot:Summary|Record<string,unknown>;
  notes:string;
  finalized_at:string|null;
  reopened_at:string|null;
  reopen_reason:string|null;
};

function today() {
  return new Date().toLocaleDateString("en-CA");
}

function DailyClosePage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canClose = Boolean(access.isSuperAdmin || (membership && (
    membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant")
    || membershipHasCapability(membership.role, membership.permission_overrides, "manage_payments")
  )));
  const canReopen = Boolean(access.isSuperAdmin || (membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant")));
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const query = useQuery({
    queryKey: ["manager-daily-close", rid, date],
    enabled: Boolean(rid && membership),
    queryFn: async () => {
      const [summaryRes, closeRes] = await Promise.all([
        (supabase as any).rpc("get_manager_daily_close_summary", { _restaurant_id: rid, _close_date: date }),
        (supabase as any).from("manager_daily_closes")
          .select("id,close_date,status,snapshot,notes,finalized_at,reopened_at,reopen_reason")
          .eq("restaurant_id", rid!)
          .eq("close_date", date)
          .maybeSingle(),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      if (closeRes.error) throw closeRes.error;
      return {
        live: summaryRes.data as Summary,
        close: (closeRes.data ?? null) as CloseRow | null,
      };
    },
  });

  const finalize = useMutation({
    mutationFn: async () => {
      if (!rid) throw new Error("Restaurant required");
      const { data, error } = await (supabase as any).rpc("finalize_manager_daily_close", {
        _restaurant_id: rid,
        _close_date: date,
        _notes: notes.trim(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["manager-daily-close", rid, date] });
      setNotes("");
      toast.success(ar ? "تم إقفال اليوم وحفظ لقطة غير قابلة للتعديل." : "Day finalized and immutable close snapshot saved.");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const reopen = useMutation({
    mutationFn: async () => {
      if (!query.data?.close?.id) throw new Error("Close not found");
      const { error } = await (supabase as any).rpc("reopen_manager_daily_close", {
        _close_id: query.data.close.id,
        _reason: reopenReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["manager-daily-close", rid, date] });
      setReopenReason("");
      toast.success(ar ? "تمت إعادة فتح الإقفال مع تسجيل السبب." : "Daily close reopened with an audit reason.");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[560px] rounded-3xl" /></main></div>;
  if (!rid || !membership) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><ClipboardCheck className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "لا يوجد مطعم محدد" : "No restaurant selected"}</h1></section></main></div>;

  const close = query.data?.close ?? null;
  const summary = close?.status === "finalized" && close.snapshot && Object.keys(close.snapshot).length
    ? close.snapshot as Summary
    : query.data?.live;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "إقفال اليوم" : "Daily Close"} />
    <main className="qs-page space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={ClipboardCheck}>{ar ? "رقابة المدير" : "Manager control"}</MasterEyebrow>}
        title={ar ? "إقفال يومي موثق" : "Auditable daily close"}
        description={ar ? "راجع المبيعات، المدفوعات، الصندوق، ساعات العمل وحركات المخزون قبل تثبيت لقطة اليوم." : "Review sales, payments, cash reconciliation, labor and inventory exceptions before locking the day."}
        actions={<label className="text-xs font-bold text-muted-foreground">{ar ? "التاريخ" : "Close date"}<Input type="date" value={date} onChange={(event) => setDate(event.target.value)} max={today()} className="mt-1.5 min-w-[190px] bg-card" /></label>}
      />

      {query.isPending ? <Skeleton className="h-[460px] rounded-3xl" /> : query.isError ? <section className="qs-card p-6 text-sm text-destructive" role="alert">{humanError(query.error, lang)}</section> : summary ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MasterKpi icon={Receipt} label={ar ? "صافي المدفوعات" : "Net payments"} value={formatMoney(Number(summary.payments.net), scope.currency, lang)} />
          <MasterKpi icon={Banknote} label={ar ? "الكاش" : "Cash"} value={formatMoney(Number(summary.payments.cash), scope.currency, lang)} tone="green" />
          <MasterKpi icon={Receipt} label={ar ? "البطاقات والمحافظ" : "Card + wallet"} value={formatMoney(Number(summary.payments.card) + Number(summary.payments.wallet), scope.currency, lang)} tone="blue" />
          <MasterKpi icon={UsersRound} label={ar ? "ساعات العمل" : "Labor hours"} value={`${Number(summary.labor.hours).toFixed(1)}h`} hint={`${formatNumber(summary.labor.staff_count, lang)} ${ar ? "موظف" : "staff"}`} tone="purple" />
          <MasterKpi icon={Package} label={ar ? "حركات غير اعتيادية" : "Inventory exceptions"} value={formatNumber(summary.inventory.unusual_movements, lang)} hint={formatMoney(Number(summary.inventory.unusual_value), scope.currency, lang)} tone={summary.inventory.unusual_movements ? "orange" : "slate"} />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <CloseCard title={ar ? "الطلبات والمبيعات" : "Orders & sales"} rows={[
            [ar ? "عدد الطلبات" : "Orders", formatNumber(summary.orders.count, lang)],
            [ar ? "الملغاة" : "Cancelled", formatNumber(summary.orders.cancelled, lang)],
            [ar ? "إجمالي الطلبات المدفوعة" : "Paid order total", formatMoney(Number(summary.orders.paid_total), scope.currency, lang)],
            [ar ? "الضريبة" : "Tax", formatMoney(Number(summary.orders.tax), scope.currency, lang)],
            [ar ? "الخدمة" : "Service", formatMoney(Number(summary.orders.service), scope.currency, lang)],
            [ar ? "الخصومات" : "Discounts", formatMoney(Number(summary.orders.discounts), scope.currency, lang)],
            [ar ? "التوصيل" : "Delivery", formatMoney(Number(summary.orders.delivery), scope.currency, lang)],
          ]} />
          <CloseCard title={ar ? "المدفوعات" : "Payments"} rows={[
            [ar ? "الإجمالي" : "Gross", formatMoney(Number(summary.payments.gross), scope.currency, lang)],
            [ar ? "الاستردادات" : "Refunds", formatMoney(Number(summary.payments.refunds), scope.currency, lang)],
            [ar ? "صافي" : "Net", formatMoney(Number(summary.payments.net), scope.currency, lang)],
            [ar ? "كاش" : "Cash", formatMoney(Number(summary.payments.cash), scope.currency, lang)],
            [ar ? "بطاقات" : "Card", formatMoney(Number(summary.payments.card), scope.currency, lang)],
            [ar ? "محفظة" : "Wallet", formatMoney(Number(summary.payments.wallet), scope.currency, lang)],
            [ar ? "بطاقات هدية" : "Gift card", formatMoney(Number(summary.payments.gift_card), scope.currency, lang)],
          ]} />
          <CloseCard title={ar ? "تسوية الصندوق" : "Cash reconciliation"} rows={[
            [ar ? "جلسات الصندوق" : "Cash sessions", formatNumber(summary.cash.sessions, lang)],
            [ar ? "جلسات مفتوحة" : "Open sessions", formatNumber(summary.cash.open_sessions, lang)],
            [ar ? "رصيد الافتتاح" : "Opening float", formatMoney(Number(summary.cash.opening_float), scope.currency, lang)],
            [ar ? "النقد المتوقع" : "Expected cash", formatMoney(Number(summary.cash.expected_cash), scope.currency, lang)],
            [ar ? "النقد الفعلي" : "Closing cash", formatMoney(Number(summary.cash.closing_cash), scope.currency, lang)],
            [ar ? "الفارق" : "Variance", formatMoney(Number(summary.cash.variance), scope.currency, lang)],
          ]} tone={Math.abs(Number(summary.cash.variance)) > 0.005 ? "warning" : undefined} />
        </section>

        <section className={cn("rounded-2xl border p-5", close?.status === "finalized" ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/10" : "bg-card")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">{close?.status === "finalized" ? <CheckCircle2 className="size-5 text-emerald-600" /> : <AlertTriangle className="size-5 text-amber-600" />}<h2 className="font-display text-xl font-bold">{close?.status === "finalized" ? (ar ? "اليوم مقفل" : "Day finalized") : close?.status === "reopened" ? (ar ? "تمت إعادة الفتح" : "Close reopened") : (ar ? "جاهز للمراجعة" : "Ready for review")}</h2></div>
              <p className="mt-2 text-sm text-muted-foreground">{close?.status === "finalized" ? (ar ? "الأرقام المعروضة من اللقطة المثبتة ولن تتغير مع البيانات اللاحقة." : "Displayed values come from the locked snapshot and will not change with later data.") : summary.cash.open_sessions > 0 ? (ar ? "أغلق كل جلسات الكاش قبل التثبيت." : "Close every cash drawer session before finalizing.") : (ar ? "بعد التثبيت تصبح لقطة اليوم غير قابلة للتعديل إلا بإعادة فتح موثقة." : "Finalizing creates an immutable snapshot; reopening requires an audited reason.")}</p>
              {close?.finalized_at ? <p className="mt-1 text-xs text-muted-foreground">{ar ? "وقت الإقفال: " : "Finalized: "}{new Date(close.finalized_at).toLocaleString(ar ? "ar-JO" : "en-US")}</p> : null}
              {close?.reopen_reason ? <p className="mt-2 text-xs text-amber-700">{ar ? "سبب إعادة الفتح: " : "Reopen reason: "}{close.reopen_reason}</p> : null}
            </div>

            {close?.status === "finalized" ? canReopen ? <div className="w-full max-w-md space-y-2"><Input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder={ar ? "سبب إعادة الفتح (إلزامي)" : "Reason for reopening (required)"} /><Button variant="outline" disabled={reopen.isPending || reopenReason.trim().length < 5} onClick={() => reopen.mutate()}><RotateCcw className="size-4" />{ar ? "إعادة فتح" : "Reopen close"}</Button></div> : null : canClose ? <div className="w-full max-w-md space-y-2"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} placeholder={ar ? "ملاحظات المدير (اختياري)" : "Manager notes (optional)"} /><Button disabled={finalize.isPending || summary.cash.open_sessions > 0} onClick={() => finalize.mutate()}><ClipboardCheck className="size-4" />{ar ? "تثبيت إقفال اليوم" : "Finalize daily close"}</Button></div> : null}
          </div>
        </section>
      </> : null}
    </main>
  </div>;
}

function Metric({ icon:Icon, label, value, hint }:{ icon:typeof Receipt; label:string; value:string; hint?:string }) {
  return <article className="qs-stat min-h-[112px] p-4"><div className="flex items-center gap-2 text-muted-foreground"><span className="grid size-9 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-4" /></span><p className="text-[11px] font-semibold">{label}</p></div><strong className="mt-3 block font-display text-xl tracking-[-.04em]">{value}</strong>{hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}</article>;
}

function CloseCard({ title, rows, tone }:{ title:string; rows:[string,string][]; tone?:"warning"|undefined }) {
  return <article className={cn("rounded-2xl border bg-card p-5", tone === "warning" && "border-amber-300")}><h3 className="font-display text-lg font-bold">{title}</h3><div className="mt-4 divide-y divide-border">{rows.map(([label,value]) => <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="text-muted-foreground">{label}</span><strong className="text-end tabular-nums">{value}</strong></div>)}</div></article>;
}
