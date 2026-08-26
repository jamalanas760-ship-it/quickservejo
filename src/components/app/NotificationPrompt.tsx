import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

const DISMISS_KEY = "qs:notify-prompt-dismissed";

/** True when the app runs from the home screen (installed PWA). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

/**
 * Asks installed-app users to allow notifications so kitchen and order alerts
 * reach them. Shown once per device until allowed or dismissed.
 */
export function NotificationPrompt() {
  const { lang } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!isStandalone()) return;
    if (Notification.permission !== "default") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    const timer = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  async function allow() {
    try {
      const result = await Notification.requestPermission();
      if (result === "granted" && "serviceWorker" in navigator) {
        new Notification(lang === "ar" ? "تم تشغيل التنبيهات" : "Notifications are on", {
          body:
            lang === "ar"
              ? "سنخبرك بالطلبات الجديدة ونداءات النادل."
              : "We'll alert you about new orders and waiter calls.",
          icon: "/icon-192.png",
        });
      }
    } catch {
      /* permission dialogs can be blocked; nothing to recover */
    } finally {
      setVisible(false);
    }
  }

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Bell className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {lang === "ar" ? "تشغيل التنبيهات" : "Turn on notifications"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "لتصلك الطلبات الجديدة ونداءات النادل فوراً."
              : "Get new orders and waiter calls the moment they arrive."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => void allow()}>
              {lang === "ar" ? "السماح" : "Allow"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              {lang === "ar" ? "لاحقاً" : "Later"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={lang === "ar" ? "إغلاق" : "Close"}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
