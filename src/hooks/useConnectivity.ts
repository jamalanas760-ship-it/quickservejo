import { useSyncExternalStore } from "react";

export type ConnectivityStatus = "online" | "checking" | "offline";

const listeners = new Set<() => void>();
let status: ConnectivityStatus = "online";
let started = false;
let offlineTimer: number | null = null;
let probeController: AbortController | null = null;

function emit(next: ConnectivityStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener());
}

async function probeOrigin() {
  probeController?.abort();
  const controller = new AbortController();
  probeController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 4_000);
  emit("checking");

  try {
    const response = await fetch(`/favicon.png?connectivity=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    emit(response.ok ? "online" : "offline");
  } catch {
    if (controller.signal.aborted) return;
    emit("offline");
  } finally {
    window.clearTimeout(timeout);
    if (probeController === controller) probeController = null;
  }
}

function cancelOfflineTimer() {
  if (offlineTimer === null) return;
  window.clearTimeout(offlineTimer);
  offlineTimer = null;
}

function scheduleOfflineVerification() {
  cancelOfflineTimer();
  // navigator.onLine is only a hint and can be false in embedded/cloud browsers
  // that can still reach the app. Confirm against our own origin before warning.
  offlineTimer = window.setTimeout(() => {
    offlineTimer = null;
    void probeOrigin();
  }, 900);
}

function onOnline() {
  cancelOfflineTimer();
  probeController?.abort();
  probeController = null;
  emit("online");
}

function onOffline() {
  scheduleOfflineVerification();
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  if (navigator.onLine) onOnline();
  else scheduleOfflineVerification();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (navigator.onLine) onOnline();
  else scheduleOfflineVerification();
}

function stop() {
  if (!started || listeners.size > 0 || typeof window === "undefined") return;
  started = false;
  cancelOfflineTimer();
  probeController?.abort();
  probeController = null;
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    stop();
  };
}

function getSnapshot() {
  return status;
}

function getServerSnapshot(): ConnectivityStatus {
  return "online";
}

/** Hydration-safe connectivity backed by a confirmed same-origin probe. */
export function useConnectivity() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
