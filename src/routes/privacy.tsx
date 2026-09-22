import { createFileRoute } from "@tanstack/react-router";

import { PublicSiteShell } from "@/components/public/PublicSiteShell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — QuickServe" },
      {
        name: "description",
        content:
          "How QuickServe collects, stores and protects restaurant, staff and diner data across its QR ordering platform.",
      },
      { property: "og:title", content: "Privacy policy — QuickServe" },
      { property: "og:description", content: "Data handling and privacy practices at QuickServe." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const sections = ar
    ? [
        {
          h: "البيانات التي نجمعها",
          p: "بيانات المطعم (الاسم، الشعار، القائمة، الطاولات)، حسابات الموظفين (الاسم والبريد والدور)، وبيانات الطلبات التي ينشئها الزبائن عبر رمز QR. لا نطلب من الزبائن إنشاء حساب.",
        },
        {
          h: "كيف نستخدمها",
          p: "لتشغيل الطلب عبر QR وشاشة المطبخ والتحليلات والفواتير فقط. لا نبيع البيانات ولا نشاركها مع أطراف تسويقية.",
        },
        {
          h: "العزل والأمان",
          p: "بيانات كل مطعم معزولة على مستوى قاعدة البيانات بسياسات أمان الصفوف، ولا يمكن لأي مطعم رؤية بيانات مطعم آخر.",
        },
        {
          h: "الاحتفاظ والحذف",
          p: "نحتفظ بسجلات الطلبات لأغراض التقارير والمحاسبة. يمكن لمالك المطعم طلب حذف بيانات مساحته في أي وقت.",
        },
        {
          h: "التواصل",
          p: "لأي طلب متعلق بالخصوصية تواصل معنا من صفحة الاتصال.",
        },
      ]
    : [
        {
          h: "What we collect",
          p: "Restaurant data (name, logo, menu, tables), staff accounts (name, email, role) and the orders diners create by scanning a table QR. Diners are never asked to create an account.",
        },
        {
          h: "How we use it",
          p: "Only to run QR ordering, the kitchen display, analytics and billing. We do not sell data or share it with marketing third parties.",
        },
        {
          h: "Isolation and security",
          p: "Every restaurant's data is isolated at the database level with Row Level Security policies, so no tenant can read another tenant's records.",
        },
        {
          h: "Retention and deletion",
          p: "Order records are retained for reporting and accounting. A restaurant owner can request deletion of their workspace data at any time.",
        },
        {
          h: "Contact",
          p: "For any privacy request, reach us from the contact page.",
        },
      ];

  return (
    <PublicSiteShell contentClassName="max-w-4xl">
      <article className="qs-card overflow-hidden">
        <header className="border-b border-border bg-[linear-gradient(135deg,#fff7f1,#fff)] px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#e34d00]">QuickServe</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.4rem)] font-bold tracking-[-.045em]">{ar ? "سياسة الخصوصية" : "Privacy policy"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar ? "آخر تحديث: 2026" : "Last updated: 2026"}
        </p>
        </header>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-8">
          {sections.map((s) => (
            <section key={s.h} className="qs-soft-card p-5 sm:p-6">
              <h2 className="font-display text-lg font-bold">{s.h}</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
      </article>
    </PublicSiteShell>
  );
}
