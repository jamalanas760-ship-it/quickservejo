import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import "./splash-screen.css";

const FLAG = "quickserve.splash.shown.v4";
const WORKSPACE_PATH =
  /^\/(dashboard|manage|shifts|profile|bookings|automations|operations|team|settings)(\/|$)/;

/** A brief, honest startup indicator. Navigation has its own progress indicator. */
export function SplashScreen() {
  const { lang } = useI18n();
  const pending = useRouterState({ select: (state) => state.isLoading });
  const [visible, setVisible] = useState(false);
  const started = useRef(0);
  useEffect(() => {
    if (!WORKSPACE_PATH.test(window.location.pathname)) return;
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, "1");
    } catch {
      /* Storage restrictions must not block startup. */
    }
    started.current = Date.now();
    setVisible(true);
    // Reveal the normal page loading/error controls even on a slow connection.
    const safety = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(safety);
  }, []);
  useEffect(() => {
    if (!visible || pending) return;
    const timer = window.setTimeout(
      () => setVisible(false),
      Math.max(0, 320 - (Date.now() - started.current)),
    );
    return () => window.clearTimeout(timer);
  }, [visible, pending]);
  if (!visible) return null;
  return (
    <div
      className="qs-launch-simple"
      role="status"
      aria-live="polite"
      aria-label={lang === "ar" ? "جارٍ فتح مساحة العمل" : "Opening your workspace"}
    >
      <div className="qs-launch-simple-content">
        <div className="qs-launch-simple-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <circle cx="30" cy="29" r="17" />
            <path d="M37 37L51 51" />
          </svg>
        </div>
        <strong>
          Quick<span>Serve</span>
        </strong>
        <p>{lang === "ar" ? "جارٍ فتح مساحة العمل" : "Opening your workspace"}</p>
        <div className="qs-launch-simple-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
