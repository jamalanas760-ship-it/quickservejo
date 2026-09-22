import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { PublicSiteShell } from "@/components/public/PublicSiteShell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact QuickServe — talk to our team" },
      {
        name: "description",
        content:
          "Reach the QuickServe team about pricing, onboarding a restaurant group, staff seats or support for QR table ordering.",
      },
      { property: "og:title", content: "Contact QuickServe — talk to our team" },
      { property: "og:description", content: "Sales, onboarding and support for QuickServe." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const channels = [
    {
      icon: Mail,
      label: ar ? "البريد الإلكتروني" : "Email",
      value: "hello@quickservejo.com",
      href: "mailto:hello@quickservejo.com",
    },
    {
      icon: Phone,
      label: ar ? "الهاتف" : "Phone",
      value: "+962 7 9000 0000",
      href: "tel:+962790000000",
    },
    {
      icon: MessageCircle,
      label: ar ? "واتساب" : "WhatsApp",
      value: "+962 7 9000 0000",
      href: "https://wa.me/962790000000",
    },
  ];

  return (
    <PublicSiteShell contentClassName="max-w-4xl">
      <section className="qs-card overflow-hidden">
        <div className="border-b border-border bg-[linear-gradient(135deg,#fff7f1,#fff)] px-5 py-8 sm:px-8 sm:py-10">
          <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#e34d00]">QuickServe Jordan</p>
          <h1 className="mt-3 font-display text-[clamp(2rem,6vw,3.4rem)] font-bold tracking-[-.045em]">{ar ? "تواصل معنا" : "Let’s talk about your restaurant"}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          {ar
            ? "أخبرنا بعدد المطاعم والطاولات وعدد الموظفين، وسنجهّز مساحة عمل ونساعدك في إعداد القائمة ورموز QR."
            : "Tell us how many restaurants, tables and staff you have — we'll provision a workspace and help you set up the menu and QR codes."}
          </p>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-8">
          {channels.map((c) => {
            const Icon = c.icon;
            return (
              <a
                key={c.label}
                href={c.href}
                className="qs-soft-card flex min-h-40 flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-orange-50/40"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <span className="text-sm font-semibold" dir="ltr">
                  {c.value}
                </span>
              </a>
            );
          })}
        </div>
      </section>
    </PublicSiteShell>
  );
}
