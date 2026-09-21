import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

export const DEVICE_TOKEN_KEY = "quickserve.device.token.v1";
export const DEVICE_ID_KEY = "quickserve.device.id.v1";

export function DeviceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    async function beat() {
      const token = window.localStorage.getItem(DEVICE_TOKEN_KEY);
      if (!token || cancelled) return;
      const metadata = {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        platform: navigator.platform || null,
        online: navigator.onLine,
        standalone: window.matchMedia?.("(display-mode: standalone)")?.matches ?? false,
      };
      const { data, error } = await (supabase as any).rpc("heartbeat_restaurant_device", {
        _device_token: token,
        _route: window.location.pathname,
        _metadata: metadata,
      });
      if (cancelled) return;
      if (error || !data?.id) {
        if (!navigator.onLine) return;
        // Revoked/invalid tokens stop heartbeating. Do not loop forever with a
        // token the server no longer recognizes.
        window.localStorage.removeItem(DEVICE_TOKEN_KEY);
        window.localStorage.removeItem(DEVICE_ID_KEY);
      }
    }

    void beat();
    const interval = window.setInterval(() => void beat(), 60_000);
    const onOnline = () => void beat();
    const onVisibility = () => { if (document.visibilityState === "visible") void beat(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
