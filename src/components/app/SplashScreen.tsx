import { useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  const gradient = useId().replace(/:/g, "");
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
      <div className="qs-launch-simple-content">
        <div className="qs-launch-stage" aria-hidden="true">
          <span className="qs-launch-halo" />
          <LaunchScene />
          <svg className="qs-launch-still" viewBox="0 0 360 280" focusable="false">
            <defs>
              <linearGradient id={`${gradient}-metal`} x1="0" y1="0" x2="1" y2=".3">
                <stop stopColor="#a79a8b" />
                <stop offset=".3" stopColor="#fff5e5" />
                <stop offset=".6" stopColor="#e1c6a7" />
                <stop offset="1" stopColor="#9f8065" />
              </linearGradient>
              <linearGradient id={`${gradient}-plate`}>
                <stop stopColor="#a08568" />
                <stop offset=".5" stopColor="#fff3e2" />
                <stop offset="1" stopColor="#be9b78" />
              </linearGradient>
              <radialGradient id={`${gradient}-shadow`}>
                <stop stopColor="#be6d36" stopOpacity=".18" />
                <stop offset="1" stopColor="#be6d36" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="180" cy="225" rx="118" ry="23" fill={`url(#${gradient}-shadow)`} />
            <ellipse cx="180" cy="201" rx="101" ry="17" fill={`url(#${gradient}-plate)`} />
            <ellipse
              cx="180"
              cy="196"
              rx="95"
              ry="13"
              fill="none"
              stroke="#f68a36"
              strokeWidth="2"
            />
            <path
              d="M95 180C97 130 129 101 180 101S263 130 265 180Q180 207 95 180Z"
              fill={`url(#${gradient}-metal)`}
            />
            <path d="M97 180Q180 204 263 180" fill="none" stroke="#f8e7cf" strokeWidth="5" />
            <path
              d="M170 101V95C170 83 190 83 190 95V101"
              fill="none"
              stroke="#f78a35"
              strokeWidth="5"
            />
          </svg>
        </div>
        <strong>
          Quick<span>Serve</span>
        </strong>
        <p>{lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Preparing your workspace"}</p>
        <div className="qs-launch-simple-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
