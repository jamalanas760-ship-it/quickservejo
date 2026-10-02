import { applyDocumentTheme, readThemePreference } from "@/lib/theme-preference";

/** Restore the live page without throwing away mounted forms or cached data. */
export function installResumeRecovery() {
  let hiddenAt = 0;
  let lastResume = 0;
  let checkTimer = 0;
  let retryTimer = 0;
  function removeNotice() {
    document.getElementById("qs-resume-recovery")?.remove();
  }
  function check() {
    const main = document.getElementById("main-content");
    if (
      !main ||
      main.innerText.trim() ||
      main.querySelector("img,canvas,video,input,textarea,[role=dialog]") ||
      document.querySelector("[role=dialog], [role=alertdialog]")
    ) {
      removeNotice();
      return;
    }
    if (document.visibilityState !== "visible") return;
    const notice = document.createElement("div");
    notice.id = "qs-resume-recovery";
    notice.setAttribute("role", "status");
    notice.style.cssText =
      "position:fixed;inset:0;z-index:110;display:grid;place-content:center;gap:16px;text-align:center;background:var(--background);color:var(--foreground);padding:24px;font:600 15px system-ui";
    const ar = document.documentElement.dir === "rtl";
    const label = document.createElement("p");
    label.textContent = ar ? "جارٍ استعادة مساحة العمل…" : "Restoring your workspace…";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = ar ? "إعادة فتح الصفحة" : "Reopen page";
    retry.style.cssText =
      "min-height:44px;padding:12px 20px;border:0;border-radius:12px;background:#e85d2a;color:white;font:inherit;cursor:pointer";
    retry.onclick = () => window.location.reload();
    notice.append(label, retry);
    removeNotice();
    document.body.append(notice);
    retryTimer = window.setTimeout(() => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        main.innerText.trim() ||
        main.querySelector("input,textarea") ||
        document.querySelector("[role=dialog], [role=alertdialog]")
      ) {
        removeNotice();
        return;
      }
      try {
        const key = "quickserve.resume-retry";
        if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 60000) return;
        sessionStorage.setItem(key, String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    }, 1500);
  }
  function resume() {
    if (document.visibilityState !== "visible" || Date.now() - lastResume < 500) return;
    lastResume = Date.now();
    window.clearTimeout(checkTimer);
    window.clearTimeout(retryTimer);
    document.documentElement.classList.remove("qs-theme-view-transition", "qs-theme-transitioning");
    const preference = readThemePreference();
    applyDocumentTheme(
      preference === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preference,
    );
    // Keep the mounted page and its compositor layers stable. Promoting the
    // entire page with translateZ on resume can itself flash on mobile WebKit.
    // A real foreground cycle or BFCache restore gets a blank-page watchdog.
    checkTimer = window.setTimeout(check, 1500);
  }
  function visibility() {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      window.clearTimeout(checkTimer);
      window.clearTimeout(retryTimer);
      removeNotice();
    } else if (hiddenAt) {
      hiddenAt = 0;
      resume();
    }
  }
  function pageshow(event: PageTransitionEvent) {
    if (event.persisted) resume();
  }
  window.addEventListener("pageshow", pageshow);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("pageshow", pageshow);
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", visibility);
    window.clearTimeout(checkTimer);
    window.clearTimeout(retryTimer);
    removeNotice();
  };
}
