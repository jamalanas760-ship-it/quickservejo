import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BarChart3, CreditCard, Link2, MessageSquareText, PlugZap, Printer, Truck, Webhook } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { MasterEyebrow, MasterPageHeader, MasterStatus } from "@/components/app/MasterPage";
import { DeveloperConnectPanel } from "@/components/integrations/DeveloperConnectPanel";
import { IntegrationOperationsPanel } from "@/components/integrations/IntegrationOperationsPanel";
import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { testIntegrationRuntime } from "@/lib/connect.functions";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "QuickServe Connect" }, { name: "description", content: "Payments, messaging, delivery, accounting, printing and API integrations." }] }),
  component: IntegrationsPage,
});

type Connection = {
  id: string;
  category: string;
  provider: string;
  display_name: string;
  status: string;
  credential_ref: string | null;
  config: Record<string, unknown>;
  capabilities: string[];
  last_tested_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

const PRESETS = [
  { category: "payments", provider: "stripe", name: "Stripe-compatible card gateway", icon: CreditCard, credential: "STRIPE_SECRET_KEY" },
  { category: "payments", provider: "mena_gateway", name: "Jordan / MENA payment gateway", icon: CreditCard, credential: "QUICKSERVE_PAYMENT_SECRET" },
  { category: "messaging", provider: "twilio", name: "SMS / WhatsApp provider", icon: MessageSquareText, credential: "TWILIO_AUTH_TOKEN" },
  { category: "delivery", provider: "aggregator", name: "Delivery aggregator", icon: Truck, credential: "DELIVERY_PROVIDER_SECRET" },
  { category: "accounting", provider: "accounting", name: "Accounting connector", icon: Link2, credential: "ACCOUNTING_PROVIDER_SECRET" },
  { category: "printers", provider: "browser", name: "Browser / local printing", icon: Printer, credential: "" },
  { category: "webhooks", provider: "webhooks", name: "Webhooks & API", icon: Webhook, credential: "QUICKSERVE_WEBHOOK_SECRET" },
  { category: "bi", provider: "bi", name: "BI / warehouse export", icon: BarChart3, credential: "BI_PROVIDER_SECRET" },
] as const;

function IntegrationsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canManage = Boolean(access.isSuperAdmin || (membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant")));
  const qc = useQueryClient();

  const query = useQuery<Connection[]>({
    queryKey: ["integrations", rid],
    enabled: Boolean(rid && canManage),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("integration_connections")
        .select("id,category,provider,display_name,status,credential_ref,config,capabilities,last_tested_at,last_sync_at,last_error")
        .eq("restaurant_id", rid!)
        .order("category")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as Connection[];
    },
  });

  const byKey = useMemo(() => new Map((query.data ?? []).map((row) => [`${row.category}:${row.provider}`, row])), [query.data]);

  const configure = useMutation({
    mutationFn: async (preset: (typeof PRESETS)[number]) => {
      const existing = byKey.get(`${preset.category}:${preset.provider}`);
      const payload = {
        restaurant_id: rid,
        category: preset.category,
        provider: preset.provider,
        display_name: preset.name,
        status: preset.provider === "browser" ? "healthy" : "configured",
        credential_ref: preset.credential || null,
        capabilities: preset.category === "payments" ? ["card","wallet"] : preset.category === "messaging" ? ["sms","whatsapp"] : [],
        config: existing?.config ?? {},
        last_tested_at: preset.provider === "browser" ? new Date().toISOString() : existing?.last_tested_at ?? null,
        last_error: null,
      };
      const { error } = await (supabase as any)
        .from("integration_connections")
        .upsert(payload, { onConflict: "restaurant_id,category,provider" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["integrations", rid] });
      toast.success(ar ? "تم تحديث الاتصال" : "Integration configuration updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const testConnection = useMutation({
    mutationFn: async (preset: (typeof PRESETS)[number]) => {
      const runtime = await testIntegrationRuntime({ data: { restaurantId: rid!, provider: preset.provider } });
      const existing = byKey.get(`${preset.category}:${preset.provider}`);
      const payload = {
        restaurant_id: rid,
        category: preset.category,
        provider: preset.provider,
        display_name: preset.name,
        status: runtime.healthy ? "healthy" : "error",
        credential_ref: preset.credential || null,
        config: existing?.config ?? {},
        capabilities: existing?.capabilities ?? [],
        last_tested_at: new Date().toISOString(),
        last_error: runtime.healthy ? null : runtime.detail,
      };
      const { error } = await (supabase as any)
        .from("integration_connections")
        .upsert(payload, { onConflict: "restaurant_id,category,provider" });
      if (error) throw error;
      return runtime;
    },
    onSuccess: async (runtime) => {
      await qc.invalidateQueries({ queryKey: ["integrations", rid] });
      toast.success(runtime.healthy ? (ar ? "الاتصال جاهز" : "Integration is ready") : (ar ? "يحتاج إعداداً على الخادم" : "Server credential is not configured"));
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const disable = useMutation({
    mutationFn: async (connection: Connection) => {
      const { error } = await (supabase as any)
        .from("integration_connections")
        .update({ status: connection.status === "disabled" ? "configured" : "disabled" })
        .eq("id", connection.id)
        .eq("restaurant_id", rid);
      if (error) throw error;
    },
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["integrations", rid] }),
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[520px] rounded-3xl" /></main></div>;
  if (!rid || !canManage) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><PlugZap className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "التكاملات غير متاحة" : "Integrations are not available"}</h1></section></main></div>;

  return <div className="min-h-dvh bg-background">
    <AppHeader title="QuickServe Connect" />
    <main className="qs-page qs-compact-page space-y-4">
      <MasterPageHeader
        eyebrow={<MasterEyebrow icon={PlugZap}>QuickServe Connect</MasterEyebrow>}
        title={ar ? "الإعدادات والتكاملات" : "Settings & Integrations"}
        description={ar ? "أدر المدفوعات والرسائل والتوصيل والمحاسبة والطباعة وواجهات API من مكان واحد." : "Manage payments, messaging, delivery, accounting, printing and API connectivity from one place."}
      />

      {query.isPending ? <Skeleton className="h-[480px] rounded-2xl" /> : query.isError ? <section className="qs-card p-5 text-sm text-destructive">{humanError(query.error, lang)}</section> : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PRESETS.map((preset) => {
            const row = byKey.get(`${preset.category}:${preset.provider}`);
            const Icon = preset.icon;
            const status = row?.status ?? "not_configured";
            return <article key={`${preset.category}:${preset.provider}`} className="group rounded-[18px] border border-border/85 bg-card p-5 shadow-[var(--qs-shadow-card)] transition hover:-translate-y-px hover:shadow-[var(--qs-shadow-hover)]">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-5" /></span>
                <MasterStatus tone={status === "healthy" ? "green" : status === "configured" ? "blue" : status === "disabled" ? "slate" : "orange"}>{status.replaceAll("_", " ")}</MasterStatus>
              </div>
              <h2 className="mt-4 font-bold">{preset.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{preset.credential ? (ar ? `مرجع السر: ${preset.credential}` : `Server secret: ${preset.credential}`) : (ar ? "لا يحتاج مفتاحاً خارجياً" : "No external credential required")}</p>
              {row?.last_error ? <p className="mt-3 rounded-xl bg-red-500/10 p-2 text-xs text-red-700">{row.last_error}</p> : null}
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => configure.mutate(preset)} disabled={configure.isPending}>{row ? (ar ? "تحديث" : "Refresh config") : (ar ? "تهيئة" : "Configure")}</Button>
                <Button size="sm" variant="outline" disabled={testConnection.isPending} onClick={() => testConnection.mutate(preset)}>{ar ? "اختبار" : "Test"}</Button>
                {row ? <Button size="sm" variant="outline" onClick={() => disable.mutate(row)}>{row.status === "disabled" ? (ar ? "تفعيل" : "Enable") : (ar ? "تعطيل" : "Disable")}</Button> : null}
              </div>
            </article>;
          })}
        </section>
      )}

      <DeveloperConnectPanel restaurantId={rid} />
      <IntegrationOperationsPanel restaurantId={rid} />

      <section className="qs-card p-5">
        <div className="flex items-start gap-3"><Activity className="mt-0.5 size-5 text-[#ff5a0a]" /><div><h2 className="font-bold">{ar ? "قاعدة أمان" : "Security rule"}</h2><p className="mt-1 text-sm text-muted-foreground">{ar ? "أسرار Webhook محفوظة مشفرة داخل Supabase Vault، ومفاتيح API تحفظ كبصمات SHA-256 فقط. القيم الكاملة تظهر مرة واحدة عند الإنشاء." : "Webhook signing secrets are encrypted in Supabase Vault, while API keys are stored only as SHA-256 hashes. Full secret values are revealed once at creation."}</p></div></div>
      </section>
    </main>
  </div>;
}
