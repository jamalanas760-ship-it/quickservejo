import { useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import "./splash-screen.css";
import { LaunchScene } from "./LaunchScene";

const FLAG = "quickserve.splash.shown.v5";
function rememberLaunch() {
  try {
    sessionStorage.setItem(FLAG, String(performance.timeOrigin));
  } catch {
    /* Session-only animation still works. */
  }
}
const WORKSPACE_PATH =
  /^\/(dashboard|manage|shifts|profile|bookings|automations|operations|team|settings|tables|menu|orders|analytics|notifications|work|manager|kitchen|waiter|host|cashier|hq|devices|integrations|guests|campaigns|approvals|daily-close|super-admin)(\/|$)/;

/** Each new document gets a launch, including entry through sign-in. */
const LaunchOverlay = createContext(false);

export function LaunchScreenProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  return (
    <LaunchOverlay.Provider value={active}>
      <SplashScreen onVisibilityChange={setActive} />
      {children}
    </LaunchOverlay.Provider>
  );
}

export function SplashScreen({
  onVisibilityChange,
}: {
  onVisibilityChange?: (active: boolean) => void;
}) {
  const { lang } = useI18n();
  const pending = useRouterState({ select: (state) => state.isLoading });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const started = useRef(false);
  const [visible, setVisible] = useState(false);
  const [minimumDone, setMinimumDone] = useState(false);
  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [visible, onVisibilityChange]);
  useEffect(() => {
    const installedEntry =
      pathname === "/" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone);
    if (
      started.current ||
      !(WORKSPACE_PATH.test(pathname) || pathname === "/auth" || installedEntry)
    )
      return;
    try {
      if (sessionStorage.getItem(FLAG) === String(performance.timeOrigin)) return;
    } catch {
      /* Storage restrictions must not block startup. */
    }
    started.current = true;
    setVisible(true);
  }, [pathname]);
  useEffect(() => {
    if (!visible) return;
    const minimum = window.setTimeout(() => setMinimumDone(true), 3500);
    // Reveal the normal page loading/error controls even on a slow connection.
    const safety = window.setTimeout(() => {
      rememberLaunch();
      setVisible(false);
    }, 3900);
    return () => {
      window.clearTimeout(safety);
      window.clearTimeout(minimum);
    };
  }, [visible]);
  useEffect(() => {
    if (!visible || pending || !minimumDone) return;
    const timer = window.setTimeout(() => {
      rememberLaunch();
      setVisible(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [visible, pending, minimumDone]);
  if (!visible) return null;
  return <LaunchScreenView lang={lang} leaving={minimumDone && !pending} primary />;
}

/** Same artwork during server boot, session restoration and client launch. */
export function LaunchScreenView({
  lang = "en",
  leaving = false,
  primary = false,
}: {
  lang?: "en" | "ar";
  leaving?: boolean;
  primary?: boolean;
}) {
  const overlayActive = useContext(LaunchOverlay);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  if (overlayActive && !primary) return null;
  if (expired)
    return (
      <section className="qs-workspace-recovery" role="alert">
        <h1>
          {lang === "ar"
            ? "يستغرق الاتصال وقتاً أطول من المعتاد"
            : "Connection is taking longer than expected"}
        </h1>
        <p>
          {lang === "ar"
            ? "تحقق من الاتصال ثم أعد المحاولة."
            : "Check your connection, then retry."}
        </p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </button>
          <a href="/auth">{lang === "ar" ? "تسجيل الدخول" : "Sign in"}</a>
        </div>
      </section>
    );
  return (
    <div
      className={`qs-launch-simple${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Preparing your workspace"}
    >
      <div className="qs-chrome-editorial" aria-hidden="true" dir="ltr">
        <span>A little theatre.</span>
        <span>A perfect serve.</span>
      </div>
      <LaunchScene />
      <div className="qs-launch-simple-content">
        <div className="qs-launch-brand">
          <span className="qs-launch-caption">
            {lang === "ar" ? "تفاصيل تصنع الفرق." : "THE ART OF A PERFECT SERVE."}
          </span>
          <strong dir="ltr">
            Quick<span>Serve</span>
          </strong>
          <p>{lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Preparing your workspace"}</p>
          <div className="qs-launch-ambient" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
