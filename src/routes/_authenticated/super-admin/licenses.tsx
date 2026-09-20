import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { MasterEyebrow, MasterKpi, MasterPageHeader, MasterSection, MasterStatus } from "@/components/app/MasterPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRestaurantsWithStats, type RestaurantWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { SubscriptionPlan } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/super-admin/licenses")({
  head: () => ({ meta: [{ title: "Restaurant licenses — QuickServe" }] }),
  component: LicensesPage,
});

const PLANS: SubscriptionPlan[] = ["free", "basic", "professional", "enterprise"];
type Restaurant = Database["public"]["Tables"]["restaurants"]["Row"];

function defaultLimit(r: Restaurant) {
  if (r.seat_limit != null) return r.seat_limit;
  if (r.subscription_plan === "free" || r.subscription_plan === "basic") return 3;
  if (r.subscription_plan === "professional") return 10;
  return 50;
}

function LicensesPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const { data, isPending, isError, error, refetch } = useRestaurantsWithStats();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<Record<string, SubscriptionPlan>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const totalLicensed = useMemo(() => (data ?? []).reduce((n, r) => n + (r.seat_limit ?? defaultLimit(r)), 0), [data]);
  const totalUsers = useMemo(() => (data ?? []).reduce((n, r) => n + r.staffCount, 0), [data]);
  const nearCapacity = useMemo(() => (data ?? []).filter((r) => {
    const limit = r.seat_limit ?? defaultLimit(r);
    return limit > 0 && r.staffCount / limit >= 0.8;
  }).length, [data]);

  async function saveLicense(r: RestaurantWithStats) {
    const raw = drafts[r.id] ?? String(r.seat_limit ?? defaultLimit(r));
    const limit = Number(raw);
    const plan = plans[r.id] ?? r.subscription_plan;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      toast.error(ar ? "أدخل عدد مستخدمين صحيح بين 1 و10000" : "Enter a valid user limit between 1 and 10,000");
      return;
    }
    if (limit < r.staffCount) {
      toast.error(ar ? `لا يمكن أن يكون الترخيص أقل من المستخدمين الحاليين (${r.staffCount})` : `License cannot be lower than current active users (${r.staffCount})`);
      return;
    }
    setSaving(r.id);
    try {
      const { data: updated, error: updateError } = await supabase
        .from("restaurants")
        .update({ seat_limit: limit, subscription_plan: plan })
        .eq("id", r.id)
        .select("id, seat_limit, subscription_plan")
        .single();
      if (updateError) throw updateError;
      if (!updated || updated.id !== r.id) throw new Error("License was not saved");
      await refetch();
      toast.success(ar ? "تم حفظ ترخيص المطعم بنجاح" : "Restaurant license saved successfully");
    } catch (e) {
      toast.error(humanError(e, lang));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={ShieldCheck}>{ar ? "التراخيص والسعة" : "Licensing & capacity"}</MasterEyebrow>}
        title={ar ? "تراخيص المطاعم" : "Restaurant licenses"}
        description={ar ? "تحكم بعدد المستخدمين والخطة وسعة كل مطعم من مكان واحد." : "Control plan assignment, user capacity and licensing for every restaurant from one workspace."}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MasterKpi icon={Building2} label={ar ? "المطاعم" : "Restaurants"} value={formatNumber(data?.length ?? 0, lang)} tone="slate" />
        <MasterKpi icon={Users} label={ar ? "المستخدمون النشطون" : "Active users"} value={formatNumber(totalUsers, lang)} tone="blue" />
        <MasterKpi icon={CheckCircle2} label={ar ? "السعة المرخصة" : "Licensed capacity"} value={formatNumber(totalLicensed, lang)} tone="green" />
        <MasterKpi icon={ShieldCheck} label={ar ? "قريبة من الحد" : "Near capacity"} value={formatNumber(nearCapacity, lang)} hint={ar ? "استخدام 80% أو أكثر" : "80%+ seat utilization"} tone={nearCapacity ? "orange" : "purple"} />
      </section>

      <MasterSection title={ar ? "تراخيص المطاعم" : "Restaurant licensing"} description={ar ? "عدّل الخطة وحد المستخدمين لكل مطعم مع رؤية واضحة للاستخدام." : "Adjust plan and user limit while monitoring current seat utilization."}>
        {isError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/15">
            <p className="font-semibold">{ar ? "تعذر تحميل التراخيص" : "Unable to load licenses"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{humanError(error, lang)}</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => void refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button>
          </div>
        ) : null}

        {isPending ? (
          <div className="space-y-3">{[1, 2, 3].map((x) => <Skeleton key={x} className="h-40 rounded-2xl" />)}</div>
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((r) => {
              const limit = r.seat_limit ?? defaultLimit(r);
              const used = r.staffCount;
              const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              const plan = plans[r.id] ?? r.subscription_plan;
              const warning = percent >= 80;
              return (
                <article key={r.id} className="rounded-2xl border border-border/85 bg-card p-4 transition hover:border-foreground/10 hover:shadow-[var(--qs-shadow-hover)] sm:p-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(520px,.9fr)] xl:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-muted">
                        {r.logo_url ? <img src={r.logo_url} alt="" className="size-full object-cover" /> : <Building2 className="size-5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-bold">{r.name}</h2>
                          <MasterStatus tone={r.is_active ? "green" : "red"}>{r.is_active ? (ar ? "نشط" : "Active") : (ar ? "متوقف" : "Inactive")}</MasterStatus>
                          <MasterStatus tone={plan === "enterprise" ? "purple" : plan === "professional" ? "orange" : "slate"}>{plan}</MasterStatus>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">/{r.slug}</p>
                        <div className="mt-3 max-w-md">
                          <div className="flex items-center justify-between gap-3 text-[11px]">
                            <span className="text-muted-foreground">{ar ? "استخدام المستخدمين" : "Seat utilization"}</span>
                            <strong className={warning ? "text-amber-700" : ""}>{used} / {limit} · {percent}%</strong>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className={warning ? "h-full rounded-full bg-amber-500 transition-all" : "h-full rounded-full bg-[#ff5a0a] transition-all"} style={{ width: `${Math.max(2, percent)}%` }} /></div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(160px,1fr)_minmax(150px,190px)_auto] sm:items-end">
                      <label className="space-y-1.5"><span className="text-[10px] font-bold text-muted-foreground">{ar ? "الخطة" : "Plan"}</span><Select value={plan} onValueChange={(v) => setPlans((p) => ({ ...p, [r.id]: v as SubscriptionPlan }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></label>
                      <label className="space-y-1.5"><span className="text-[10px] font-bold text-muted-foreground">{ar ? "حد المستخدمين" : "User limit"}</span><Input inputMode="numeric" type="number" min={1} max={10000} value={drafts[r.id] ?? String(limit)} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} aria-label="User license limit" /></label>
                      <Button disabled={saving === r.id} onClick={() => void saveLicense(r)}>{saving === r.id ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save")}</Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </MasterSection>
    </div>
  );
}
