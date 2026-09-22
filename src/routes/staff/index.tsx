import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicSiteShell } from "@/components/public/PublicSiteShell";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { roleDestination } from "@/lib/post-signin";
import { staffPinSignIn } from "@/lib/staff-auth.functions";

const CODE_KEY = "quickserve.staffCode";

export const Route = createFileRoute("/staff/")({
  head: () => ({
    meta: [
      { title: "Staff PIN sign in — QuickServe" },
      {
        name: "description",
        content:
          "Fast staff sign in: enter your restaurant code and personal 6-digit PIN to open the kitchen or management workspace.",
      },
      { property: "og:title", content: "Staff PIN sign in — QuickServe" },
      { property: "og:description", content: "Restaurant code plus PIN — no email or password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPinPage,
});

function StaffPinPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const signIn = useServerFn(staffPinSignIn);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CODE_KEY);
    if (stored) setCode(stored);
  }, []);

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await signIn({
        data: { restaurantCode: code.trim().toUpperCase(), pin: value },
      });
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: result.tokenHash,
      });
      if (error) throw error;
      window.localStorage.setItem(CODE_KEY, code.trim().toUpperCase());
      navigate({ to: await roleDestination(), replace: true });
    } catch (error) {
      setPin("");
      toast.error(humanError(error, lang));
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy || pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 6 && code.trim().length >= 4) void submit(next);
  }

  return (
    <PublicSiteShell showSignIn={false} contentClassName="max-w-5xl py-5 sm:py-8">
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--qs-shadow-float)] lg:grid-cols-[minmax(0,1fr)_410px]">
        <section className="relative hidden min-h-[660px] overflow-hidden lg:block">
          <img src="/signin-restaurant.webp" alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/28 to-black/10" />
          <div className="absolute inset-x-9 bottom-9 text-white">
            <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-orange-300">QuickServe Frontline</p>
            <h1 className="mt-3 max-w-md font-display text-4xl font-bold leading-tight tracking-[-.045em]">{lang === "ar" ? "ابدأ ورديتك بثوانٍ" : "Start your shift in seconds"}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-white/75">{lang === "ar" ? "وصول آمن وسريع للمطبخ والكاشير وخدمة الطاولات." : "Fast, secure access to kitchen, cashier and table service."}</p>
          </div>
        </section>

        <section className="p-4 sm:p-7 lg:flex lg:flex-col lg:justify-center lg:p-8">
          <div className="mb-5 overflow-hidden rounded-xl lg:hidden">
            <div className="relative h-32">
              <img src="/signin-restaurant.webp" alt="" className="size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/10" />
              <p className="absolute inset-x-4 bottom-4 font-display text-xl font-bold text-white">{lang === "ar" ? "ابدأ ورديتك" : "Start your shift"}</p>
            </div>
          </div>

        <div className="space-y-5 rounded-2xl border border-border bg-background p-5 sm:p-6">
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold">{t("staffAuth.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("staffAuth.subtitle")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restaurant-code">{t("staffAuth.restaurantCode")}</Label>
            <Input
              id="restaurant-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              className="text-center text-lg font-mono tracking-widest"
              maxLength={12}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("staffAuth.pin")}</Label>
            <div className="flex justify-center gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={`size-9 rounded-md border text-center text-xl leading-9 ${
                    pin.length > i ? "bg-foreground/90 text-background" : "bg-card"
                  }`}
                >
                  {pin.length > i ? "•" : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Button
                key={d}
                type="button"
                variant="outline"
                className="h-14 text-xl"
                onClick={() => press(d)}
              >
                {d}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="h-14"
              onClick={() => setPin("")}
              disabled={busy}
            >
              {t("staffAuth.clear")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 text-xl"
              onClick={() => press("0")}
            >
              0
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-14"
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={busy}
            >
              <Delete className="size-5" />
            </Button>
          </div>

          <Button
            className="w-full"
            disabled={busy || pin.length !== 6 || code.trim().length < 4}
            onClick={() => void submit(pin)}
          >
            {t("auth.signIn")}
          </Button>

          <p className="text-center text-xs text-muted-foreground">{t("staffAuth.badgeHint")}</p>
          <p className="text-center text-sm">
            <Link to="/auth" className="underline underline-offset-4">
              {t("staffAuth.useEmail")}
            </Link>
          </p>
        </div>
        </section>
      </div>
    </PublicSiteShell>
  );
}
