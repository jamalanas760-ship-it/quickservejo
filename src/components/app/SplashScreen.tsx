import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";

const FLAG = "quickserve.splash.shown";
/** Diner-facing routes never show the app splash — they must feel instant. */
const SKIP_PREFIXES = ["/r/", "/o/", "/staff/badge"];

/**
 * Animated launch screen. Shows once per browser session, fades itself out and
 * never blocks navigation: the app renders underneath while it plays.
 */
export function SplashScreen() {
  const { lang } = useI18n();
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");

  useEffect(() => {
    const path = window.location.pathname;
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;
    if (window.sessionStorage.getItem(FLAG)) return;
    window.sessionStorage.setItem(FLAG, "1");
    setPhase("visible");
    const leave = window.setTimeout(() => setPhase("leaving"), 1000);
    const done = window.setTimeout(() => setPhase("hidden"), 1500);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] grid place-items-center bg-background transition-opacity duration-500 ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 opacity-70 [background:radial-gradient(60%_40%_at_50%_35%,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent_70%)]" />
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative grid place-items-center">
          <span className="absolute size-28 animate-[qs-splash-ring_1.4s_ease-out_infinite] rounded-full border-2 border-primary/40" />
          <span className="absolute size-28 animate-[qs-splash-ring_1.4s_ease-out_0.35s_infinite] rounded-full border-2 border-primary/25" />
          <BrandLogo
            className="size-16 animate-[qs-splash-pop_0.6s_cubic-bezier(0.22,1,0.36,1)]"
            textClassName="hidden"
          />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-semibold tracking-tight">QuickServe</p>
          <p className="text-xs text-muted-foreground">
            {lang === "ar" ? "جارٍ تهيئة مساحة العمل…" : "Preparing your workspace…"}
          </p>
          <span className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-1/3 animate-[qs-splash-bar_1.1s_ease-in-out_infinite] rounded-full bg-primary" />
          </span>
        </div>
      </div>
    </div>
  );
}
