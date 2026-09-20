import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CircleDollarSign, CreditCard, Minus, Plus, Receipt, RotateCcw, Wallet, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cashier")({
  head: () => ({
    meta: [
      { title: "Cashier & Payments — QuickServe" },
      { name: "description", content: "Restaurant payment settlement, split payments, refunds and cash reconciliation." },
    ],
  }),
  component: CashierPage,
});

type Bill = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  tip_amount: number;
  created_at: string;
  table: string | null;
};

type Payment = {
  id: string;
  order_id: string;
  transaction_type: "payment" | "refund" | "void";
  method: "cash" | "card" | "wallet" | "gift_card" | "other";
  amount: number;
  tip_amount: number;
  reference: string;
  status: string;
  created_at: string;
};

type CashSession = {
  id: string;
  opening_float: number;
  opened_at: string;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
  closed_at: string | null;
};

const METHODS = ["cash","card","wallet","gift_card","other"] as const;

function CashierPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const rid = scope.restaurantId;
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [amount, setAmount] = useState("");
  const [tip, setTip] = useState("0");
  const [reference, setReference] = useState("");
  const [splitWays, setSplitWays] = useState(2);
  const [openSessionDialog, setOpenSessionDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("0");
  const [closeSessionDialog, setCloseSessionDialog] = useState(false);
  const [closingCash, setClosingCash] = useState("");

  const query = useQuery({
    queryKey: ["cashier", "workspace", rid],
    enabled: Boolean(rid),
    refetchInterval: 10_000,
    queryFn: async () => {
      const [billsRes, paymentsRes, sessionsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id,order_number,status,payment_status,total,tip_amount,created_at,table:restaurant_tables(table_number)")
          .eq("restaurant_id", rid!)
          .neq("status", "cancelled")
          .order("created_at", { ascending: true })
          .limit(150),
        supabase
          .from("payment_transactions" as any)
          .select("id,order_id,transaction_type,method,amount,tip_amount,reference,status,created_at")
          .eq("restaurant_id", rid!)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("cash_sessions" as any)
          .select("id,opening_float,opened_at,closing_cash,expected_cash,variance,closed_at")
          .eq("restaurant_id", rid!)
          .order("opened_at", { ascending: false })
          .limit(20),
      ]);
      if (billsRes.error) throw billsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      const bills = (billsRes.data ?? []).map((row: any) => ({
        id: row.id,
        order_number: row.order_number,
        status: row.status,
        payment_status: row.payment_status,
        total: Number(row.total ?? 0),
        tip_amount: Number(row.tip_amount ?? 0),
        created_at: row.created_at,
        table: row.table?.table_number ?? null,
      })) as Bill[];
      const payments = (paymentsRes.data ?? []).map((row: any) => ({ ...row, amount: Number(row.amount ?? 0), tip_amount: Number(row.tip_amount ?? 0) })) as Payment[];
      const sessions = (sessionsRes.data ?? []).map((row: any) => ({
        ...row,
        opening_float: Number(row.opening_float ?? 0),
        closing_cash: row.closing_cash === null ? null : Number(row.closing_cash),
        expected_cash: row.expected_cash === null ? null : Number(row.expected_cash),
        variance: row.variance === null ? null : Number(row.variance),
      })) as CashSession[];
      return { bills, payments, sessions };
    },
  });

  const bills = query.data?.bills ?? [];
  const payments = query.data?.payments ?? [];
  const openSession = (query.data?.sessions ?? []).find((session) => !session.closed_at) ?? null;

  const netPaid = (orderId: string) => payments
    .filter((row) => row.order_id === orderId && row.status === "completed")
    .reduce((sum, row) => sum + (row.transaction_type === "payment" ? row.amount : row.transaction_type === "refund" ? -row.amount : 0), 0);

  const activeBills = useMemo(
    () => bills.filter((bill) => Math.max(0, bill.total - netPaid(bill.id)) > 0.001 && bill.payment_status !== "refunded"),
    [bills, payments],
  );
  const selected = bills.find((bill) => bill.id === selectedId) ?? null;
  const selectedPaid = selected ? netPaid(selected.id) : 0;
  const selectedDue = selected ? Math.max(0, selected.total - selectedPaid) : 0;
  const outstanding = activeBills.reduce((sum, bill) => sum + Math.max(0, bill.total - netPaid(bill.id)), 0);
  const cashCollected = payments.filter((row) => row.transaction_type === "payment" && row.method === "cash" && row.status === "completed").reduce((sum,row)=>sum+row.amount,0);
  const cardCollected = payments.filter((row) => row.transaction_type === "payment" && row.method === "card" && row.status === "completed").reduce((sum,row)=>sum+row.amount,0);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["cashier", "workspace", rid] }),
      qc.invalidateQueries({ queryKey: ["workspace"] }),
      qc.invalidateQueries({ queryKey: ["manage", "orders", rid] }),
    ]);
  };

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Order is required");
      const value = Number(amount || selectedDue);
      const tipValue = Number(tip || 0);
      if (!(value > 0)) throw new Error(ar ? "أدخل مبلغاً صحيحاً" : "Enter a valid payment amount");
      const { error } = await (supabase as any).rpc("record_order_payment", {
        _order_id: selected.id,
        _method: method,
        _amount: value,
        _tip: Math.max(0, tipValue),
        _reference: reference.trim(),
        _cash_session_id: method === "cash" ? openSession?.id ?? null : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(ar ? "تم تسجيل الدفعة" : "Payment recorded");
      setAmount("");
      setTip("0");
      setReference("");
      await refresh();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const refundMutation = useMutation({
    mutationFn: async (payment: Payment) => {
      const { error } = await (supabase as any).rpc("refund_order_payment", {
        _order_id: payment.order_id,
        _amount: payment.amount,
        _payment_id: payment.id,
        _reference: "Refund " + (payment.reference || payment.id.slice(0, 8)),
        _cash_session_id: payment.method === "cash" ? openSession?.id ?? null : null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(ar ? "تم تسجيل الاسترداد" : "Refund recorded");
      await refresh();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const openSessionMutation = useMutation({
    mutationFn: async () => {
      if (!rid) throw new Error(ar ? "اختر مطعماً أولاً" : "Select a restaurant first");
      const { error } = await (supabase as any).rpc("open_cash_session", {
        _restaurant_id: rid,
        _opening_float: Math.max(0, Number(openingFloat || 0)),
        _staff_id: null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpenSessionDialog(false);
      toast.success(ar ? "تم فتح صندوق الكاش" : "Cash session opened");
      await refresh();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const closeSessionMutation = useMutation({
    mutationFn: async () => {
      if (!openSession) return;
      const value = Number(closingCash);
      if (!Number.isFinite(value) || value < 0) throw new Error(ar ? "أدخل رصيد إغلاق صحيحاً" : "Enter a valid closing cash balance");
      const { error } = await (supabase as any).rpc("close_cash_session", {
        _session_id: openSession.id,
        _closing_cash: value,
        _notes: "",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setCloseSessionDialog(false);
      setClosingCash("");
      toast.success(ar ? "تم إغلاق صندوق الكاش" : "Cash session closed");
      await refresh();
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const selectedPayments = selected ? payments.filter((row) => row.order_id === selected.id) : [];

  return <div className="min-h-screen bg-background">
    <StaffHeader title={ar ? "الكاشير والمدفوعات" : "Cashier & Payments"} />
    <main className="qs-page space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><WalletCards className="size-3.5" />{ar ? "نقطة التسوية" : "Settlement desk"}</div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? "كل دفعة محسوبة ومطابقة" : "Every payment accounted for"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ar ? "دفعات جزئية، تقسيم الفاتورة، إكرامية، استرداد وتسوية كاش في مسار واحد." : "Partial payments, split bills, tips, refunds and cash reconciliation in one workflow."}</p>
          </div>
          {openSession ? <Button variant="outline" onClick={() => setCloseSessionDialog(true)}><Banknote className="size-4" />{ar ? "إغلاق الصندوق" : "Close cash session"}</Button> : <Button onClick={() => setOpenSessionDialog(true)}><Banknote className="size-4" />{ar ? "فتح الصندوق" : "Open cash session"}</Button>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Receipt} label={ar ? "فواتير مفتوحة" : "Open bills"} value={formatNumber(activeBills.length,lang)} />
        <Metric icon={CircleDollarSign} label={ar ? "مبلغ مستحق" : "Outstanding"} value={formatMoney(outstanding,scope.currency,lang)} />
        <Metric icon={Banknote} label={ar ? "كاش محصل" : "Cash collected"} value={formatMoney(cashCollected,scope.currency,lang)} />
        <Metric icon={CreditCard} label={ar ? "بطاقات" : "Card collected"} value={formatMoney(cardCollected,scope.currency,lang)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-5"><h2 className="font-display text-lg font-bold">{ar ? "الفواتير" : "Bills"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "اختر فاتورة لإضافة دفعة أو مراجعة ما تم تحصيله." : "Select a bill to add a payment or review its settlement history."}</p></div>
          {query.isPending ? <div className="p-5"><Skeleton className="h-72 rounded-2xl" /></div> : query.isError ? <p className="p-5 text-sm text-destructive">{humanError(query.error,lang)}</p> : !activeBills.length ? <div className="p-5"><EmptyState icon={<Wallet className="size-6"/>} title={ar?"لا فواتير مفتوحة":"No open bills"} description={ar?"كل الفواتير مسددة حالياً.":"Everything is settled right now."}/></div> : <div className="divide-y divide-border">{activeBills.map((bill)=>{
            const paid=netPaid(bill.id), due=Math.max(0,bill.total-paid);
            return <button key={bill.id} type="button" onClick={()=>{setSelectedId(bill.id);setAmount(String(due.toFixed(3)));}} className={cn("grid w-full gap-3 p-4 text-start transition hover:bg-muted/25 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center",selectedId===bill.id&&"bg-orange-500/5")}>
              <div className="min-w-0"><strong className="block truncate">{bill.order_number}</strong><p className="mt-1 text-xs text-muted-foreground">{bill.table?(ar?"طاولة ":"Table ")+bill.table+" · ":""}{formatDateTime(bill.created_at,lang)}</p></div>
              <div className="text-xs text-muted-foreground">{paid>0?(ar?"مدفوع ":"Paid ")+formatMoney(paid,scope.currency,lang):ar?"بدون دفعات":"No payments"}</div>
              <div className="text-end"><strong className="block">{formatMoney(due,scope.currency,lang)}</strong><span className="text-[10px] text-muted-foreground">{ar?"متبقي":"due"}</span></div>
            </button>;
          })}</div>}
        </div>

        <aside className="overflow-hidden rounded-2xl border border-border bg-card self-start xl:sticky xl:top-24">
          {!selected ? <div className="grid min-h-[420px] place-items-center p-8 text-center"><div><Receipt className="mx-auto size-9 text-muted-foreground"/><h3 className="mt-3 font-bold">{ar?"اختر فاتورة":"Select a bill"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar?"تفاصيل الدفعات ستظهر هنا.":"Payment details will appear here."}</p></div></div> : <>
            <div className="border-b border-border p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold">{selected.order_number}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.table?(ar?"طاولة ":"Table ")+selected.table:"Dine in"}</p></div><Badge variant={selectedDue<=.001?"secondary":"outline"}>{selectedDue<=.001?(ar?"مسدد":"Paid"):(ar?"مفتوح":"Open")}</Badge></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><Summary label={ar?"الإجمالي":"Total"} value={formatMoney(selected.total,scope.currency,lang)}/><Summary label={ar?"مدفوع":"Paid"} value={formatMoney(selectedPaid,scope.currency,lang)}/><Summary label={ar?"المتبقي":"Due"} value={formatMoney(selectedDue,scope.currency,lang)}/></div></div>
            <div className="space-y-4 p-5">
              {selectedDue>.001 ? <>
                <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={()=>setAmount(String((selectedDue/Math.max(1,splitWays)).toFixed(3)))}><Minus className="size-4"/>{ar?"حصة":"Split"}</Button><div className="flex items-center justify-center gap-2 rounded-xl border border-border"><Button type="button" size="icon" variant="ghost" onClick={()=>setSplitWays(v=>Math.max(2,v-1))}><Minus className="size-3.5"/></Button><strong className="text-sm">{splitWays}</strong><Button type="button" size="icon" variant="ghost" onClick={()=>setSplitWays(v=>Math.min(20,v+1))}><Plus className="size-3.5"/></Button></div></div>
                <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs"><span>{ar?"طريقة الدفع":"Method"}</span><Select value={method} onValueChange={(value)=>{setMethod(value as typeof method);if(value==="gift_card")setTip("0");}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{METHODS.map(item=><SelectItem key={item} value={item}>{methodLabel(item,ar)}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-xs"><span>{ar?"المبلغ":"Amount"}</span><Input type="number" min="0.001" max={selectedDue} step="0.001" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="space-y-1.5 text-xs"><span>{ar?"إكرامية":"Tip"}</span><Input type="number" min="0" step="0.001" value={tip} disabled={method==="gift_card"} onChange={e=>setTip(e.target.value)}/>{method==="gift_card"?<span className="block text-[10px] text-muted-foreground">{ar?"بطاقات الهدايا لا تمول الإكرامية.":"Gift cards cannot be used for tips."}</span>:null}</label><label className="space-y-1.5 text-xs"><span>{method==="gift_card"?(ar?"رمز بطاقة الهدية":"Gift card code"):(ar?"مرجع":"Reference")}</span><Input value={reference} onChange={e=>setReference(e.target.value)} autoCapitalize={method==="gift_card"?"characters":"off"} placeholder={method==="card"?"AUTH-1234":method==="gift_card"?"AB12CD34EF56":""}/>{method==="gift_card"?<span className="block text-[10px] text-muted-foreground">{ar?"سيتم خصم الرصيد والتحقق منه قبل اعتماد الدفعة.":"Balance is validated and deducted atomically before settlement."}</span>:null}</label></div>
                <Button className="w-full" disabled={paymentMutation.isPending||!(Number(amount)>0)||(method==="gift_card"&&!reference.trim())} onClick={()=>paymentMutation.mutate()}>{methodIcon(method)}{ar?"تسجيل الدفعة":"Record payment"}</Button>
              </> : null}

              <div><h3 className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{ar?"سجل الدفعات":"Payment history"}</h3><div className="mt-2 space-y-2">{selectedPayments.length?selectedPayments.map(payment=><div key={payment.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><div className="flex items-center gap-2"><strong className="text-xs capitalize">{payment.transaction_type} · {methodLabel(payment.method,ar)}</strong>{payment.transaction_type==="refund"?<Badge variant="destructive">{ar?"استرداد":"Refund"}</Badge>:null}</div><p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(payment.created_at,lang)}{payment.reference?" · "+payment.reference:""}</p></div><div className="text-end"><strong className={cn("text-sm",payment.transaction_type==="refund"&&"text-red-600")}>{payment.transaction_type==="refund"?"−":""}{formatMoney(payment.amount,scope.currency,lang)}</strong>{payment.transaction_type==="payment"?<Button size="sm" variant="ghost" className="mt-1 h-6 px-2 text-[10px]" disabled={refundMutation.isPending} onClick={()=>refundMutation.mutate(payment)}><RotateCcw className="size-3"/>{ar?"استرداد":"Refund"}</Button>:null}</div></div>):<p className="py-4 text-xs text-muted-foreground">{ar?"لا توجد دفعات بعد.":"No payments yet."}</p>}</div></div>
            </div>
          </>}
        </aside>
      </section>
    </main>

    <Dialog open={openSessionDialog} onOpenChange={setOpenSessionDialog}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>{ar?"فتح صندوق الكاش":"Open cash session"}</DialogTitle><DialogDescription>{ar?"أدخل الرصيد الافتتاحي للصندوق قبل بدء التحصيل النقدي.":"Enter the opening cash float before collecting cash."}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>{ar?"الرصيد الافتتاحي":"Opening float"} ({scope.currency})</span><Input type="number" min="0" step="0.001" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)}/></label><DialogFooter><Button variant="outline" onClick={()=>setOpenSessionDialog(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={openSessionMutation.isPending} onClick={()=>openSessionMutation.mutate()}>{ar?"فتح":"Open"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={closeSessionDialog} onOpenChange={setCloseSessionDialog}><DialogContent className="sm:max-w-sm"><DialogHeader><DialogTitle>{ar?"إغلاق صندوق الكاش":"Close cash session"}</DialogTitle><DialogDescription>{openSession?(ar?"مفتوح منذ ":"Opened ")+formatDateTime(openSession.opened_at,lang):""}</DialogDescription></DialogHeader><label className="space-y-2 text-sm"><span>{ar?"الكاش الفعلي عند الإغلاق":"Actual closing cash"} ({scope.currency})</span><Input type="number" min="0" step="0.001" value={closingCash} onChange={e=>setClosingCash(e.target.value)}/></label><DialogFooter><Button variant="outline" onClick={()=>setCloseSessionDialog(false)}>{ar?"إلغاء":"Cancel"}</Button><Button disabled={closeSessionMutation.isPending||closingCash===""} onClick={()=>closeSessionMutation.mutate()}>{ar?"إغلاق وتسوية":"Close & reconcile"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function Metric({icon:Icon,label,value}:{icon:typeof Receipt;label:string;value:string}) { return <article className="qs-stat flex min-h-[106px] items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>; }
function Summary({label,value}:{label:string;value:string}) { return <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] text-muted-foreground">{label}</p><strong className="mt-1 block text-sm">{value}</strong></div>; }
function methodLabel(method:Payment["method"],ar:boolean){ const map:Record<Payment["method"],[string,string]>={cash:["Cash","نقدي"],card:["Card","بطاقة"],wallet:["Wallet","محفظة"],gift_card:["Gift card","بطاقة هدية"],other:["Other","أخرى"]}; return map[method][ar?1:0]; }
function methodIcon(method:Payment["method"]){ return method==="cash"?<Banknote className="size-4"/>:method==="card"?<CreditCard className="size-4"/>:method==="gift_card"?<GiftIcon/>:<WalletCards className="size-4"/>; }
function GiftIcon(){ return <WalletCards className="size-4"/>; }
