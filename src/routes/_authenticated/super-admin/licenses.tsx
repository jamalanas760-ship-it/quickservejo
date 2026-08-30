import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, CheckCircle2, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { humanError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import type { SubscriptionPlan } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/super-admin/licenses")({
  head: () => ({ meta: [{ title: "Restaurant licenses — QuickServe" }] }),
  component: LicensesPage,
});

const PLANS: SubscriptionPlan[] = ["free", "basic", "professional", "enterprise"];

function LicensesPage() {
  const { lang } = useI18n();
  const { data, isPending, isError, error, refetch } = useRestaurantsWithStats();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function saveLicense(id: string, plan: SubscriptionPlan, fallbackLimit: number) {
    const raw = drafts[id] ?? String(fallbackLimit);
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      toast.error(lang === "ar" ? "أدخل عدد مستخدمين صحيح بين 1 و10000" : "Enter a valid user limit between 1 and 10,000");
      return;
    }
    setSaving(id);
    try {
      const { error: rpcError } = await supabase.rpc("set_restaurant_license" as never, {
        p_restaurant_id: id,
        p_user_limit: limit,
        p_license: plan,
      } as never);
      if (rpcError) throw rpcError;
      await refetch();
      toast.success(lang === "ar" ? "تم تحديث ترخيص المطعم" : "Restaurant license updated");
    } catch (e) {
      toast.error(humanError(e, lang));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{lang === "ar" ? "تراخيص المطاعم" : "Restaurant licenses"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{lang === "ar" ? "المالك يتحكم بعدد المستخدمين والترخيص لكل بيئة." : "The Owner controls the user capacity and license for every restaurant environment."}</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="panel p-4"><Building2 className="size-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">{lang === "ar" ? "المطاعم" : "Restaurants"}</p><p className="text-2xl font-semibold">{formatNumber(data?.length ?? 0, lang)}</p></div>
        <div className="panel p-4"><Users className="size-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">{lang === "ar" ? "المستخدمون" : "Active users"}</p><p className="text-2xl font-semibold">{formatNumber((data ?? []).reduce((n, r) => n + r.staffCount, 0), lang)}</p></div>
        <div className="panel col-span-2 p-4 sm:col-span-1"><CheckCircle2 className="size-4 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">{lang === "ar" ? "السعة المرخصة" : "Licensed capacity"}</p><p className="text-2xl font-semibold">{formatNumber((data ?? []).reduce((n, r) => n + r.user_limit, 0), lang)}</p></div>
      </section>

      {isError ? <div className="panel p-6"><p className="font-medium">{lang === "ar" ? "تعذر تحميل التراخيص" : "Unable to load licenses"}</p><p className="mt-1 text-sm text-muted-foreground">{humanError(error, lang)}</p><Button size="sm" className="mt-4" onClick={() => void refetch()}>Retry</Button></div> : null}

      {isPending ? <div className="space-y-3">{[1,2,3].map((x) => <Skeleton key={x} className="h-44 rounded-2xl" />)}</div> : (
        <div className="space-y-3">
          {(data ?? []).map((r) => {
            const limit = r.user_limit;
            const used = r.staffCount;
            const percent = Math.min(100, Math.round((used / limit) * 100));
            const plan = r.subscription_plan as SubscriptionPlan;
            return (
              <article key={r.id} className="panel p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
                      {r.logo_url ? <img src={r.logo_url} alt="" className="size-full object-cover" /> : <Building2 className="size-5 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0"><h2 className="truncate font-semibold">{r.name}</h2><p className="truncate text-xs text-muted-foreground">/{r.slug}</p></div>
                    <Badge variant={r.is_active ? "secondary" : "destructive"}>{r.is_active ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "متوقف" : "Inactive")}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] lg:w-[38rem]">
                    <div className="space-y-1.5"><div className="flex justify-between text-xs"><span className="text-muted-foreground">{lang === "ar" ? "المستخدمون" : "Users"}</span><span className="font-medium">{used} / {limit}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div></div>
                    <Select defaultValue={plan} onValueChange={(v) => { setDrafts((d) => ({ ...d, [`${r.id}:plan`]: v })); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input inputMode="numeric" type="number" min={1} max={10000} value={drafts[r.id] ?? String(limit)} onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} className="w-28" aria-label="User limit" />
                      <Button disabled={saving === r.id} onClick={() => void saveLicense(r.id, (drafts[`${r.id}:plan`] as SubscriptionPlan) ?? plan, limit)}>{saving === r.id ? "Saving…" : "Save"}</Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
