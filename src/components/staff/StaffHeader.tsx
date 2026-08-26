import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function StaffHeader({ title }: { title?: string }) {
  const { t, toggleLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-display text-lg font-bold">
            <BrandLogo className="size-8" />
          </Link>
          {title && (
            <span className="hidden text-sm text-muted-foreground sm:inline">/ {title}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={toggleLang}>
            {t("common.language")}
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>
            {t("nav.signOut")}
          </Button>
        </div>
      </div>
    </header>
  );
}
