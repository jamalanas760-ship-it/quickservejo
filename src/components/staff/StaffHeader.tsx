import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChefHat, Home, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

export function StaffHeader({ title }: { title?: string }) {
  const { t, toggleLang, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية" },
    { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
    { to: "/profile", icon: UserRound, en: "Profile", ar: "الملف" },
  ] as const;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl supports-[backdrop-filter]:bg-background/72">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" aria-label="QuickServe" className="grid size-9 shrink-0 place-items-center rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5">
              <BrandLogo className="size-7" />
            </Link>
            {title ? <span className="hidden truncate border-l pl-3 text-sm font-semibold text-muted-foreground sm:block">{title}</span> : null}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={toggleLang} className="rounded-full px-3">{t("common.language")}</Button>
            <Button variant="outline" size="sm" onClick={signOut} className="rounded-full">{t("nav.signOut")}</Button>
          </div>
        </div>
      </header>
      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Main navigation"} className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-around rounded-[24px] border bg-card/92 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.16)] backdrop-blur-xl md:hidden">
        {nav.map(({ to, icon: Icon, en, ar }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return <Link key={to} to={to} className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-[10px] font-bold transition-all", active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted")}><Icon className="size-4"/><span>{lang === "ar" ? ar : en}</span></Link>;
        })}
        <Link to="/manage" className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-[10px] font-bold transition-all", pathname.startsWith("/manage") ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted")}><BarChart3 className="size-4"/><span>{lang === "ar" ? "المطعم" : "Restaurant"}</span></Link>
      </nav>
    </>
  );
}
