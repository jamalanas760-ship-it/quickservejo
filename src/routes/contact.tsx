import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-background">
      <header className="safe-top border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link to="/">
            <BrandLogo className="size-8" />
          </Link>
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link to="/auth">{ar ? "دخول الإدارة" : "Admin sign in"}</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold">{ar ? "تواصل معنا" : "Contact us"}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {ar
            ? "أخبرنا بعدد المطاعم والطاولات وعدد الموظفين، وسنجهّز مساحة عمل ونساعدك في إعداد القائمة ورموز QR."
            : "Tell us how many restaurants, tables and staff you have — we'll provision a workspace and help you set up the menu and QR codes."}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {channels.map((c) => {
            const Icon = c.icon;
            return (
              <a
                key={c.label}
                href={c.href}
                className="panel flex flex-col gap-2 p-5 transition-colors hover:bg-muted/60"
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
      </main>
    </div>
  );
}
