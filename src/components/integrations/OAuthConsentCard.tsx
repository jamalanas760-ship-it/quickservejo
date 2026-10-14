import { useState } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";
import { oauthErrorKind, safeOAuthCallback } from "@/lib/mcp-oauth";
import { quickServeSupabase } from "@/integrations/supabase/public-config";
export function OAuthConsentCard({
  details,
  authorizationId,
}: {
  details: OAuthAuthorizationDetails;
  authorizationId: string;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const { data, error } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });
      if (error || !data?.redirect_url) throw new Error("Authorization failed");
      const destination = safeOAuthCallback(data.redirect_url),
        expected = new URL(details.redirect_uri),
        actual = new URL(destination);
      if (expected.origin !== actual.origin || expected.pathname !== actual.pathname)
        throw new Error("Callback mismatch");
      window.location.assign(destination);
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background p-4"
      dir={ar ? "rtl" : "ltr"}
    >
      <section className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
        <BrandLogo className="size-10" />
        <h1 className="break-words text-xl font-bold">
          {t("Connect", "ربط")} {details.client.name} {t("to QuickServe", "بـ QuickServe")}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(
            "This client can use QuickServe tools as your signed-in account, within your existing restaurant permissions.",
            "سيستخدم هذا التطبيق أدوات QuickServe بحسابك، ضمن صلاحياتك الحالية في المطاعم.",
          )}
        </p>
        <div className="rounded-xl border p-4 text-sm">
          <strong className="block">{t("Return destination", "وجهة العودة")}</strong>
          <span dir="ltr" className="mt-1 block break-all">
            {new URL(details.redirect_uri).origin}
          </span>
          <p className="mt-3 text-muted-foreground">
            {t(
              "Approve only if this is the client you just connected.",
              "وافق فقط إذا كان هذا هو التطبيق الذي بدأت ربطه.",
            )}
          </p>
        </div>
        {details.scope && (
          <div className="text-sm">
            <strong>{t("Requested scopes", "الصلاحيات المطلوبة")}</strong>
            <ul className="mt-2 flex flex-wrap gap-2">
              {details.scope
                .split(/\s+/)
                .filter(Boolean)
                .map((scope) => (
                  <li key={scope} className="rounded-md bg-muted px-2 py-1">
                    {scope}
                  </li>
                ))}
            </ul>
          </div>
        )}
        <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          {t(
            "Tools can read data and perform permitted actions such as creating reservations or updating orders. Your password is never shared with the AI client.",
            "يمكن للأدوات قراءة البيانات وتنفيذ الإجراءات المسموحة كإنشاء الحجوزات وتحديث الطلبات. لا تتم مشاركة كلمة مرورك مع تطبيق الذكاء الاصطناعي.",
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(
              "Unable to finish authorization. Retry or restart the connection from your AI client.",
              "تعذر إكمال التفويض. أعد المحاولة أو ابدأ الربط مجدداً من تطبيق الذكاء الاصطناعي.",
            )}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            disabled={busy}
            className="min-h-11 flex-1"
            onClick={() => void decide(false)}
            variant="outline"
          >
            {t("Deny", "رفض")}
          </Button>
          <Button disabled={busy} className="min-h-11 flex-1" onClick={() => void decide(true)}>
            {busy ? t("Working…", "جارٍ التنفيذ…") : t("Approve connection", "الموافقة على الربط")}
          </Button>
        </div>
      </section>
    </main>
  );
}
export function OAuthConsentError({ error }: { error: unknown }) {
  const { lang } = useI18n(),
    ar = lang === "ar",
    disabled = oauthErrorKind(error) === "disabled";
  const ref = new URL(quickServeSupabase.url).hostname.split(".")[0];
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background p-4"
      dir={ar ? "rtl" : "ltr"}
    >
      <section className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6">
        <BrandLogo className="size-10" />
        <h1 className="text-xl font-bold">
          {disabled
            ? ar
              ? "خادم OAuth غير مفعل"
              : "OAuth server is disabled"
            : ar
              ? "تعذر تحميل طلب التفويض"
              : "Authorization request unavailable"}
        </h1>
        <p role="alert" className="text-sm leading-6 text-muted-foreground">
          {disabled
            ? ar
              ? "يجب على مالك المشروع تفعيل خادم OAuth والتسجيل التلقائي للعملاء في Supabase ثم إعادة الربط."
              : "The project owner must enable OAuth Server and dynamic client registration in Supabase, then restart this connection."
            : ar
              ? "قد يكون الطلب منتهياً أو الاتصال غير متاح. ابدأ الربط مجدداً من تطبيق الذكاء الاصطناعي."
              : "The request may have expired or the service is unreachable. Restart the connection from your AI client."}
        </p>
        {disabled && (
          <a
            className="qs-button-primary min-h-11"
            href={`https://supabase.com/dashboard/project/${ref}/auth/oauth-server`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {ar ? "إعدادات OAuth لمالك المشروع" : "Project owner: OAuth settings"}
            <ExternalLink className="size-4" />
          </a>
        )}
        <Link to="/dashboard" className="qs-button-secondary min-h-11">
          {ar ? "العودة إلى QuickServe" : "Return to QuickServe"}
        </Link>
      </section>
    </main>
  );
}
