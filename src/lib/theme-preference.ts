export type ThemePreference = "light" | "dark" | "system";
export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  try {
    const value = localStorage.getItem("quickserve-theme");
    return value === "light" || value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}
export function applyDocumentTheme(theme: "light" | "dark") {
  const dark = theme === "dark";
  const color = dark ? "#14191f" : "#f8f7f4";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = color;
  document.body.style.backgroundColor = color;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", color));
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
  applyDocumentTheme(theme);
  window.dispatchEvent(new CustomEvent("quickserve:theme-change", { detail: theme }));
}
