import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Code2, Copy, KeyRound, Link2, RotateCcw, ShieldCheck, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { createApiKey, createWebhookSubscription, listDeveloperCredentials, revokeApiKey, toggleWebhookSubscription } from "@/lib/developer.functions";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({ meta: [{ title: "API & Webhooks — QuickServe" }, { name: "description", content: "Tenant-scoped API keys and signed webhook subscriptions." }] }),
  component: DeveloperPage,
});

const API_SCOPES = ["menu:read","orders:read","orders:write","inventory:read"] as const;
const WEBHOOK_EVENTS = ["order.created","order.status_changed","payment.updated","menu.updated","inventory.low_stock"] as const;

function DeveloperPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canManage = Boolean(access.isSuperAdmin || (membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant")));
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["menu:read","orders:read"]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["order.created","order.status_changed"]);
  const [revealedHookSecret, setRevealedHookSecret] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["developer-credentials", rid],
    enabled: Boolean(rid && canManage),
    queryFn: () => listDeveloperCredentials({ data: { restaurantId: rid! } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["developer-credentials", rid] });

  const keyMutation = useMutation({
    mutationFn: () => createApiKey({ data: { restaurantId: rid!, name: keyName, scopes: selectedScopes as (typeof API_SCOPES)[number][] } }),
    onSuccess: async (result) => {
      setRevealedKey(result.key);
      setKeyName("");
      await refresh();
      toast.success(ar ? "تم إنشاء المفتاح. انسخه الآن." : "API key created. Copy it now.");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey({ data: { restaurantId: rid!, keyId } }),
    onSuccess: async () => {
      await refresh();
      toast.success(ar ? "تم إلغاء المفتاح" : "API key revoked");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const hookMutation = useMutation({
    mutationFn: () => createWebhookSubscription({ data: { restaurantId: rid!, name: hookName, endpointUrl: hookUrl, events: selectedEvents as (typeof WEBHOOK_EVENTS)[number][] } }),
    onSuccess: async (result) => {
      setRevealedHookSecret(result.secret);
      setHookName("");
      setHookUrl("");
      await refresh();
      toast.success(ar ? "تم إنشاء الاشتراك. انسخ سر التوقيع الآن." : "Webhook created. Copy the signing secret now.");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const toggleHook = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleWebhookSubscription({ data: { restaurantId: rid!, webhookId: id, isActive: active } }),
    onSuccess: async () => refresh(),
    onError: (error) => toast.error(humanError(error, lang)),
  });

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(ar ? "تم النسخ" : "Copied");
  }

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[520px] rounded-3xl" /></main></div>;
  if (!rid || !canManage) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><ShieldCheck className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "لا تملك صلاحية إدارة API" : "API management is restricted"}</h1></section></main></div>;

  const data = query.data as any;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "API والويب هوكس" : "API & Webhooks"} />
    <main className="qs-page space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm"><div className="p-6 sm:p-8"><div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><Code2 className="size-3.5" />Developer Platform</div><h1 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? "اربط QuickServe بأنظمتك بأمان" : "Build securely on top of QuickServe"}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ar ? "مفاتيح API محددة الصلاحيات وويب هوكس موقعة، مع إمكانية الإلغاء والتتبع." : "Scoped API keys and signed webhooks with revocation and delivery visibility."}</p></div></section>

      {revealedKey ? <SecretCard title={ar ? "مفتاح API الجديد — سيظهر مرة واحدة" : "New API key — shown once"} value={revealedKey} onCopy={copy} onClose={() => setRevealedKey(null)} /> : null}
      {revealedHookSecret ? <SecretCard title={ar ? "سر توقيع الويب هوك — سيظهر مرة واحدة" : "Webhook signing secret — shown once"} value={revealedHookSecret} onCopy={copy} onClose={() => setRevealedHookSecret(null)} /> : null}

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="qs-card p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><KeyRound className="size-5" /></span><div><h2 className="font-bold">{ar ? "إنشاء مفتاح API" : "Create API key"}</h2><p className="text-xs text-muted-foreground">{ar ? "اختر أقل صلاحيات يحتاجها التكامل." : "Grant only the scopes the integration needs."}</p></div></div>
          <Input className="mt-4" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={ar ? "مثال: لوحة BI" : "e.g. BI dashboard"} />
          <div className="mt-3 flex flex-wrap gap-2">{API_SCOPES.map((item) => <button key={item} type="button" onClick={() => setSelectedScopes((current) => current.includes(item) ? current.filter((scope) => scope !== item) : [...current, item])} className={selectedScopes.includes(item) ? "rounded-full bg-foreground px-3 py-2 text-xs font-bold text-background" : "rounded-full border px-3 py-2 text-xs font-semibold text-muted-foreground"}>{item}</button>)}</div>
          <Button className="mt-4" disabled={!keyName.trim() || selectedScopes.length === 0 || keyMutation.isPending} onClick={() => keyMutation.mutate()}><KeyRound className="size-4" />{ar ? "إنشاء" : "Generate key"}</Button>
        </article>

        <article className="qs-card p-5">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Webhook className="size-5" /></span><div><h2 className="font-bold">{ar ? "إضافة Webhook" : "Create webhook"}</h2><p className="text-xs text-muted-foreground">{ar ? "النقطة النهائية يجب أن تستخدم HTTPS." : "Webhook endpoints must use HTTPS."}</p></div></div>
          <div className="mt-4 grid gap-2"><Input value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder={ar ? "اسم الاشتراك" : "Subscription name"} /><Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/webhooks/quickserve" /></div>
          <div className="mt-3 flex flex-wrap gap-2">{WEBHOOK_EVENTS.map((item) => <button key={item} type="button" onClick={() => setSelectedEvents((current) => current.includes(item) ? current.filter((event) => event !== item) : [...current, item])} className={selectedEvents.includes(item) ? "rounded-full bg-foreground px-3 py-2 text-xs font-bold text-background" : "rounded-full border px-3 py-2 text-xs font-semibold text-muted-foreground"}>{item}</button>)}</div>
          <Button className="mt-4" disabled={!hookName.trim() || !hookUrl.startsWith("https://") || selectedEvents.length === 0 || hookMutation.isPending} onClick={() => hookMutation.mutate()}><Link2 className="size-4" />{ar ? "إضافة" : "Create webhook"}</Button>
        </article>
      </section>

      {query.isPending ? <Skeleton className="h-72 rounded-2xl" /> : query.isError ? <section className="qs-card p-5 text-sm text-destructive">{humanError(query.error, lang)}</section> : <>
        <section className="qs-card overflow-hidden"><div className="border-b p-5"><h2 className="font-bold">{ar ? "مفاتيح API" : "API keys"}</h2></div><div className="divide-y">{(data?.keys ?? []).map((key: any) => <div key={key.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{key.name}</strong><code className="rounded bg-muted px-2 py-1 text-[10px]">{key.key_prefix}…</code>{!key.is_active ? <span className="text-[10px] font-bold text-red-600">{ar ? "ملغي" : "Revoked"}</span> : null}</div><p className="mt-1 text-[10px] text-muted-foreground">{(key.scopes ?? []).join(" · ")}</p></div>{key.is_active ? <Button size="sm" variant="outline" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(key.id)}><RotateCcw className="size-3.5" />{ar ? "إلغاء" : "Revoke"}</Button> : null}</div>)}</div></section>

        <section className="qs-card overflow-hidden"><div className="border-b p-5"><h2 className="font-bold">{ar ? "اشتراكات Webhook" : "Webhook subscriptions"}</h2></div><div className="divide-y">{(data?.webhooks ?? []).map((hook: any) => <div key={hook.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{hook.name}</strong><span className={hook.is_active ? "text-[10px] font-bold text-emerald-700" : "text-[10px] font-bold text-muted-foreground"}>{hook.is_active ? (ar ? "نشط" : "Active") : (ar ? "متوقف" : "Disabled")}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{hook.endpoint_url}</p><p className="mt-1 text-[10px] text-muted-foreground">{(hook.events ?? []).join(" · ")}{hook.failure_count ? ` · ${hook.failure_count} failures` : ""}</p></div><Button size="sm" variant="outline" onClick={() => toggleHook.mutate({ id: hook.id, active: !hook.is_active })}>{hook.is_active ? (ar ? "تعطيل" : "Disable") : (ar ? "تفعيل" : "Enable")}</Button></div>)}</div></section>
      </>}
    </main>
  </div>;
}

function SecretCard({ title, value, onCopy, onClose }: { title: string; value: string; onCopy: (value: string) => Promise<void>; onClose: () => void }) {
  return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><strong className="text-sm">{title}</strong><div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-white px-3 py-3 text-xs">{value}</code><Button variant="outline" onClick={() => void onCopy(value)}><Copy className="size-4" />Copy</Button><Button variant="ghost" onClick={onClose}>Done</Button></div></section>;
}
