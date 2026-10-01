export type ThemePreference = "light" | "dark" | "system";
export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const value = localStorage.getItem("quickserve-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
export function setThemePreference(preference: ThemePreference) {
  const theme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  try {
    localStorage.setItem("quickserve-theme", preference);
  } catch {
    /* Apply for this session even when persistent storage is unavailable. */
  }
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new CustomEvent("quickserve:theme-change", { detail: theme }));
}
