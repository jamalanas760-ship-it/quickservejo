import { createFileRoute, Link } from "@tanstack/react-router";

import { BrandLogo } from "@/components/brand/BrandLogo";
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
    <div className="min-h-screen bg-background">
      <header className="safe-top border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/">
            <BrandLogo className="size-8" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold">{ar ? "سياسة الخصوصية" : "Privacy policy"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar ? "آخر تحديث: 2026" : "Last updated: 2026"}
        </p>
        <div className="mt-8 space-y-7">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold">{s.h}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.p}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
