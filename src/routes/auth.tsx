import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { humanError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Staff sign in — QuickServe" },
      {
        name: "description",
        content:
          "Sign in to the QuickServe staff workspace: kitchen display, waiter calls, cashier and restaurant management.",
      },
      { property: "og:title", content: "Staff sign in — QuickServe" },
      {
        property: "og:description",
        content: "Restaurant staff and platform administrators sign in here.",
      },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(value?: string): string {
  if (!value) return "/dashboard";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/**
 * Sends each role to the workspace it can actually use. The dashboard is the
 * fallback whenever the user has several memberships or none yet.
 */
async function roleDestination(fallback: string): Promise<string> {
  if (fallback !== "/dashboard") return fallback;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return fallback;
  const { data } = await supabase
    .from("staff")
    .select("role, restaurant_id")
    .eq("auth_user_id", uid)
    .eq("is_active", true);
  const rows = data ?? [];
  if (rows.some((r) => r.role === "super_admin")) return "/super-admin";
  if (rows.length === 1) {
    const row = rows[0]!;
    if ((row.role === "restaurant_admin" || row.role === "manager") && row.restaurant_id) {
      return `/manage/${row.restaurant_id}`;
    }
    if (row.role === "kitchen" || row.role === "waiter") return "/kitchen";
  }
  return fallback;
}

function AuthPage() {
  const { t, lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const target = safeRedirect(search.redirect);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // A signed-in user landing on /auth goes straight to their workspaces.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate({ to: target, replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, target]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${window.location.origin}${target}`,
          },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is disabled for staff onboarding, so the account
          // is usable immediately.
          navigate({ to: target, replace: true });
        } else {
          toast.success(t("auth.checkEmail"));
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate({ to: await roleDestination(target), replace: true });
      }
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(humanError(result.error, lang));
        return;
      }
      if (result.redirected) return;
      navigate({ to: target, replace: true });
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Link to="/" className="font-display text-xl font-bold">
          <BrandLogo className="size-9" accentClassName="text-sidebar-primary" textClassName="text-xl" />
        </Link>
        <div className="max-w-md space-y-4">
          <h1 className="text-4xl font-bold leading-tight">
            {lang === "ar"
              ? "منصة واحدة تدير كل مطاعمك"
              : "One platform, every restaurant you run"}
          </h1>
          <p className="text-sm text-sidebar-foreground/70">{t("brand.tagline")}</p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">
          {lang === "ar"
            ? "عزل كامل للبيانات بين المطاعم على مستوى قاعدة البيانات."
            : "Tenant isolation enforced at the database level."}
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="font-display text-lg font-bold lg:hidden">
              <BrandLogo className="size-8" />
            </Link>
            <Button variant="ghost" size="sm" onClick={toggleLang} type="button">
              {t("common.language")}
            </Button>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">{t("auth.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.name")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
            </Button>
          </form>

          <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("auth.or")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={busy}
          >
            {t("auth.google")}
          </Button>

          <Button type="button" variant="secondary" className="w-full" asChild>
            <Link to="/staff">{t("staffAuth.usePin")}</Link>
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            >
              {mode === "signup" ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </p>

        </div>
      </section>
    </main>
  );
}
