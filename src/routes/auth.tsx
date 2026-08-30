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

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "QuickServe sign in" },
      { name: "description", content: "Sign in to QuickServe restaurant management and staff operations." },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(value?: string): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/** Resolve the landing screen from the authenticated role, never from a user-controlled redirect. */
async function roleDestination(): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return "/auth";

  const { data, error } = await supabase
    .from("staff")
    .select("role, restaurant_id")
    .eq("auth_user_id", uid)
    .eq("is_active", true);

  if (error) throw error;
  const rows = data ?? [];

  if (rows.some((row) => row.role === "super_admin")) return "/super-admin";

  const admin = rows.find((row) => row.role === "restaurant_admin" || row.role === "manager");
  if (admin) return "/";

  if (rows.some((row) => ["kitchen", "waiter", "cashier"].includes(row.role))) return "/kitchen";

  // A valid session without a staff membership can still enter the existing dashboard
  // flow so the application can display the appropriate access state.
  return "/dashboard";
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

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) void roleDestination().then((destination) => navigate({ to: destination as never, replace: true }));
    });
    return () => { cancelled = true; };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}${target}` },
        });
        if (error) throw error;
        if (data.session) {
          const destination = await roleDestination();
          navigate({ to: destination as never, replace: true });
        } else {
          toast.success(t("auth.checkEmail"));
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        const destination = await roleDestination();
        navigate({ to: destination as never, replace: true });
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
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/` });
      if (result.error) { toast.error(humanError(result.error, lang)); return; }
      if (result.redirected) return;
      const destination = await roleDestination();
      navigate({ to: destination as never, replace: true });
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <Link to="/" className="font-display text-xl font-bold"><BrandLogo className="size-9" accentClassName="text-sidebar-primary" textClassName="text-xl" /></Link>
        <div className="max-w-md space-y-4"><h1 className="text-4xl font-bold leading-tight">{lang === "ar" ? "منصة واحدة تدير كل مطاعمك" : "One platform, every restaurant you run"}</h1><p className="text-sm text-sidebar-foreground/70">{t("brand.tagline")}</p></div>
        <p className="text-xs text-sidebar-foreground/50">{lang === "ar" ? "عزل كامل للبيانات بين المطاعم على مستوى قاعدة البيانات." : "Tenant isolation enforced at the database level."}</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-between"><Link to="/" className="font-display text-lg font-bold lg:hidden"><BrandLogo className="size-8" /></Link><Button variant="ghost" size="sm" onClick={toggleLang} type="button">{t("common.language")}</Button></div>
          <div className="space-y-1"><h2 className="text-2xl font-semibold">{t("auth.title")}</h2><p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p></div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && <div className="space-y-2"><Label htmlFor="name">{t("auth.name")}</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>}
            <div className="space-y-2"><Label htmlFor="email">{t("auth.email")}</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <div className="space-y-2"><Label htmlFor="password">{t("auth.password")}</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{mode === "signup" ? t("auth.signUp") : t("auth.signIn")}</Button>
          </form>
          <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("auth.or")}<span className="h-px flex-1 bg-border" /></div>
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>{t("auth.google")}</Button>
          <Button type="button" variant="secondary" className="w-full" asChild><Link to="/staff">{t("staffAuth.usePin")}</Link></Button>
          <p className="text-center text-sm text-muted-foreground">{mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")} <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? t("auth.signIn") : t("auth.signUp")}</button></p>
        </div>
      </section>
    </main>
  );
}
