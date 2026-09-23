import { useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";

import { useConnectivity } from "@/hooks/useConnectivity";
import { supabase } from "@/integrations/supabase/client";

type MetricName = "LCP" | "CLS" | "INP" | "TTFB" | "route_load";

function deviceLabel() {
  if (typeof window === "undefined") return "server";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1200) return "tablet";
  return "desktop";
}

function routeName() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

async function recordEvent(type: string, message: string, metadata: Record<string, unknown> = {}) {
  try {
    await (supabase as any).rpc("record_client_event", {
      _severity: "error",
      _event_type: type,
      _message: message.slice(0, 1900),
      _route: routeName(),
      _metadata: metadata,
      _restaurant_id: null,
    });
  } catch {
    // Observability must never break the application.
  }
}

async function recordMetric(metric: MetricName, value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  try {
    await (supabase as any).rpc("record_performance_sample", {
      _metric: metric,
      _value: Math.round(value * 1000) / 1000,
      _route: routeName(),
      _device: deviceLabel(),
      _restaurant_id: null,
    });
  } catch {
    // Performance telemetry is best effort.
  }
}

export function AppRuntimeMonitor() {
  const connectivity = useConnectivity();
  const sent = useRef(new Set<string>());

  useEffect(() => {
    const idleHandles = new Set<number>();
    let loadHandler: (() => void) | null = null;
    let visibilityHandler: (() => void) | null = null;
    const scheduleTimeout = window.setTimeout.bind(window);
    const cancelTimeout = window.clearTimeout.bind(window);
    const runWhenIdle = (callback: () => void) => {
      let handle = 0;
      const run = () => {
        idleHandles.delete(handle);
        callback();
      };
      if ("requestIdleCallback" in window) {
        handle = window.requestIdleCallback(run, { timeout: 2_000 });
      } else {
        handle = scheduleTimeout(run, 0);
      }
      idleHandles.add(handle);
    };
    const registerServiceWorker = () => runWhenIdle(() => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    });
    if ("serviceWorker" in navigator) {
      if (document.readyState === "complete") registerServiceWorker();
      else {
        loadHandler = registerServiceWorker;
        window.addEventListener("load", loadHandler, { once: true });
      }
    }

    const onError = (event: ErrorEvent) => {
      void recordEvent("window_error", event.message || "Unhandled browser error", {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.name + ": " + event.reason.message : String(event.reason ?? "Unhandled promise rejection");
      void recordEvent("unhandled_rejection", reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    runWhenIdle(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (navigation) {
        void recordMetric("TTFB", navigation.responseStart);
        void recordMetric("route_load", navigation.loadEventEnd || navigation.domComplete || navigation.duration);
      }
    });

    const observers: PerformanceObserver[] = [];
    try {
      const lcp = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last && !sent.current.has("LCP")) {
          sent.current.add("LCP");
          void recordMetric("LCP", last.startTime);
        }
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcp);
    } catch {}

    try {
      let cls = 0;
      const layout = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
          if (!entry.hadRecentInput) cls += Number(entry.value ?? 0);
        }
      });
      layout.observe({ type: "layout-shift", buffered: true });
      observers.push(layout);
      const flush = () => {
        if (!sent.current.has("CLS")) {
          sent.current.add("CLS");
          void recordMetric("CLS", cls);
        }
      };
      visibilityHandler = () => {
        if (document.visibilityState === "hidden") flush();
      };
      document.addEventListener("visibilitychange", visibilityHandler);
    } catch {}

    try {
      let longest = 0;
      const interaction = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
        if (longest > 0 && !sent.current.has("INP")) {
          sent.current.add("INP");
          void recordMetric("INP", longest);
        }
      });
      interaction.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
      observers.push(interaction);
    } catch {}

    return () => {
      if (loadHandler) window.removeEventListener("load", loadHandler);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      idleHandles.forEach((handle) => {
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(handle);
        else cancelTimeout(handle);
      });
      idleHandles.clear();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  if (connectivity !== "offline") return null;
  return <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-[100] flex min-h-10 items-center justify-center gap-2 bg-amber-500 px-3 py-2 text-center text-xs font-bold text-black shadow-sm">
    <WifiOff className="size-4" />
    <span>You’re offline. Read-only screens may remain available; orders and payments will resume when the connection returns.</span>
  </div>;
}
