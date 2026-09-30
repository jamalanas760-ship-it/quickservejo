import { Activity, CheckCircle2, Layers3, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { useI18n } from "@/lib/i18n";

const FLAG = "quickserve.splash.shown.v3";
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
        en: "Preparing workspace",
        ar: "تجهيز مساحة العمل",
        detailEn: "Loading your restaurant tools",
        detailAr: "تحميل أدوات المطعم",
        progress: 26,
      },
      {
        icon: Activity,
        en: "Syncing live operations",
        ar: "مزامنة العمليات المباشرة",
        detailEn: "Orders, tables and workforce are connecting",
        detailAr: "ربط الطلبات والطاولات والقوى العاملة",
        progress: 68,
      },
      {
        icon: CheckCircle2,
        en: "Ready to serve",
        ar: "جاهز للتشغيل",
        detailEn: "Your workspace is ready",
        detailAr: "مساحة العمل جاهزة",
        progress: 100,
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
    const one = window.setTimeout(() => setStep(1), reduceMotion ? 120 : 420);
    const two = window.setTimeout(() => setStep(2), reduceMotion ? 260 : 860);
    const leave = window.setTimeout(() => setPhase("leaving"), reduceMotion ? 580 : 1320);
    const done = window.setTimeout(() => setPhase("hidden"), reduceMotion ? 760 : 1600);

    return () => {
      window.clearTimeout(one);
      window.clearTimeout(two);
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "hidden") return null;

  const current = steps[Math.min(step, steps.length - 1)];
  const CurrentIcon = current.icon;

  return (
    <div
      aria-hidden
      className={`qs-launch-v3 fixed inset-0 z-[100] overflow-hidden transition-opacity duration-300 ${phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="qs-launch-v3-noise" />
      <div className="qs-launch-v3-glow qs-launch-v3-glow-a" />
      <div className="qs-launch-v3-glow qs-launch-v3-glow-b" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[980px] items-center justify-center px-5 py-10">
        <section className="qs-launch-v3-card">
          <div className="qs-launch-v3-brand">
            <div className="qs-launch-v3-logo-wrap">
              <span className="qs-launch-v3-ring qs-launch-v3-ring-a" />
              <span className="qs-launch-v3-ring qs-launch-v3-ring-b" />
              <span className="qs-launch-v3-logo"><BrandLogo markOnly className="size-[46px]" /></span>
              <span className="qs-launch-v3-live"><Zap className="size-3.5" /></span>
            </div>

            <div className="text-center">
              <h1 className="font-display text-[32px] font-black tracking-[-.05em] sm:text-[38px]">QuickServe</h1>
              <p className="mt-1 text-[11px] font-semibold tracking-[.05em] text-muted-foreground sm:text-xs">
                {ar ? "تشغيل مطعمك بوضوح وسرعة" : "Restaurant operations, beautifully connected"}
              </p>
            </div>
          </div>

          <div className="qs-launch-v3-state">
            <span className="qs-launch-v3-state-icon"><CurrentIcon className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{ar ? current.ar : current.en}</strong>
              <small className="mt-0.5 block truncate text-[10px] text-muted-foreground">{ar ? current.detailAr : current.detailEn}</small>
            </span>
            <span className="qs-launch-v3-percent">{current.progress}%</span>
          </div>

          <div className="qs-launch-v3-progress" aria-hidden="true">
            <span style={{ width: `${current.progress}%` }}><i /></span>
          </div>

          <div className="qs-launch-v3-steps">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const done = index < step;
              const active = index === step;
              return (
                <div key={item.en} className={`qs-launch-v3-step ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}>
                  <span className="qs-launch-v3-step-icon"><Icon className="size-3.5" /></span>
                  <span className="min-w-0">
                    <b>{ar ? item.ar : item.en}</b>
                    <small>{done ? (ar ? "تم" : "Done") : active ? (ar ? "جاري الآن" : "In progress") : (ar ? "التالي" : "Next")}</small>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="qs-launch-v3-footer">
            <span>{ar ? "سريع" : "Fast"}</span><i />
            <span>{ar ? "مباشر" : "Live"}</span><i />
            <span>{ar ? "منظم" : "Organized"}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
