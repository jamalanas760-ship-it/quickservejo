const FLAG = "quickserve.splash.shown.v5";
let completedOrigin: number | undefined;

/** Scope launch playback to the current document, including reloads within a tab. */
export function hasLaunchedThisDocument(): boolean {
  if (completedOrigin === performance.timeOrigin) return true;
  try {
    return sessionStorage.getItem(FLAG) === String(performance.timeOrigin);
  } catch {
    return false;
  }
}

export function rememberLaunch(): void {
  completedOrigin = performance.timeOrigin;
  try {
    sessionStorage.setItem(FLAG, String(performance.timeOrigin));
  } catch {
    /* Storage restrictions must not block startup. */
  }
}
