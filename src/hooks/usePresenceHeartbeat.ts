import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

/** Lightweight self-only presence heartbeat. The database RPC constrains writes to auth.uid(). */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const touch = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      const { error } = await (supabase as any).rpc("touch_my_presence", { _restaurant_id: null });
      if (error && !stopped) console.warn("Presence heartbeat skipped:", error.message);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void touch();
    };
    const onFocus = () => void touch();

    void touch();
    timer = setInterval(() => void touch(), 45_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);
}
