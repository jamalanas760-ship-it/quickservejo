import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Eye, EyeOff, Globe2, Loader2, LockKeyhole, Mail, Smile, UsersRound, WifiOff, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { humanError } from "@/lib/errors";
import { roleDestination } from "@/lib/post-signin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeSessionRedirect } from "@/lib/session-token";

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

function isNetworkError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|network|load failed|fetch failed|econn|enotfound|timeout/i.test(raw);
}

function authFailureMessage(error: unknown, lang: "en" | "ar"): string {
  if (isNetworkError(error)) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return lang === "ar"
        ? "لا يوجد اتصال بالإنترنت. تحقق من اتصالك ثم حاول مرة أخرى."
        : "You appear to be offline. Check your internet connection and try again.";
    }
    return lang === "ar"
      ? "خدمة QuickServe غير متاحة مؤقتاً. حاول مرة أخرى بعد قليل."
      : "QuickServe is temporarily unavailable. Please try again in a moment.";
  }
  return humanError(error, lang);
}

function AuthPage() {
  const { t, lang, toggleLang } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const target = safeSessionRedirect(search.redirect);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getResilientAuthenticatedUser } = await import("@/lib/auth-resilience");
        const user = await getResilientAuthenticatedUser();
        if (!cancelled && user) {
          const destination = await roleDestination(target, user.id);
          if (!cancelled) await navigate({ to: destination as never, replace: true });
        }
      } catch (error) {
        console.warn("Unable to restore the existing session.", error);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, target]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}${target}` },
        });
        if (error) throw error;
        if (data.session) {
          const destination = await roleDestination(target, data.user?.id ?? data.session.user.id);
          navigate({ to: destination as never, replace: true });
        } else {
          toast.success(t("auth.checkEmail"));
          setMode("signin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        if (!data.session) throw new Error("Authentication succeeded but no session was created. Please try again.");
        const destination = await roleDestination(target, data.user?.id ?? data.session.user.id);
        navigate({ to: destination as never, replace: true });
      }
    } catch (error) {
      const message = authFailureMessage(error, lang);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}${target}` });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const destination = await roleDestination(target);
      navigate({ to: destination as never, replace: true });
    } catch (error) {
      const message = authFailureMessage(error, lang);
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error(lang === "ar" ? "أدخل بريدك الإلكتروني أولاً." : "Enter your email address first.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/auth` });
      if (error) throw error;
      toast.success(lang === "ar" ? "تم إرسال رابط إعادة تعيين كلمة المرور." : "Password reset link sent.");
    } catch (error) {
      toast.error(authFailureMessage(error, lang));
    }
  }

  const isArabic = lang === "ar";

  return (
    <main dir="ltr" className="min-h-dvh bg-background lg:grid lg:grid-cols-[44.5%_55.5%]">
      <section dir={isArabic ? "rtl" : "ltr"} className="relative z-10 flex min-h-dvh flex-col bg-card px-6 py-7 sm:px-10 lg:px-[4.5vw] lg:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" aria-label="QuickServe home" className="text-foreground">
            <BrandLogo className="size-10" accentClassName="text-foreground" textClassName="text-[23px] text-foreground" />
          </Link>
          <div className="flex items-center gap-1">
            <button type="button" onClick={toggleLang} className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={isArabic ? "Switch to English" : "التبديل إلى العربية"}>
              <Globe2 className="size-4" />
            </button>
            <ThemeToggle compact />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center py-10 lg:py-14">
          <h1 className="font-display text-[clamp(2.25rem,4vw,4.15rem)] font-bold leading-[.98] tracking-[-.055em] text-foreground">
            {mode === "signup" ? (isArabic ? "أنشئ حسابك" : "Create account") : (isArabic ? "مرحباً بعودتك" : "Welcome back")}
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
            {isArabic ? "سجّل الدخول إلى QuickServe وحافظ على سير مطعمك بسلاسة." : "Sign in to your QuickServe account and keep your restaurant running smoothly."}
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5" noValidate>
            {mode === "signup" ? (
              <label className="block space-y-2" htmlFor="name">
                <span className="text-sm font-semibold">{t("auth.name")}</span>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" disabled={busy} className="h-[58px] rounded-xl border-border bg-card px-4 text-base" />
              </label>
            ) : null}

            <label className="block space-y-2" htmlFor="email">
              <span className="text-sm font-semibold">{isArabic ? "البريد الإلكتروني" : "Email address"}</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-4 top-1/2 size-[19px] -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.com" required autoComplete="email" disabled={busy} className="h-[58px] rounded-xl border-border bg-card ps-12 pe-4 text-base" dir="ltr" />
              </div>
            </label>

            <label className="block space-y-2" htmlFor="password">
              <span className="text-sm font-semibold">{t("auth.password")}</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-[19px] -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isArabic ? "أدخل كلمة المرور" : "Enter your password"} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} disabled={busy} className="h-[58px] rounded-xl border-border bg-card ps-12 pe-12 text-base" dir="ltr" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute end-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </label>

            {mode === "signin" ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-[18px] accent-[#ff5a0a]" />
                  <span>{isArabic ? "تذكرني" : "Remember me"}</span>
                </label>
                <button type="button" onClick={() => void forgotPassword()} className="font-semibold text-blue-600 hover:underline">{isArabic ? "نسيت كلمة المرور؟" : "Forgot password?"}</button>
              </div>
            ) : null}

            <button type="submit" disabled={busy} className="qs-button-primary h-[58px] w-full rounded-xl text-[16px] disabled:opacity-60">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <>{mode === "signup" ? t("auth.signUp") : t("auth.signIn")}<ArrowRight className="size-5" /></>}
            </button>
          </form>

          <div className="my-7 flex items-center gap-4 text-xs font-medium text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>{t("auth.or")}</span><span className="h-px flex-1 bg-border" /></div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link to="/staff" className="flex min-h-[74px] items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-sm transition hover:bg-muted/50">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted"><UsersRound className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{isArabic ? "وصول الموظفين السريع" : "Staff Quick Access"}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{isArabic ? "الدخول باستخدام PIN" : "Sign in with your staff PIN"}</span></span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
            <button type="button" onClick={() => void handleGoogle()} disabled={busy} className="flex min-h-[74px] items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-sm transition hover:bg-muted/50 disabled:opacity-60">
              <span className="grid size-8 place-items-center rounded-full bg-muted font-bold">G</span>{t("auth.google")}
            </button>
          </div>

          {errorMessage ? (
            <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-background">{isNetworkError(errorMessage) ? <WifiOff className="size-3.5" /> : "!"}</span>
              <span className="leading-5">{errorMessage}</span>
            </div>
          ) : null}

          <p className="mt-7 text-center text-sm text-muted-foreground">
            {mode === "signup" ? t("auth.haveAccount") : (isArabic ? "جديد في QuickServe؟" : "New to QuickServe?")} {" "}
            <button type="button" className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:text-[#ff5a0a]" onClick={() => { setMode((v) => v === "signup" ? "signin" : "signup"); setErrorMessage(null); }}>
              {mode === "signup" ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </p>
        </div>
      </section>

      <section className="relative hidden min-h-dvh overflow-hidden border-s border-border bg-[#fffaf6] dark:bg-[#11171b] lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(255,90,10,.13),transparent_34%),radial-gradient(circle_at_12%_86%,rgba(255,90,10,.08),transparent_34%)]" />
        <div className="relative flex flex-1 flex-col px-[5vw] pb-8 pt-12">
          <div className="max-w-[680px]">
            <div className="h-1 w-9 rounded-full bg-[#ff5a0a]" />
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[.28em] text-muted-foreground">Restaurants run better with QuickServe</p>
            <h2 className="mt-5 font-display text-[clamp(3rem,4.6vw,5.1rem)] font-bold leading-[1.02] tracking-[-.055em] text-foreground">Good food<br />brings people together.</h2>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-muted-foreground">Powerful tools to simplify operations, delight guests, and grow your business — all in one place.</p>
          </div>

          <div className="relative mt-10 flex-1 min-h-[390px]">
            <img src="/signin-restaurant.webp" alt="" className="absolute bottom-0 start-0 h-[56%] w-[43%] rounded-[24px] object-cover shadow-2xl" loading="eager" />
            <div className="absolute bottom-[7%] end-0 w-[78%] rotate-[-1deg] overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_30px_70px_rgba(20,25,30,.20)]">
              <div className="flex h-12 items-center gap-2 border-b border-border px-4"><BrandLogo className="size-6" markOnly /><div className="ms-auto h-7 w-[42%] rounded-lg bg-muted" /><div className="h-7 w-24 rounded-lg bg-muted" /></div>
              <div className="grid grid-cols-[118px_1fr]">
                <div className="bg-[#151a1e] p-3 text-white"><p className="text-xs font-bold">QuickServe</p>{["Overview","Orders","Menu","Tables","Staff","Analytics"].map((x,i)=><div key={x} className={`mt-3 rounded-md px-2 py-1.5 text-[9px] ${i===0?"bg-[#ff5a0a]/20 text-white":"text-white/60"}`}>{x}</div>)}</div>
                <div className="p-5"><h3 className="font-display text-xl font-bold">Hello again!</h3><p className="mt-1 text-[10px] text-muted-foreground">Here’s what’s happening at your restaurant today.</p><div className="mt-4 grid grid-cols-2 gap-3"><MiniMetric icon={<BarChart3 className="size-4" />} label="Today’s Sales" value="$4,892" /><MiniMetric icon={<Zap className="size-4" />} label="Active Orders" value="18" /></div><div className="mt-4 rounded-xl border border-border"><div className="flex items-center justify-between border-b px-3 py-2 text-[10px] font-bold"><span>Recent Orders</span><span className="text-blue-600">View all →</span></div>{["#1042 · Chicken Burger","#1041 · Margherita Pizza","#1040 · Grilled Salmon"].map((x,i)=><div key={x} className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[9px] last:border-0"><span>{x}</span><span className={`rounded px-1.5 py-1 ${i===2?"bg-green-100 text-green-700":"bg-orange-100 text-orange-700"}`}>{i===2?"Ready":"Preparing"}</span></div>)}</div></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-border pt-6">
            <Feature icon={<Zap className="size-5" />} title="Faster Operations" text="Save time, serve more." />
            <Feature icon={<Smile className="size-5" />} title="Happier Guests" text="Great food. Great experiences." />
            <Feature icon={<BarChart3 className="size-5" />} title="Higher Sales" text="A stronger tomorrow." />
          </div>
        </div>
      </section>
    </main>
  );
}

function MiniMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-background p-3"><div className="grid size-8 place-items-center rounded-full bg-orange-50 text-[#ff5a0a]">{icon}</div><p className="mt-2 text-[9px] text-muted-foreground">{label}</p><p className="font-display text-lg font-bold">{value}</p></div>;
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50 text-[#ff5a0a]">{icon}</span><span><span className="block text-xs font-bold">{title}</span><span className="mt-1 block text-[10px] text-muted-foreground">{text}</span></span></div>;
}
