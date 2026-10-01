import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";

export function AppearancePreferences({ ar }: { ar: boolean }) {
  const [theme, setTheme] = useState<ThemePreference>("light");
  useEffect(() => {
    const sync = () => setTheme(readThemePreference());
    sync();
    window.addEventListener("quickserve:theme-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("quickserve:theme-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <div className="ps-themes" role="group" aria-label={ar ? "مظهر التطبيق" : "App appearance"}>
      {(
        [
          ["light", "Light", "فاتح"],
          ["dark", "Dark", "داكن"],
          ["system", "System", "النظام"],
        ] as const
      ).map(([key, en, arabic]) => (
        <button
          key={key}
          type="button"
          className="ps-theme"
          aria-pressed={theme === key}
          onClick={() => setThemePreference(key)}
        >
          <span className={`ps-theme-preview ${key}`} aria-hidden="true">
            <i />
            <span>
              <b />
              <b />
              <b />
            </span>
          </span>
          {ar ? arabic : en}
          {theme === key ? <Check /> : null}
        </button>
      ))}
    </div>
  );
}
export function LanguagePreference({ ar }: { ar: boolean }) {
  const { lang, setLang } = useI18n();
  return (
    <label className="ps-field">
      {ar ? "اللغة" : "Language"}
      <select
        aria-label={ar ? "اللغة" : "Language"}
        value={lang}
        onChange={(event) => setLang(event.target.value as "en" | "ar")}
      >
        <option value="en">English</option>
        <option value="ar">العربية</option>
      </select>
    </label>
  );
}
