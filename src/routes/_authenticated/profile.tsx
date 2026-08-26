import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Mail, Shield } from "lucide-react";

import { StaffHeader } from "@/components/staff/StaffHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { ROLE_LABELS } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — QuickServe" },
      {
        name: "description",
        content:
          "Your QuickServe account: email, roles, restaurant access, language preference and sign out.",
      },
      { property: "og:title", content: "My profile — QuickServe" },
      { property: "og:description", content: "Account details and restaurant access on QuickServe." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { t, lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, isSuperAdmin } = useAccess();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: u }) => setEmail(u.user?.email ?? null));
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const memberships = (data ?? []).filter((m) => m.restaurant_id);

  return (
    <div className="min-h-screen bg-background">
      <StaffHeader title={lang === "ar" ? "الملف الشخصي" : "Profile"} />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{lang === "ar" ? "الملف الشخصي" : "My profile"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lang === "ar"
              ? "بيانات حسابك وصلاحياتك على المنصة."
              : "Your account details and platform access."}
          </p>
        </div>

        <section className="panel space-y-3 p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </p>
              <p className="truncate text-sm font-medium">{email ?? "—"}</p>
            </div>
          </div>
          {isSuperAdmin ? (
            <div className="flex items-center gap-2 text-sm">
              <Shield className="size-4 text-primary" />
              <span>{ROLE_LABELS.super_admin[lang]}</span>
            </div>
          ) : null}
        </section>

        <section className="panel space-y-3 p-5">
          <h2 className="text-sm font-semibold">
            {lang === "ar" ? "صلاحيات المطاعم" : "Restaurant access"}
          </h2>
          {isPending ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dash.noAccess")}</p>
          ) : (
            <ul className="space-y-2">
              {memberships.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="truncate text-sm font-medium">{m.restaurant?.name}</span>
                  <Badge variant="secondary">{ROLE_LABELS[m.role][lang]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel flex flex-wrap gap-2 p-5">
          <Button variant="outline" onClick={toggleLang}>
            {t("common.language")}
          </Button>
          <Button variant="destructive" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            {t("nav.signOut")}
          </Button>
        </section>
      </main>
    </div>
  );
}
