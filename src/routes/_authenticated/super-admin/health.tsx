import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Gauge, Server, TriangleAlert } from "lucide-react";

import { MasterEyebrow, MasterKpi, MasterPageHeader, MasterSection } from "@/components/app/MasterPage";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/super-admin/health")({
  head: () => ({
    meta: [
      { title: "Platform health — QuickServe admin" },
      { name: "description", content: "QuickServe runtime errors, performance signals and platform health." },
    ],
  }),
  component: HealthPage,
});

type EventRow = {
  id: string;
  restaurant_id: string | null;
  severity: "info" | "warning" | "error" | "critical";
  source: string;
  event_type: string;
  message: string;
  route: string | null;
  created_at: string;
};

type MetricRow = {
  metric: "LCP" | "CLS" | "INP" | "TTFB" | "route_load";
  value: number;
  route: string;
  device: string | null;
  created_at: string;
};

function HealthPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const query = useQuery({
    queryKey: ["platform", "health"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [eventsRes, metricsRes] = await Promise.all([
        supabase.from("system_events" as any).select("id,restaurant_id,severity,source,event_type,message,route,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(200),
        supabase.from("performance_samples" as any).select("metric,value,route,device,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (metricsRes.error) throw metricsRes.error;
      return {
        events: (eventsRes.data ?? []) as unknown as EventRow[],
        metrics: (metricsRes.data ?? []) as unknown as MetricRow[],
      };
    },
  });

  if (query.isPending) return <Skeleton className="h-[620px] rounded-3xl" />;
  if (query.isError) return <section className="qs-card p-8 text-center"><TriangleAlert className="mx-auto size-10 text-destructive" /><h1 className="mt-4 text-xl font-bold">{ar ? "تعذر تحميل صحة المنصة" : "Platform health could not load"}</h1><p className="mt-2 text-sm text-muted-foreground">{query.error instanceof Error ? query.error.message : String(query.error)}</p></section>;

  const events = query.data?.events ?? [];
  const metrics = query.data?.metrics ?? [];
  const critical = events.filter((row) => row.severity === "critical").length;
  const errors = events.filter((row) => row.severity === "error").length;
  const warnings = events.filter((row) => row.severity === "warning").length;

  const avg = (metric: MetricRow["metric"]) => {
    const values = metrics.filter((row) => row.metric === metric).map((row) => Number(row.value)).filter(Number.isFinite);
    return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
  };
  const p75 = (metric: MetricRow["metric"]) => {
    const values = metrics.filter((row) => row.metric === metric).map((row) => Number(row.value)).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!values.length) return 0;
    return values[Math.min(values.length - 1, Math.floor(values.length * .75))] ?? 0;
  };

  const lcp = p75("LCP");
  const inp = p75("INP");
  const cls = p75("CLS");
  const ttfb = avg("TTFB");
  const healthy = critical === 0 && errors < 5 && (lcp === 0 || lcp <= 2500) && (inp === 0 || inp <= 200) && (cls === 0 || cls <= .1);

  return <div className="space-y-5">
    <MasterPageHeader
      eyebrow={<MasterEyebrow icon={Server}>{ar ? "مراقبة المنصة" : "Platform observability"}</MasterEyebrow>}
      title={ar ? "صحة وأداء المنصة" : "Platform health & performance"}
      description={ar ? "أخطاء الواجهة وإشارات الأداء خلال آخر 24 ساعة في مكان واحد." : "Runtime errors and performance signals from the last 24 hours in one operational control center."}
      actions={<span className={cn("inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-bold", healthy ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>{healthy ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}{healthy ? (ar ? "الوضع طبيعي" : "Healthy") : (ar ? "يحتاج مراجعة" : "Needs review")}</span>}
    />

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MasterKpi icon={TriangleAlert} label={ar ? "أخطاء" : "Errors"} value={formatNumber(errors + critical, lang)} tone={errors + critical ? "red" : "green"} />
      <MasterKpi icon={Gauge} label="LCP p75" value={lcp ? Math.round(lcp) + " ms" : "—"} tone={lcp && lcp > 2500 ? "orange" : "green"} />
      <MasterKpi icon={Activity} label="INP p75" value={inp ? Math.round(inp) + " ms" : "—"} tone={inp && inp > 200 ? "orange" : "green"} />
      <MasterKpi icon={Server} label="CLS p75" value={cls ? cls.toFixed(3) : "—"} tone={cls && cls > .1 ? "orange" : "green"} />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5"><h2 className="font-display text-lg font-bold">{ar ? "أحداث النظام" : "System events"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "أحدث الأخطاء والتحذيرات المسجلة من التطبيق." : "Recent runtime errors and warnings captured from the app."}</p></div>
        {!events.length ? <div className="grid min-h-[280px] place-items-center p-8 text-center"><div><CheckCircle2 className="mx-auto size-9 text-emerald-600" /><h3 className="mt-3 font-bold">{ar ? "لا توجد أخطاء مسجلة" : "No errors recorded"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "لا توجد أحداث خلال آخر 24 ساعة." : "No runtime events were recorded in the last 24 hours."}</p></div></div> : <div className="divide-y divide-border">{events.slice(0,40).map((event)=><article key={event.id} className="p-4"><div className="flex items-start gap-3"><span className={cn("mt-0.5 size-2.5 shrink-0 rounded-full",event.severity==="critical"||event.severity==="error"?"bg-red-500":event.severity==="warning"?"bg-amber-500":"bg-blue-500")} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{event.event_type}</strong><span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">{event.source}</span></div><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{event.message}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground"><span>{formatDateTime(event.created_at,lang)}</span>{event.route?<span>{event.route}</span>:null}{event.restaurant_id?<span>{event.restaurant_id.slice(0,8)}</span>:null}</div></div></div></article>)}</div>}
      </div>

      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">{ar ? "ميزانية الأداء" : "Performance budget"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الهدف: LCP ≤ 2.5s، INP ≤ 200ms، CLS ≤ 0.1." : "Targets: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1."}</p><div className="mt-4 space-y-3"><Budget label="LCP" value={lcp} limit={2500} suffix="ms" /><Budget label="INP" value={inp} limit={200} suffix="ms" /><Budget label="CLS" value={cls} limit={.1} suffix="" /><Budget label="TTFB avg" value={ttfb} limit={800} suffix="ms" /></div></section>
        <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">{ar ? "ملخص آخر 24 ساعة" : "Last 24 hours"}</h2><div className="mt-4 grid grid-cols-2 gap-3"><Mini label={ar?"تحذيرات":"Warnings"} value={formatNumber(warnings,lang)} /><Mini label={ar?"عينات الأداء":"Performance samples"} value={formatNumber(metrics.length,lang)} /><Mini label={ar?"حرجة":"Critical"} value={formatNumber(critical,lang)} /><Mini label={ar?"أخطاء":"Errors"} value={formatNumber(errors,lang)} /></div></section>
      </div>
    </section>
  </div>;
}

function HealthMetric({icon:Icon,label,value,tone}:{icon:typeof Server;label:string;value:string;tone:"ok"|"warning"|"danger"}) {
  return <article className="qs-stat flex min-h-[110px] items-center gap-4 p-4"><span className={cn("grid size-11 place-items-center rounded-2xl",tone==="danger"?"bg-red-500/10 text-red-600":tone==="warning"?"bg-amber-500/10 text-amber-700":"bg-emerald-500/10 text-emerald-700")}><Icon className="size-5"/></span><div><p className="text-[11px] font-semibold text-muted-foreground">{label}</p><strong className="mt-1 block font-display text-xl tracking-[-.03em]">{value}</strong></div></article>;
}
function Budget({label,value,limit,suffix}:{label:string;value:number;limit:number;suffix:string}) { const ratio=value?Math.min(100,(value/limit)*100):0; const good=!value||value<=limit; return <div><div className="flex justify-between gap-3 text-xs"><span>{label}</span><strong className={good?"text-emerald-700":"text-amber-700"}>{value?(value<1?value.toFixed(3):Math.round(value))+suffix:"—"}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full",good?"bg-emerald-500":"bg-amber-500")} style={{width:(ratio||2)+"%"}}/></div></div>; }
function Mini({label,value}:{label:string;value:string}) { return <div className="rounded-xl bg-muted/45 p-3"><p className="text-[10px] text-muted-foreground">{label}</p><strong className="mt-1 block text-lg">{value}</strong></div>; }
