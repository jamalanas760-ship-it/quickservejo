import { useEffect, useState } from "react";
import { Play, ChevronRight } from "lucide-react";
import { AppearancePreferences } from "./AppearancePreferences";
import { ProfileSwitch } from "./NotificationSettings";
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";
import {
  ALERT_TONES,
  DEFAULT_NOTIFICATIONS,
  notificationKey,
  readNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { playAlertChime } from "@/lib/alert-audio";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
export function ProfilePreferences({
  userId,
  onAdvanced,
}: {
  userId: string | undefined;
  onAdvanced: () => void;
}) {
  const { lang, setLang } = useI18n(),
    ar = lang === "ar";
  const [theme, setTheme] = useState<ThemePreference>("light"),
    [language, setLanguage] = useState(lang),
    [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS),
    [playing, setPlaying] = useState(false);
  const [saved, setSaved] = useState({
    theme: "light" as ThemePreference,
    language: lang,
    prefs: DEFAULT_NOTIFICATIONS,
  });
  useEffect(() => {
    const initial = {
      theme: readThemePreference(),
      language: lang,
      prefs: readNotificationPreferences(userId),
    };
    setTheme(initial.theme);
    setLanguage(initial.language);
    setPrefs(initial.prefs);
    setSaved(initial);
  }, [userId, lang]);
  const dirty = JSON.stringify({ theme, language, prefs }) !== JSON.stringify(saved);
  return (
    <section className="ps-card simple-preferences">
      <h2>{ar ? "التفضيلات" : "Preferences"}</h2>
      <p>{ar ? "مساحة عمل تناسبك." : "A workspace that feels right for you."}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!userId) return;
          try {
            localStorage.setItem(notificationKey(userId), JSON.stringify(prefs));
            setThemePreference(theme);
            setLang(language);
            setSaved({ theme, language, prefs });
            window.dispatchEvent(new Event("quickserve:notifications-change"));
            toast.success(ar ? "تم حفظ التفضيلات" : "Preferences saved");
          } catch {
            toast.error(
              ar
                ? "تعذر حفظ التفضيلات على هذا الجهاز"
                : "Could not save preferences on this device",
            );
          }
        }}
      >
        <div className="simple-preference-section">
          <h3>{ar ? "المظهر" : "Theme"}</h3>
          <AppearancePreferences ar={ar} value={theme} onChange={setTheme} />
        </div>
        <label className="simple-setting-row">
          <span>
            <strong>{ar ? "اللغة" : "Language"}</strong>
            <small>{ar ? "اختر لغة العرض." : "Choose your display language."}</small>
          </span>
          <select value={language} onChange={(e) => setLanguage(e.target.value as "ar" | "en")}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <div className="simple-preference-section">
          <h3>{ar ? "الإشعارات" : "Notifications"}</h3>
          <div className="simple-setting-row">
            <span>{ar ? "تفعيل الإشعارات" : "Enable notifications"}</span>
            <ProfileSwitch
              label={ar ? "تفعيل الإشعارات" : "Enable notifications"}
              checked={prefs.newOrders || prefs.tableAlerts || prefs.system || prefs.marketing}
              onChange={(enabled) =>
                setPrefs({
                  ...prefs,
                  newOrders: enabled,
                  tableAlerts: enabled,
                  system: enabled,
                  marketing: enabled ? prefs.marketing : false,
                })
              }
            />
          </div>
          <div className="simple-setting-row">
            <span>{ar ? "أصوات الإشعارات" : "Notification sounds"}</span>
            <ProfileSwitch
              label={ar ? "أصوات الإشعارات" : "Notification sounds"}
              checked={prefs.sound}
              onChange={(value) => setPrefs({ ...prefs, sound: value })}
            />
          </div>
          <div className="simple-setting-row">
            <span>{ar ? "الصوت" : "Sound"}</span>
            <div className="simple-sound-picker">
              <select
                aria-label={ar ? "صوت الإشعارات" : "Notification sound"}
                value={prefs.tone}
                onChange={(e) =>
                  setPrefs({ ...prefs, tone: e.target.value as NotificationPreferences["tone"] })
                }
              >
                {ALERT_TONES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {ar ? t.ar : t.en}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ps-button"
                disabled={playing}
                aria-label={ar ? "معاينة الصوت" : "Play sound preview"}
                onClick={async () => {
                  setPlaying(true);
                  try {
                    await playAlertChime(prefs.tone, prefs.volume);
                  } catch {
                    toast.error(ar ? "تعذر تشغيل الصوت" : "Could not play sound");
                  } finally {
                    setPlaying(false);
                  }
                }}
              >
                <Play />
              </button>
            </div>
          </div>
          <button type="button" className="simple-disclosure" onClick={onAdvanced}>
            <span>
              <strong>{ar ? "تخصيص الإشعارات" : "Notification settings"}</strong>
              <small>
                {ar
                  ? "الطلبات والطاولات والتحديثات ومستوى الصوت"
                  : "Orders, tables, updates and volume"}
              </small>
            </span>
            <ChevronRight />
          </button>
        </div>
        <footer className="simple-save-row">
          <small>
            {ar ? "تُحفظ التفضيلات على هذا الجهاز." : "Preferences are saved on this device."}
          </small>
          <button
            type="button"
            className="ps-button"
            disabled={!dirty}
            onClick={() => {
              setTheme(saved.theme);
              setLanguage(saved.language);
              setPrefs(saved.prefs);
            }}
          >
            {ar ? "إلغاء" : "Cancel"}
          </button>
          <button className="ps-button ps-primary" disabled={!dirty || !userId}>
            {ar ? "حفظ التغييرات" : "Save changes"}
          </button>
        </footer>
      </form>
    </section>
  );
}
