import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const { t, lang, toggleLang } = useI18n();
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
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-display text-lg font-bold">
            Quick<span className="text-accent">Serve</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={toggleLang} type="button">
            {t("common.language")}
          </Button>
        </div>

        <div className="panel space-y-5 p-6">
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
      </div>
    </main>
  );
}
