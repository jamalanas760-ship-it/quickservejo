import { Activity, CheckCircle2, Layers3, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";

const FLAG = "quickserve.splash.shown.v2";
/** Diner-facing routes never show the app splash — they must feel instant. */
const SKIP_PREFIXES = ["/r/", "/o/", "/staff/badge"];

export function SplashScreen() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");
  const [step, setStep] = useState(0);

  const steps = useMemo(
    () => [
      {
        icon: Layers3,
        en: "Loading your workspace",
        ar: "تحميل مساحة العمل",
        detailEn: "Preparing your restaurant tools and navigation",
        detailAr: "تجهيز أدوات المطعم والتنقل",
      },
      {
        icon: Activity,
        en: "Syncing live operations",
        ar: "مزامنة العمليات المباشرة",
        detailEn: "Orders, tables and workforce are connecting",
        detailAr: "ربط الطلبات والطاولات والقوى العاملة",
      },
      {
        icon: CheckCircle2,
        en: "Ready to serve",
        ar: "جاهز للتشغيل",
        detailEn: "QuickServe is ready",
        detailAr: "QuickServe جاهز",
      },
    ],
    [],
  );

  useEffect(() => {
    const path = window.location.pathname;
    if (SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
    if (window.sessionStorage.getItem(FLAG)) return;
    window.sessionStorage.setItem(FLAG, "1");
    setPhase("visible");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stepOne = window.setTimeout(() => setStep(1), reduceMotion ? 100 : 420);
    const stepTwo = window.setTimeout(() => setStep(2), reduceMotion ? 210 : 820);
    const leave = window.setTimeout(() => setPhase("leaving"), reduceMotion ? 520 : 1260);
    const done = window.setTimeout(() => setPhase("hidden"), reduceMotion ? 690 : 1540);

    return () => {
      window.clearTimeout(stepOne);
      window.clearTimeout(stepTwo);
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "hidden") return null;

  const current = steps[Math.min(step, steps.length - 1)];
  const CurrentIcon = current.icon;
  const progress = step === 0 ? 28 : step === 1 ? 67 : 100;

  return (
    <div
      aria-hidden
      className={`qs-launch-screen fixed inset-0 z-[100] overflow-hidden transition-opacity duration-300 ${phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="qs-launch-aurora qs-launch-aurora-a" />
      <div className="qs-launch-aurora qs-launch-aurora-b" />
      <div className="qs-launch-grid" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[980px] items-center justify-center px-5 py-10">
        <div className="qs-launch-shell">
          <div className="qs-launch-brand">
            <div className="qs-launch-logo-wrap">
              <span className="qs-launch-ring qs-launch-ring-a" />
              <span className="qs-launch-ring qs-launch-ring-b" />
              <span className="qs-launch-logo-card"><BrandLogo markOnly className="size-12 sm:size-14" /></span>
              <span className="qs-launch-bolt"><Zap className="size-3.5" /></span>
            </div>
            <div className="text-center">
              <p className="font-display text-3xl font-black tracking-[-.05em] sm:text-4xl">QuickServe</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
                {ar ? "تشغيل المطعم بذكاء" : "Restaurant operations, connected"}
              </p>
            </div>
          </div>

          <div className="qs-launch-status">
            <div className="qs-launch-status-icon"><CurrentIcon className="size-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <strong className="truncate text-sm">{ar ? current.ar : current.en}</strong>
                <span className="text-[10px] font-black tabular-nums text-[#e85d2a]">{progress}%</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{ar ? current.detailAr : current.detailEn}</p>
            </div>
          </div>

          <div className="qs-launch-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>

          <div className="qs-launch-steps">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const active = index <= step;
              return <div key={item.en} className={`qs-launch-step ${active ? "is-active" : ""} ${index === step ? "is-current" : ""}`}><span><Icon className="size-3.5" /></span><small>{ar ? item.ar : item.en}</small></div>;
            })}
          </div>

          <p className="qs-launch-footnote">{ar ? "سريع · مباشر · منظم" : "Fast · Live · Organized"}</p>
        </div>
      </div>
    </div>
  );
}
