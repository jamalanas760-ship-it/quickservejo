import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useMemberships, useSupabaseSession } from "@/hooks/useSession";
import { enableDevicePush, pushSupported } from "@/lib/push-notifications";

export function NotificationPrompt() {
  const { lang } = useI18n();
  const userId = useSupabaseSession().data?.user.id;
  const restaurantId = useMemberships().data?.find((m) => m.restaurant_id)?.restaurant_id;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ar = lang === "ar";
  useEffect(() => {
    if (!userId || !restaurantId) {
      setVisible(false);
      return;
    }
    const show = () => setVisible(true);
    const sync = () => {
      if (pushSupported() && Notification.permission === "granted")
        void enableDevicePush(restaurantId, userId).catch(() => {
          setError(
            ar
              ? "تعذر إعداد التنبيهات. حاول مجدداً."
              : "Could not set up alerts. Please try again.",
          );
          setVisible(true);
        });
    };
    const installed =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    const timer = window.setTimeout(() => {
      sync();
      if (
        installed &&
        pushSupported() &&
        Notification.permission === "default" &&
        !sessionStorage.getItem("quickserve.push-later")
      )
        show();
    }, 1200);
    window.addEventListener("quickserve:enable-notifications", show);
    window.addEventListener("quickserve:notifications-change", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("quickserve:enable-notifications", show);
      window.removeEventListener("quickserve:notifications-change", sync);
    };
  }, [userId, restaurantId, ar]);
  function dismiss() {
    sessionStorage.setItem("quickserve.push-later", "1");
    setVisible(false);
  }
  async function allow() {
    if (!restaurantId || !userId) return;
    setBusy(true);
    setError("");
    try {
      await enableDevicePush(restaurantId, userId, true);
      toast.success(ar ? "تم تفعيل التنبيهات" : "Notifications enabled");
      setVisible(false);
    } catch (e) {
      setError(
        ar
          ? "أضف التطبيق للشاشة الرئيسية واسمح بالإشعارات من إعدادات الجهاز، ثم حاول مجدداً."
          : e instanceof Error
            ? e.message
            : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pb-[env(safe-area-inset-bottom)]">
      <div
        role="region"
        aria-label={ar ? "تشغيل التنبيهات" : "Enable notifications"}
        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {ar ? "لا تفوّت تحديثات العمل" : "Stay up to date"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ar
              ? "فعّل التنبيهات لتصلك الطلبات وتحديثات الفريق حتى عند إغلاق التطبيق."
              : "Receive orders and team updates even when the app is closed."}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button className="min-h-11" size="sm" disabled={busy} onClick={() => void allow()}>
              {ar
                ? busy
                  ? "جارٍ التفعيل…"
                  : "تفعيل التنبيهات"
                : busy
                  ? "Enabling…"
                  : "Enable alerts"}
            </Button>
            <Button className="min-h-11" size="sm" variant="ghost" onClick={dismiss}>
              {ar ? "لاحقاً" : "Later"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center text-muted-foreground"
          aria-label={ar ? "إغلاق" : "Close"}
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
