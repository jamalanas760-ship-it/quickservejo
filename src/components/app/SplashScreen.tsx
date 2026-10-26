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
      <div className="qs-launch-corner" aria-hidden="true">
        <span>
          QS<span className="qs-launch-corner-dot">.</span>
        </span>
        <span>RESTAURANT WORKSPACE</span>
      </div>
      <div className="qs-launch-simple-content">
        <div className="qs-launch-stage" aria-hidden="true">
          <span className="qs-launch-halo" />
          <LaunchScene />
          <svg className="qs-launch-still" viewBox="0 0 760 440" focusable="false">
            <defs>
              <linearGradient id={`${gradient}-metal`} x1="0" y1="0" x2="1" y2=".25">
                <stop stopColor="#777b7b" />
                <stop offset=".23" stopColor="#e5e5df" />
                <stop offset=".4" stopColor="#fffdf4" />
                <stop offset=".62" stopColor="#c2bcb0" />
                <stop offset=".82" stopColor="#f5ede0" />
                <stop offset="1" stopColor="#8f8a7f" />
              </linearGradient>
              <radialGradient id={`${gradient}-porcelain`}>
                <stop offset=".65" stopColor="#f4eee4" />
                <stop offset=".8" stopColor="#fffefa" />
                <stop offset="1" stopColor="#e9e0d3" />
              </radialGradient>
              <radialGradient id={`${gradient}-shadow`}>
                <stop stopColor="#735236" stopOpacity=".15" />
                <stop offset="1" stopColor="#735236" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="380" cy="341" rx="210" ry="42" fill={`url(#${gradient}-shadow)`} />
            <path d="M143 244L210 230L225 344L155 355Z" fill="#ed793c" />
            <path d="M143 244L172 250L184 348L155 355Z" fill="#d76128" />
            <g fill="none" stroke={`url(#${gradient}-metal)`} strokeWidth="8" strokeLinecap="round">
              <path d="M184 331V265M173 237V260Q184 275 195 260V237M184 237V266" />
              <path d="M570 335V237Q554 249 558 280H570" />
              <path d="M612 335V278" />
            </g>
            <ellipse cx="612" cy="254" rx="13" ry="25" fill={`url(#${gradient}-metal)`} />
            <ellipse cx="380" cy="305" rx="146" ry="49" fill={`url(#${gradient}-porcelain)`} />
            <ellipse
              cx="380"
              cy="305"
              rx="136"
              ry="43"
              fill="none"
              stroke="#c9a66b"
              strokeWidth="1.5"
            />
            <ellipse cx="380" cy="305" rx="99" ry="28" fill="#eee6d8" />
            <ellipse cx="380" cy="295" rx="35" ry="15" fill="#dba04a" />
            <path d="M369 287Q359 266 380 279Q399 259 394 280L379 289Z" fill="#608056" />
            <g transform="translate(12 -14) rotate(-8 380 200)">
              <path
                d="M263 224C264 158 307 121 380 121S496 158 497 224Q380 260 263 224Z"
                fill={`url(#${gradient}-metal)`}
              />
              <path d="M265 224Q380 259 495 224" fill="none" stroke="#e6dcc9" strokeWidth="6" />
              <path
                d="M369 121V113C369 99 391 99 391 113V121"
                fill="none"
                stroke="#d9a95c"
                strokeWidth="5"
              />
            </g>
            <g fill="none" stroke="#c9aa92" strokeWidth="2" strokeLinecap="round" opacity=".45">
              <path d="M355 269C344 256 364 250 355 238" />
              <path d="M382 264C371 251 390 245 382 232" />
              <path d="M409 269C398 256 418 250 409 238" />
            </g>
          </svg>
        </div>
        <div className="qs-launch-brand">
          <span className="qs-launch-caption">
            {lang === "ar" ? "خدمة بأدق التفاصيل" : "THE PERFECT SERVE"}
          </span>
          <strong dir="ltr">
            Quick<span>Serve</span>
          </strong>
          <p>{lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Preparing your workspace"}</p>
        </div>
      </div>
      <div className="qs-launch-ambient" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
