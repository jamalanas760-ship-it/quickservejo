import { useEffect, useState } from "react";
import { Bell, ClipboardList, Info, Mail, Play, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { playAlertChime } from "@/lib/alert-audio";
import {
  DEFAULT_NOTIFICATIONS,
  readNotificationPreferences,
  notificationKey,
  type NotificationPreferences,
} from "@/lib/notification-preferences";

export function ProfileSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="ps-switch"
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

export function NotificationSettings({ userId, ar }: { userId: string | undefined; ar: boolean }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);
  const [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);
  useEffect(() => {
    const next = readNotificationPreferences(userId);
    setPrefs(next);
    setSaved(next);
  }, [userId]);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);
  const change = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => setPrefs((current) => ({ ...current, [key]: value }));
  function save() {
    if (!userId) return;
    try {
      localStorage.setItem(notificationKey(userId), JSON.stringify(prefs));
      setSaved(prefs);
      window.dispatchEvent(new Event("quickserve:notifications-change"));
      toast.success(ar ? "تم حفظ تفضيلات الإشعارات" : "Notification preferences saved");
    } catch {
      toast.error(
        ar ? "تعذر حفظ التفضيلات على هذا الجهاز" : "Could not save preferences on this device",
      );
    }
  }
  const rows = [
    {
      key: "newOrders",
      en: "New orders",
      ar: "الطلبات الجديدة",
      hint: "Get notified when a new order is received.",
      hintAr: "التنبيه عند وصول طلب جديد.",
      icon: ClipboardList,
    },
    {
      key: "tableAlerts",
      en: "Table alerts",
      ar: "تنبيهات الطاولات",
      hint: "Keep up with table status changes.",
      hintAr: "متابعة تغييرات حالة الطاولات.",
      icon: Bell,
    },
    {
      key: "system",
      en: "System updates",
      ar: "تحديثات النظام",
      hint: "Important announcements and workspace updates.",
      hintAr: "الإعلانات المهمة وتحديثات مساحة العمل.",
      icon: Info,
    },
    {
      key: "marketing",
      en: "Product news",
      ar: "أخبار المنتج",
      hint: "Tips, features, and product updates.",
      hintAr: "النصائح والميزات وتحديثات المنتج.",
      icon: Mail,
    },
  ] as const;
  return (
    <div className="ps-notifications">
      <header className="ps-section-title">
        <span>
          <Bell />
        </span>
        <div>
          <h2>{ar ? "الإشعارات" : "Notifications"}</h2>
          <p>
            {ar
              ? "اختر تفضيلات التنبيه والصوت لهذا الجهاز."
              : "Choose your notification and sound preferences for this device."}
          </p>
        </div>
      </header>
      <section className="ps-card">
        <h2>{ar ? "تفضيلات الإشعارات" : "Notification preferences"}</h2>
        {rows.map((row) => (
          <div className="ps-preference" key={row.key}>
            <span>
              <row.icon />
            </span>
            <div>
              <strong>{ar ? row.ar : row.en}</strong>
              <p>{ar ? row.hintAr : row.hint}</p>
            </div>
            <ProfileSwitch
              checked={prefs[row.key]}
              label={ar ? row.ar : row.en}
              onChange={(value) => change(row.key, value)}
            />
          </div>
        ))}
      </section>
      <section className="ps-card">
        <h2>{ar ? "تفضيلات الصوت" : "Sound preferences"}</h2>
        <div className="ps-preference">
          <span>
            <Volume2 />
          </span>
          <div>
            <strong>{ar ? "أصوات التنبيه" : "Notification sounds"}</strong>
            <p>
              {ar
                ? "التحكم بأصوات الطلبات وتنبيهات الطاولات."
                : "Control audio for order and table alerts."}
            </p>
          </div>
          <ProfileSwitch
            checked={prefs.sound}
            label={ar ? "أصوات التنبيه" : "Notification sounds"}
            onChange={(value) => change("sound", value)}
          />
        </div>
        <div className="ps-sound-controls">
          <label className="ps-field">
            {ar ? "صوت التنبيه" : "Notification sound"}
            <select
              aria-label={ar ? "صوت التنبيه" : "Notification sound"}
              value={prefs.tone}
              disabled={!prefs.sound}
              onChange={(event) =>
                change("tone", event.target.value as NotificationPreferences["tone"])
              }
            >
              <option value="soft">{ar ? "نغمة ناعمة" : "Soft chime"}</option>
              <option value="classic">{ar ? "نغمة كلاسيكية" : "Classic chime"}</option>
              <option value="bell">{ar ? "جرس" : "Bell"}</option>
            </select>
          </label>
          <label className="ps-field">
            {ar ? "مستوى الصوت" : "Volume"} · {prefs.volume}%
            <input
              aria-label={ar ? "مستوى الصوت" : "Volume"}
              type="range"
              min="0"
              max="100"
              value={prefs.volume}
              disabled={!prefs.sound}
              onChange={(event) => change("volume", Number(event.target.value))}
            />
          </label>
          <button
            className="ps-button"
            type="button"
            disabled={!prefs.sound || playing}
            aria-busy={playing}
            onClick={async () => {
              if (prefs.volume === 0) {
                toast.info(
                  ar ? "ارفع مستوى الصوت لتجربة التنبيه" : "Increase the volume to test the sound",
                );
                return;
              }
              setPlaying(true);
              try {
                await playAlertChime(prefs.tone, prefs.volume);
                toast.success(ar ? "تم تشغيل نغمة الاختبار" : "Test chime played");
              } catch {
                toast.error(
                  ar
                    ? "تعذر تشغيل الصوت. تحقق من صوت الجهاز وحاول مرة أخرى."
                    : "Could not play sound. Check device audio and try again.",
                );
              } finally {
                setPlaying(false);
              }
            }}
          >
            <Play />
            {playing ? (ar ? "تشغيل…" : "Playing…") : ar ? "تجربة الصوت" : "Test sound"}
          </button>
        </div>
        <div className="ps-event-sounds">
          <h3>{ar ? "أصوات حسب الحدث" : "Sounds by event"}</h3>
          {(
            [
              ["orderSounds", "Order sounds", "أصوات الطلبات"],
              ["tableSounds", "Table alert sounds", "أصوات الطاولات"],
            ] as const
          ).map(([key, en, arabic]) => (
            <div className="ps-preference" key={key}>
              <span>
                <Volume2 />
              </span>
              <div>
                <strong>{ar ? arabic : en}</strong>
                <p>
                  {key === "orderSounds"
                    ? ar
                      ? "تشغيل الصوت للطلبات الجديدة."
                      : "Play a chime for new orders."
                    : ar
                      ? "تشغيل الصوت عند تغير حالة الطاولة."
                      : "Play a chime when table status changes."}
                </p>
              </div>
              <ProfileSwitch
                disabled={!prefs.sound}
                checked={prefs[key]}
                label={ar ? arabic : en}
                onChange={(value) => change(key, value)}
              />
            </div>
          ))}
        </div>
      </section>
      <div className="ps-actions">
        <small>
          {ar
            ? "تُحفظ التفضيلات لهذا الحساب على هذا الجهاز."
            : "Preferences are saved for this account on this device."}
        </small>
        <button
          type="button"
          className="ps-button"
          disabled={!dirty}
          onClick={() => setPrefs(saved)}
        >
          {ar ? "إلغاء" : "Cancel"}
        </button>
        <button
          type="button"
          className="ps-button ps-primary"
          disabled={!userId || !dirty}
          onClick={save}
        >
          {ar ? "حفظ التغييرات" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
