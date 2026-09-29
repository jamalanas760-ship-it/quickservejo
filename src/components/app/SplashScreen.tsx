import { ClipboardCheck, Table2, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";

const FLAG = "quickserve.splash.shown";
/** Diner-facing routes never show the app splash — they must feel instant. */
const SKIP_PREFIXES = ["/r/", "/o/", "/staff/badge"];

export function SplashScreen() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");

  useEffect(() => {
    const path = window.location.pathname;
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return;
    if (window.sessionStorage.getItem(FLAG)) return;
    window.sessionStorage.setItem(FLAG, "1");
    setPhase("visible");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leave = window.setTimeout(() => setPhase("leaving"), reduceMotion ? 450 : 1050);
    const done = window.setTimeout(() => setPhase("hidden"), reduceMotion ? 650 : 1450);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      className={`qs-master-splash fixed inset-0 z-[100] overflow-hidden bg-background transition-opacity duration-400 ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="qs-master-splash-grid" />
      <div className="qs-master-splash-orbit qs-master-splash-orbit-a" />
      <div className="qs-master-splash-orbit qs-master-splash-orbit-b" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[920px] flex-col items-center justify-center px-5 py-10">
        <div className="qs-master-splash-brand">
          <div className="qs-master-splash-logo">
            <span className="qs-master-splash-logo-ring" />
            <BrandLogo className="size-14 sm:size-16" textClassName="hidden" />
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-bold tracking-[-.04em] sm:text-3xl">QuickServe</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground sm:text-sm">
              {ar ? "نحضّر مساحة التشغيل الخاصة بك" : "Preparing your operations workspace"}
            </p>
          </div>
        </div>

        <div className="qs-master-splash-board mt-8 w-full max-w-[720px]">
          <div className="qs-master-splash-board-top">
            <span className="qs-master-splash-board-title">{ar ? "تشغيل المطعم" : "Restaurant operations"}</span>
            <span className="qs-master-splash-live"><i />{ar ? "مباشر" : "Live"}</span>
          </div>
          <div className="qs-master-splash-cards">
            <div className="qs-master-splash-card">
              <span className="qs-master-splash-icon"><ClipboardCheck className="size-4" /></span>
              <span><b>{ar ? "الطلبات" : "Orders"}</b><small>{ar ? "مزامنة الخدمة" : "Syncing service"}</small></span>
            </div>
            <div className="qs-master-splash-card">
              <span className="qs-master-splash-icon"><Table2 className="size-4" /></span>
              <span><b>{ar ? "الطاولات" : "Tables"}</b><small>{ar ? "تحديث الحالة" : "Updating status"}</small></span>
            </div>
            <div className="qs-master-splash-card">
              <span className="qs-master-splash-icon"><UsersRound className="size-4" /></span>
              <span><b>{ar ? "القوى العاملة" : "Workforce"}</b><small>{ar ? "تحميل ورديات اليوم" : "Loading today's shifts"}</small></span>
            </div>
          </div>
          <div className="qs-master-splash-rail"><span /></div>
        </div>

        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground/80">
          {ar ? "سريع · مباشر · منظم" : "Fast · Live · Organized"}
        </p>
      </div>
    </div>
  );
}
