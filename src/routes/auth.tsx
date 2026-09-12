import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Globe2, Loader2, LockKeyhole, Mail, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useI18n } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { humanError } from "@/lib/errors";
import { roleDestination } from "@/lib/post-signin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const target = safeRedirect(search.redirect);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data.session) {
          const destination = await roleDestination(target, data.session.user.id);
          if (!cancelled) await navigate({ to: destination as never, replace: true });
        }
      } catch (error) {
        // Session restoration must not replace a usable sign-in screen with a
        // global availability error. The user can still sign in normally.
        console.warn("Unable to restore the existing session.", error);
      }
    })();

    return () => {
      cancelled = true;
    };
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
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${window.location.origin}${target}`,
          },
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
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) throw error;
        if (!data.session) {
          throw new Error("Authentication succeeded but no session was created. Please try again.");
        }

        // signInWithPassword has already authenticated the user. A role lookup
        // must never convert that success into a false login/network failure.
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
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}${target}`,
      });

      if (result.error) {
        const message = authFailureMessage(result.error, lang);
        setErrorMessage(message);
        toast.error(message);
        return;
      }

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

  const isArabic = lang === "ar";

  return (
    <main dir="ltr" className="min-h-dvh bg-white lg:grid lg:grid-cols-2">
      <section aria-label={isArabic ? "مرحباً بك في مطعمك" : "Welcome to your restaurant"} className="relative h-44 overflow-hidden bg-[#ddd6c9] sm:h-60 lg:sticky lg:top-0 lg:h-dvh">
        <img src="/signin-restaurant.webp" alt="" className="h-full w-full object-cover object-center" fetchPriority="high" />
      </section>

      <section dir={isArabic ? "rtl" : "ltr"} className="flex min-h-[calc(100dvh-11rem)] items-center justify-center bg-white px-6 py-8 sm:px-10 lg:min-h-dvh lg:px-[6.3vw]">
        <div className="w-full max-w-[480px]">
          <div className="mb-16 flex items-center justify-between">
            <Link to="/" aria-label="QuickServe home" className="text-[#254b3d]">
              <BrandLogo className="size-9" accentClassName="text-[#254b3d]" textClassName="text-xl" />
            </Link>

            <button
              type="button"
              onClick={toggleLang}
              className="ms-auto inline-flex h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-[#254b3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#254b3d]"
              aria-label={isArabic ? "Switch to English" : "التبديل إلى العربية"}
            >
              <Globe2 className="size-4" />
              {isArabic ? "English" : "العربية"}
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-[clamp(30px,3vw,39px)] font-bold tracking-[-0.035em] text-[#0d0b0a]">
              {isArabic ? "تسجيل الدخول إلى QuickServe" : "Sign in to QuickServe"}
            </h2>
            <p className="text-[15px] leading-6 text-[#7a726b]">
              {isArabic ? "لموظفي المطاعم ومديري المنصة." : "For restaurant staff and platform administrators."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5" noValidate>
            {mode === "signup" && (
              <label className="block space-y-2" htmlFor="name">
                <span className="text-[15px] font-medium text-[#17120f]">{t("auth.name")}</span>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  disabled={busy}
                  className="h-12 rounded-xl border-[#ddd7d1] bg-white px-4 text-base shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-visible:border-[#3d3027] focus-visible:ring-[#3d3027]/15"
                />
              </label>
            )}

            <label className="block space-y-2" htmlFor="email">
              <span className="text-[15px] font-medium text-[#17120f]">{t("auth.email")}</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8c837b]" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={busy}
                  className="h-12 rounded-xl border-[#ddd7d1] bg-white pl-11 pr-4 text-base shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-visible:border-[#3d3027] focus-visible:ring-[#3d3027]/15"
                  dir="ltr"
                />
              </div>
            </label>

            <label className="block space-y-2" htmlFor="password">
              <span className="text-[15px] font-medium text-[#17120f]">{t("auth.password")}</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8c837b]" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  disabled={busy}
                  className="h-12 rounded-xl border-[#ddd7d1] bg-white pl-11 pr-11 text-base shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus-visible:border-[#3d3027] focus-visible:ring-[#3d3027]/15"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={busy}
                  className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[#8c837b] transition-colors hover:text-[#3d3027] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d3027]/20"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            <Button
              type="submit"
              disabled={busy}
              className="h-12 w-full rounded-xl bg-[#254b3d] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#18382c] disabled:opacity-70"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
            </Button>
          </form>

          <div className="my-7 flex items-center gap-4 text-xs font-medium text-[#9a928c]">
            <span className="h-px flex-1 bg-[#e3ded9]" />
            <span>{t("auth.or")}</span>
            <span className="h-px flex-1 bg-[#e3ded9]" />
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-xl border-[#ddd7d1] bg-white text-[15px] font-medium text-[#17120f] shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:bg-[#faf8f6]"
              onClick={handleGoogle}
              disabled={busy}
            >
              <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full text-[14px] font-bold">G</span>
              {t("auth.google")}
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="h-12 w-full rounded-xl bg-[#f6f1e8] text-[15px] font-medium text-[#30251e] shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:bg-[#eee6da]"
              asChild
              disabled={busy}
            >
              <Link to="/staff">{t("staffAuth.usePin")}</Link>
            </Button>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-xl border border-[#ebe5df] bg-[#faf8f6] px-4 py-3.5 text-sm text-[#352b24] shadow-sm"
            >
              <div className="mt-0.5 rounded-full bg-[#21160f] p-1.5 text-white">
                {isNetworkError(errorMessage) ? <WifiOff className="size-3.5" /> : <span className="block size-3.5 text-center text-[10px] font-bold">!</span>}
              </div>
              <span className="leading-5">{errorMessage}</span>
            </div>
          )}

          <p className="mt-7 text-center text-sm text-[#817870]">
            {mode === "signup" ? t("auth.haveAccount") : t("auth.noAccount")} {" "}
            <button
              type="button"
              className="font-semibold text-[#2f251f] underline decoration-[#c9b9ac] underline-offset-4 transition-colors hover:text-orange-600"
              onClick={() => {
                setMode((value) => (value === "signup" ? "signin" : "signup"));
                setErrorMessage(null);
              }}
            >
              {mode === "signup" ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
