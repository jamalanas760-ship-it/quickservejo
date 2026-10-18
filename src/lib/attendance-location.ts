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
  >;
};

// Request location automatically once per foreground visit, letting the browser
// enforce permission. Timed renewal never requests a new permission prompt.
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
    automaticAttempted = true;
    stop();
    const ticket = generation;
    publish({ phase: "locating", fix: reset ? null : state.fix });
    try {
      watch = navigator.geolocation.watchPosition(
        (position) => {
          if (disposed || ticket !== generation) return;
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
          stop();
          publish({
            phase: blocked ? "permission_denied" : error.code === 3 ? "timeout" : "unavailable",
            fix: null,
          });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    } catch {
      stop();
      publish({ phase: "unavailable", fix: null });
    }
  };
  const applyPermission = (value: PermissionState, reset: boolean, mayPrompt = false) => {
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
    if (!disposed && permission) applyPermission(permission.state, true);
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
      if (mayPrompt && !automaticAttempted && !blocked) start(reset);
      else if (watch === undefined)
        publish({ phase: blocked ? "permission_denied" : "needs_permission", fix: null });
    }
  };
  const focus = () => {
    if (state.phase !== "locating") void resume();
  };
  const visibility = () => {
    if (document.visibilityState === "visible") {
      void resume();
    } else {
      permissionRevision++;
      stop();
      automaticAttempted = false;
      publish({ phase: blocked ? "permission_denied" : "needs_permission", fix: null });
    }
  };
  const timer = window.setInterval(() => {
    if (!blocked && state.phase !== "locating") void resume(false, false);
  }, 20000);
  window.addEventListener("focus", focus);
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
      document.removeEventListener("visibilitychange", visibility);
      permission?.removeEventListener("change", permissionChanged);
    },
  };
}
