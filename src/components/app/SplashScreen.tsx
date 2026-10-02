import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import "./splash-screen.css";

const FLAG = "quickserve.splash.shown.v5";
function rememberLaunch() {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* Session-only animation still works. */
  }
}
const WORKSPACE_PATH =
  /^\/(dashboard|manage|shifts|profile|bookings|automations|operations|team|settings|tables|menu|orders|analytics|notifications|work)(\/|$)/;

/** A 3.5 second launch animation. Navigation and resume do not replay it. */
export function SplashScreen() {
  const { lang } = useI18n();
  const pending = useRouterState({ select: (state) => state.isLoading });
  const [visible, setVisible] = useState(false);
  const [minimumDone, setMinimumDone] = useState(false);
  useEffect(() => {
    if (!WORKSPACE_PATH.test(window.location.pathname)) return;
    try {
      if (sessionStorage.getItem(FLAG)) return;
    } catch {
      /* Storage restrictions must not block startup. */
    }
    setVisible(true);
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
  }, []);
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
      aria-label={lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Getting everything ready"}
    >
      <div className="qs-launch-simple-content">
        <div className="qs-launch-service-art" aria-hidden="true">
          <svg viewBox="0 0 150 120">
            <ellipse className="qs-service-shadow" cx="75" cy="98" rx="49" ry="5" />
            <g className="qs-service-lines">
              <path d="M26 87H124M35 93H115" />
              <g className="qs-service-lid">
                <path className="qs-service-dome" d="M34 77C34 28 116 28 116 77Z" />
                <path d="M70 38V32Q75 26 80 32V38" />
              </g>
              <g className="qs-service-steam">
                <path d="M60 74q-6-7 0-14q6-7 0-14" />
                <path d="M76 74q-6-7 0-14q6-7 0-14" />
                <path d="M92 74q-6-7 0-14q6-7 0-14" />
              </g>
            </g>
          </svg>
        </div>
        <strong>
          Quick<span>Serve</span>
        </strong>
        <p>{lang === "ar" ? "جارٍ تجهيز مساحة العمل" : "Getting everything ready"}</p>
        <div className="qs-launch-simple-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
