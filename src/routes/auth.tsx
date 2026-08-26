import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}${target}`,
          },
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: target });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
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
        toast.error(result.error.message ?? t("common.error"));
        return;
      }
      if (result.redirected) return;
      navigate({ to: target });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Link to="/" className="font-display text-xl font-bold">
          Quick<span className="text-sidebar-primary">Serve</span>
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
              Quick<span className="text-accent">Serve</span>
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
