import { createFileRoute, Link } from "@tanstack/react-router";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — QuickServe" },
      {
        name: "description",
        content:
          "The terms that govern use of the QuickServe QR ordering platform: subscriptions, staff seats, acceptable use and availability.",
      },
      { property: "og:title", content: "Terms of service — QuickServe" },
      { property: "og:description", content: "Subscription, seat and acceptable-use terms." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const sections = ar
    ? [
        {
          h: "الاشتراك والمقاعد",
          p: "كل خطة تتضمن عدداً محدداً من مقاعد الموظفين. عند الوصول إلى الحد يجب ترقية الخطة لإضافة حسابات جديدة. تُحتسب المقاعد على الحسابات النشطة فقط.",
        },
        {
          h: "مسؤولية المطعم",
          p: "المطعم مسؤول عن دقة القائمة والأسعار والضرائب المعروضة للزبائن، وعن تنفيذ الطلبات المستلمة عبر المنصة.",
        },
        {
          h: "الاستخدام المقبول",
          p: "يُمنع استخدام المنصة لمحتوى غير قانوني أو مضلل، أو لمحاولة الوصول إلى بيانات مطاعم أخرى.",
        },
        {
          h: "التوافر",
          p: "نعمل على توفير خدمة مستمرة، وقد تحدث فترات صيانة معلنة. لا نضمن خدمة دون انقطاع.",
        },
        {
          h: "الإنهاء",
          p: "يمكن إنهاء الاشتراك في أي وقت؛ تبقى بيانات الطلبات متاحة للتصدير لمدة معقولة بعد الإنهاء.",
        },
      ]
    : [
        {
          h: "Subscription and seats",
          p: "Each plan includes a fixed number of staff seats. When the limit is reached, the plan must be upgraded before more accounts can be created. Only active accounts consume a seat.",
        },
        {
          h: "Restaurant responsibility",
          p: "The restaurant is responsible for the accuracy of its menu, prices and taxes shown to diners, and for fulfilling orders received through the platform.",
        },
        {
          h: "Acceptable use",
          p: "The platform may not be used for unlawful or misleading content, or to attempt access to another restaurant's data.",
        },
        {
          h: "Availability",
          p: "We aim for continuous service and announce maintenance windows. Uninterrupted service is not guaranteed.",
        },
        {
          h: "Termination",
          p: "A subscription can be cancelled at any time; order data stays available for export for a reasonable period afterwards.",
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
        <h1 className="text-3xl font-bold">{ar ? "شروط الخدمة" : "Terms of service"}</h1>
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
