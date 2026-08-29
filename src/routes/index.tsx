import { createFileRoute, Link } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { useSupabaseSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BottomNav } from "@/components/nav/BottomNav";
import { WorkspaceHome } from "@/components/home/WorkspaceHome";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QuickServe — Multi-restaurant QR ordering platform" },
      {
        name: "description",
        content:
          "QuickServe runs QR table ordering, kitchen display, waiter calls and cashier tools for many restaurants from one secure platform, in Arabic and English.",
      },
      { property: "og:title", content: "QuickServe — Multi-restaurant QR ordering platform" },
      {
        property: "og:description",
        content:
          "QR table ordering, live kitchen display, waiter calls and cashier tools for every restaurant you run.",
      },
    ],
  }),
  component: Landing,
});

const capabilities = [
  {
    en: { title: "Scan to order", body: "Diners scan a table QR and order in seconds — no app, no account." },
    ar: { title: "امسح واطلب", body: "يمسح الزائر رمز الطاولة ويطلب في ثوانٍ — بلا تطبيق ولا حساب." },
  },
  {
    en: { title: "Live kitchen display", body: "Orders land on the kitchen screen instantly with elapsed-time urgency." },
    ar: { title: "شاشة مطبخ فورية", body: "تصل الطلبات إلى شاشة المطبخ فوراً مع مؤشرات الوقت." },
  },
  {
    en: { title: "Waiter & cashier tools", body: "Waiter calls, table status and payment handling in one place." },
    ar: { title: "أدوات النادل والكاشير", body: "نداء النادل وحالة الطاولات وإدارة الدفع في مكان واحد." },
  },
  {
    en: { title: "Per-restaurant branding", body: "Colors, fonts, layouts and card styles stored per tenant." },
    ar: { title: "هوية لكل مطعم", body: "الألوان والخطوط والتخطيطات محفوظة لكل مطعم على حدة." },
  },
  {
    en: { title: "Database-level isolation", body: "Row Level Security keeps every restaurant's data separate." },
    ar: { title: "عزل على مستوى قاعدة البيانات", body: "أمان الصفوف يفصل بيانات كل مطعم تماماً." },
  },
  {
    en: { title: "Arabic & English", body: "Full RTL and LTR support across diner, staff and admin apps." },
    ar: { title: "عربي وإنجليزي", body: "دعم كامل لليمين واليسار في كل التطبيقات." },
  },
];

function Landing() {
  const { lang, t, toggleLang } = useI18n();
  const session = useSupabaseSession();
  const signedIn = Boolean(session.data);

  // Signed-in users land in their workspace home instead of the marketing page.
  if (signedIn) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
            <BrandLogo className="size-8" textClassName="hidden sm:inline" />
            <Button variant="ghost" size="sm" className="h-9" onClick={toggleLang}>
              {t("common.language")}
            </Button>
          </div>
        </header>
        <WorkspaceHome />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="safe-top border-b border-border">
        <div className="mx-auto grid h-auto max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 sm:h-16 sm:py-0">
          <BrandLogo
            className="size-8 shrink-0 sm:size-9"
            textClassName="hidden sm:inline"
          />
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" className="h-10 px-2" onClick={toggleLang}>
              {t("common.language")}
            </Button>
            {signedIn ? (
              <Button asChild size="sm" className="h-10">
                <Link to="/dashboard">{t("nav.dashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="sm" className="h-10">
                  <Link to="/staff">{lang === "ar" ? "الموظفين" : "Staff"}</Link>
                </Button>
                <Button asChild size="sm" className="h-10">
                  <Link to="/auth">{lang === "ar" ? "الإدارة" : "Admin"}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {lang === "ar" ? "منصة SaaS متعددة المطاعم" : "Multi-tenant restaurant SaaS"}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
            {lang === "ar"
              ? "طلبات QR، مطبخ مباشر، وإدارة كاملة لكل مطعم تديره"
              : "QR ordering, a live kitchen and full control for every restaurant you run"}
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground">
            {lang === "ar"
              ? "QuickServe منصة واحدة تُشغّل عدة مطاعم بهويات وقوائم وطاولات وفِرق مختلفة، مع عزل بيانات مفروض من قاعدة البيانات."
              : "QuickServe runs many restaurants from one codebase — each with its own branding, menu, tables and team, isolated by database-enforced security."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <Button asChild size="lg">
                <Link to="/dashboard">{t("nav.dashboard")}</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link to="/auth">{lang === "ar" ? "دخول الإدارة" : "Admin sign in"}</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/staff">{lang === "ar" ? "دخول الموظفين بالرمز" : "Staff sign in with PIN"}</Link>
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="border-t border-border bg-surface py-16">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c) => (
              <article key={c.en.title} className="panel p-6">
                <h2 className="text-base font-semibold">{c[lang].title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{c[lang].body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t border-border py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold">
              {lang === "ar" ? "خطط بحسب عدد المقاعد" : "Seat-based plans"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {lang === "ar"
                ? "كل مطعم يحصل على مساحة عمل خاصة، وتدفع بحسب عدد حسابات الفريق النشطة."
                : "Every restaurant gets its own workspace; you pay for the active team accounts you need."}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {plans.map((plan) => (
                <article
                  key={plan.en.name}
                  className={
                    plan.featured
                      ? "panel border-primary p-6 ring-1 ring-primary/30"
                      : "panel p-6"
                  }
                >
                  <h3 className="text-base font-semibold">{plan[lang].name}</h3>
                  <p className="mt-2 text-2xl font-bold">
                    {plan.price} <span className="text-sm font-medium text-muted-foreground">JOD</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? "شهرياً" : "per month"} · {plan.seats}{" "}
                    {lang === "ar" ? "مقعد" : "seats"}
                  </p>
                  <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                    {plan[lang].features.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} QuickServe — {t("brand.tagline")}
          </p>
          <nav className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              {lang === "ar" ? "الخصوصية" : "Privacy"}
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              {lang === "ar" ? "الشروط" : "Terms"}
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              {lang === "ar" ? "اتصل بنا" : "Contact"}
            </Link>
            <Link to="/staff" className="hover:text-foreground">
              {lang === "ar" ? "دخول الموظفين" : "Staff sign in"}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
