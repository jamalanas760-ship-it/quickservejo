import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, CreditCard, Link2, Palette, Save, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformSettings, useRestaurantsWithStats } from "@/hooks/useSuperAdmin";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/super-admin/settings")({
  head: () => ({ meta: [{ title: "Settings — QuickServe admin" }] }),
  component: PlatformSettingsPage,
});

type Form = { platform_name: string; default_currency: string; default_language: string; default_theme: string; default_tax_rate: string };

function PlatformSettingsPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const queryClient = useQueryClient();
  const settings = usePlatformSettings();
  const restaurants = useRestaurantsWithStats();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data || form) return;
    setForm({ platform_name: settings.data.platform_name, default_currency: settings.data.default_currency, default_language: settings.data.default_language, default_theme: settings.data.default_theme, default_tax_rate: String(settings.data.default_tax_rate) });
  }, [settings.data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("platform_settings").update({ platform_name: form.platform_name.trim(), default_currency: form.default_currency.trim(), default_language: form.default_language, default_theme: form.default_theme, default_tax_rate: Number(form.default_tax_rate) || 0 }).eq("id", true);
      if (error) throw error;
      await logAudit("platform.settings_updated", { entity: "platform_settings" });
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success(t("common.saved"));
    } catch (error) { toast.error(humanError(error, lang)); } finally { setSaving(false); }
  }

  if (settings.isPending || !form) return <Skeleton className="h-[680px] rounded-2xl" />;
  const allRestaurants = restaurants.data ?? [];
  const activeSubs = allRestaurants.filter((restaurant) => restaurant.subscription_status === "active" || restaurant.subscription_status === "trialing").length;

  return (
    <div className="space-y-5">
      <header><h1 className="qs-page-title">{ar ? "الإعدادات" : "Settings"}</h1><p className="qs-page-subtitle">{ar ? "إدارة المنصة والفوترة والتراخيص والتكاملات." : "Manage platform defaults, billing, licenses, and integrations."}</p></header>

      <nav className="flex gap-2 overflow-x-auto border-b border-border pb-0">
        <span className="flex min-h-12 items-center gap-2 border-b-2 border-[#ff5a0a] px-4 text-sm font-bold text-[#ff5a0a]"><Settings className="size-4" />{ar ? "عام" : "General"}</span>
        <Link to="/super-admin/licenses" className="flex min-h-12 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"><CreditCard className="size-4" />{ar ? "الفوترة والتراخيص" : "Billing & Licenses"}</Link>
        <Link to="/super-admin/subscriptions" className="flex min-h-12 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-muted-foreground hover:text-foreground"><UsersRound className="size-4" />{ar ? "الاشتراكات" : "Subscriptions"}</Link>
        <span className="flex min-h-12 items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-muted-foreground"><Link2 className="size-4" />{ar ? "التكاملات" : "Integrations"}</span>
      </nav>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <section className="qs-card p-5 sm:p-6">
            <div className="flex items-center gap-3"><span className="qs-stat-icon"><Settings className="size-5" /></span><div><h2 className="qs-section-title">{ar ? "إعدادات المنصة" : "Platform General Settings"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "الاسم والقيم الافتراضية لكل المطاعم الجديدة." : "Name and defaults used by new restaurants."}</p></div></div>
            <div className="mt-6 space-y-4"><Field label={t("sa.settings.platformName")}><Input value={form.platform_name} onChange={(event) => setForm({ ...form, platform_name: event.target.value })} className="h-11" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={t("sa.field.currency")}><Input value={form.default_currency} onChange={(event) => setForm({ ...form, default_currency: event.target.value })} className="h-11" /></Field><Field label={t("sa.field.language")}><Select value={form.default_language} onValueChange={(value) => setForm({ ...form, default_language: value })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent></Select></Field><Field label={t("sa.settings.defaultTheme")}><Select value={form.default_theme} onValueChange={(value) => setForm({ ...form, default_theme: value })}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent></Select></Field><Field label={t("sa.field.tax")}><Input type="number" min="0" step="0.01" value={form.default_tax_rate} onChange={(event) => setForm({ ...form, default_tax_rate: event.target.value })} className="h-11" /></Field></div></div>
            <div className="mt-6 flex justify-end"><Button type="submit" disabled={saving} className="bg-[#ff5a0a] text-white hover:bg-[#e94f00]"><Save className="size-4" />{saving ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ التغييرات" : "Save Changes")}</Button></div>
          </section>
          <section className="qs-card p-5"><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-full bg-emerald-500/12 text-emerald-600"><ShieldCheck className="size-5" /></span><div><h2 className="font-bold">{t("sa.settings.security")}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("sa.settings.securityNote")}</p></div></div></section>
        </form>

        <aside className="space-y-4">
          <section className="qs-card p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-muted-foreground">{ar ? "اشتراكات المنصة" : "Platform Subscriptions"}</p><p className="mt-1 font-display text-3xl font-bold">{activeSubs}</p></div><span className="grid size-12 place-items-center rounded-full bg-orange-500/12 text-[#ff5a0a]"><CreditCard className="size-5" /></span></div><p className="mt-2 text-xs text-muted-foreground">{ar ? `${allRestaurants.length} مطعم على المنصة` : `${allRestaurants.length} restaurants on the platform`}</p><Link to="/super-admin/subscriptions" className="qs-button-primary mt-5 w-full">{ar ? "إدارة الاشتراكات" : "Manage Subscriptions"} →</Link></section>
          <section className="qs-card p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-500/12 text-blue-600"><UsersRound className="size-5" /></span><div><h2 className="font-bold">{ar ? "التراخيص وحدود المقاعد" : "Licenses & Seat Limits"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "راجع حدود المستخدمين والتراخيص لكل مطعم." : "Review user limits and licensing for every restaurant."}</p><Link to="/super-admin/licenses" className="qs-button-secondary mt-4">{ar ? "إدارة التراخيص" : "Manage Licenses"} →</Link></div></div></section>
          <section className="qs-card p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-500/12 text-violet-600"><Palette className="size-5" /></span><div><h2 className="font-bold">{ar ? "النمط الافتراضي" : "Default Experience"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? `الوضع الافتراضي: ${form.default_theme} · اللغة: ${form.default_language}` : `Default theme: ${form.default_theme} · language: ${form.default_language}`}</p></div></div></section>
          <section className="qs-card p-5"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-500/12 text-[#ff5a0a]"><Bell className="size-5" /></span><div><h2 className="font-bold">{ar ? "تنبيهات التشغيل" : "Operational Alerts"}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{ar ? "حالة المطاعم والتنبيهات تظهر من الشريط العلوي." : "Restaurant health and platform alerts are available from the top bar."}</p></div></div></section>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-bold">{label}</Label>{children}</div>; }
