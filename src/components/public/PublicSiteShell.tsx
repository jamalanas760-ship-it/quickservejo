import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PublicSiteShell({
  children,
  contentClassName,
  showSignIn = true,
}: {
  children: ReactNode;
  contentClassName?: string;
  showSignIn?: boolean;
}) {
  const { lang, toggleLang } = useI18n();
  const ar = lang === "ar";

  return (
    <div dir={ar ? "rtl" : "ltr"} className="qs-public-site min-h-dvh bg-background text-foreground">
      <header className="safe-top sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="QuickServe home">
            <BrandLogo className="size-8" accentClassName="text-[#e85d2a]" textClassName="text-lg text-foreground" />
          </Link>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="min-h-10 gap-2" onClick={toggleLang}>
              <Globe2 className="size-4" />
              <span className="hidden sm:inline">{ar ? "English" : "العربية"}</span>
            </Button>
            {showSignIn ? (
              <Button asChild size="sm" className="min-h-10 px-4">
                <Link to="/auth">{ar ? "دخول الإدارة" : "Admin sign in"}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14", contentClassName)}>
        {children}
      </main>

      <footer className="border-t border-border/80 bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} QuickServe</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="transition hover:text-foreground">{ar ? "الخصوصية" : "Privacy"}</Link>
            <Link to="/terms" className="transition hover:text-foreground">{ar ? "الشروط" : "Terms"}</Link>
            <Link to="/contact" className="transition hover:text-foreground">{ar ? "اتصل بنا" : "Contact"}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
