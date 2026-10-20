import type { PunchLocation } from "./geofence";

export type AttendanceLocationPhase =
  | "checking"
  | "needs_permission"
  | "locating"
  | "tracking"
  | "permission_denied"
  | "unavailable"
  | "timeout"
  | "insecure";
export type AttendanceLocationState = {
  phase: AttendanceLocationPhase;
  fix: { timestamp: number; location: PunchLocation } | null;
};
type LocationBrowser = {
  navigator: Pick<Navigator, "geolocation" | "permissions">;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  window: Pick<
    Window,
    "isSecureContext" | "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval"
  > &
    Partial<Pick<Window, "localStorage">>;
};

// Each page entry checks the real browser permission; never persist an assumed
// grant or permanently suppress a future location request after one old prompt.
export function createAttendanceLocationSession(
  onChange: (state: AttendanceLocationState) => void,
  browser: LocationBrowser,
) {
  const { navigator, document, window } = browser;
  let disposed = false;
  let watch: number | undefined;
  let generation = 0;
  let permissionRevision = 0;
  let permission: PermissionStatus | null = null;
  let blocked = false;
  let automaticAttempted = false;
  let receivedFix = false;
  let startedAt = 0;
  let startedWithPrompt = false;

  let state: AttendanceLocationState = { phase: "checking", fix: null };
  const publish = (next: AttendanceLocationState) => {
    if (!disposed) {
      state = next;
      onChange(next);
    }
  };
  const stop = () => {
    generation++;
    if (watch !== undefined) navigator.geolocation?.clearWatch(watch);
    watch = undefined;
  };
  const usable = () => {
    if (!window.isSecureContext) {
      publish({ phase: "insecure", fix: null });
      return false;
    }
    if (!navigator.geolocation) {
      publish({ phase: "unavailable", fix: null });
      return false;
    }
    return true;
  };
  const start = (reset = true) => {
    if (disposed || document.visibilityState !== "visible" || !usable()) return;
    if (
      watch !== undefined &&
      (state.phase === "locating" ||
        (state.fix &&
          Date.now() >= state.fix.timestamp &&
          Date.now() - state.fix.timestamp < 10000))
    )
      return;
    automaticAttempted = true;
    stop();
    const ticket = generation;
    startedAt = Date.now();
    startedWithPrompt = permission?.state === "prompt";
    publish({ phase: "locating", fix: reset ? null : state.fix });
    try {
      watch = navigator.geolocation.watchPosition(
        (position) => {
          if (disposed || ticket !== generation) return;
          receivedFix = true;
          publish({
            phase: "tracking",
            fix: {
              timestamp: position.timestamp,
              location: {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                reason: null,
              },
            },
          });
        },
        (error) => {
          if (disposed || ticket !== generation) return;
          blocked = error.code === 1;
          if (blocked) receivedFix = false;
          stop();
          publish({
            phase: blocked ? "permission_denied" : error.code === 3 ? "timeout" : "unavailable",
            fix: null,
          });
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    } catch {
      stop();
      publish({ phase: "unavailable", fix: null });
    }
  };
  const applyPermission = (value: PermissionState, reset: boolean, mayPrompt = false) => {
    if (
      value === "prompt" &&
      startedWithPrompt &&
      watch !== undefined &&
      (state.phase === "locating" || receivedFix)
    ) {
      if (receivedFix) start(reset);
      return; // Keep a live provider or unresolved original prompt intact.
    }

    if (value === "granted") {
      blocked = false;
      start(reset);
    } else if (value === "prompt" && mayPrompt && !automaticAttempted && !blocked) {
      start(reset);
    } else {
      stop();
      blocked = value === "denied" || blocked;
      publish({ phase: blocked ? "permission_denied" : "needs_permission", fix: null });
    }
  };
  const permissionChanged = () => {
    permissionRevision++;
    if (!disposed && permission) {
      if (permission.state !== "granted") {
        receivedFix = false;
        stop();
      }
      applyPermission(permission.state, true);
    }
  };
  const resume = async (reset = true, mayPrompt = true) => {
    if (disposed || document.visibilityState !== "visible" || !usable()) return;
    const revision = ++permissionRevision;
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      if (disposed || revision !== permissionRevision) return;
      if (permission !== result) {
        permission?.removeEventListener("change", permissionChanged);
        permission = result;
        permission.addEventListener("change", permissionChanged);
      }
      applyPermission(result.state, reset, mayPrompt);
    } catch {
      if (disposed || revision !== permissionRevision) return;
      // A missing Permissions API must not introduce an Enable location step.
      // The geolocation API itself still enforces browser/OS permission.
      if (!blocked && ((mayPrompt && !automaticAttempted) || receivedFix)) start(reset);
      else if (watch === undefined)
        publish({ phase: blocked ? "permission_denied" : "needs_permission", fix: null });
    }
  };
  const focus = () => {
    void resume();
  };
  const visibility = () => {
    if (document.visibilityState === "visible") {
      void resume();
    } else {
      permissionRevision++;
      stop();
      automaticAttempted = automaticAttempted && !receivedFix && permission?.state !== "granted";
      publish({ phase: blocked ? "permission_denied" : "needs_permission", fix: null });
    }
  };
  const timer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    // Recover a silent/hung provider only after access is known. Never restart
    // an unresolved browser prompt or infer permission from persisted storage.
    if (
      state.phase === "locating" &&
      (permission?.state === "granted" || receivedFix) &&
      Date.now() - startedAt >= 15000
    ) {
      stop();
      publish({ phase: "timeout", fix: null });
    }
    // Permission queries do not prompt. Keep checking even after denial so a
    // browser-settings change can recover without a click or change event.
    void resume(false, false);
  }, 5000);
  window.addEventListener("focus", focus);
  window.addEventListener("pageshow", focus);
  window.addEventListener("online", focus);
  document.addEventListener("visibilitychange", visibility);
  void resume();
  return {
    request() {
      if (disposed || !usable()) return;
      permissionRevision++;
      if (permission?.state === "denied") {
        // Re-read browser settings so recovery works even if a browser misses
        // the PermissionStatus change event. This query cannot prompt.
        void resume();
        return;
      }
      blocked = false;
      // Keep this synchronous inside the button's user gesture.
      start();
    },
    dispose() {
      disposed = true;
      permissionRevision++;
      stop();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", visibility);
      permission?.removeEventListener("change", permissionChanged);
    },
  };
}
