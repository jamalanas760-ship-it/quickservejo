import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import "./splash-screen.css";

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
export function SplashScreen() {
  const { lang } = useI18n();
  const pending = useRouterState({ select: (state) => state.isLoading });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const started = useRef(false);
  const [visible, setVisible] = useState(false);
  const [minimumDone, setMinimumDone] = useState(false);
  useEffect(() => {
    if (started.current || !WORKSPACE_PATH.test(pathname)) return;
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
    }, 8000);
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
  return (
    <div
      className={`qs-launch-simple${minimumDone && !pending ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Preparing your workspace"}
    >
      <div className="qs-launch-simple-content">
        <div className="qs-launch-service-art" aria-hidden="true">
          <img className="qs-service-tray" src="/loading/cloche-tray.webp" alt="" width="600" height="200" fetchPriority="high" />
          <svg className="qs-service-steam" viewBox="0 0 100 100">
            <path d="M28 93C8 73 45 60 27 36C17 22 29 11 29 5" />
            <path d="M51 94C32 75 65 59 50 37C40 22 52 11 52 3" />
            <path d="M74 92C56 73 87 59 73 41C64 29 75 19 75 11" />
          </svg>
          <img className="qs-service-lid" src="/loading/cloche-lid.webp" alt="" width="540" height="360" fetchPriority="high" />
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
