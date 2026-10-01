import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playAlertChime, unlockAlertSound } from "@/lib/alert-audio";
import { readNotificationPreferences } from "@/lib/notification-preferences";

type TableState = { id?: string; service_status?: string; is_active?: boolean };
export function useTableAlertSound(restaurantId: string | null, userId: string | undefined) {
  useEffect(() => {
    const unlock = () => {
      void unlockAlertSound().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  useEffect(() => {
    if (!restaurantId || !userId) return;
    const previous = new Map<string, string>();
    let cancelled = false,
      fetching = false,
      revision = 0,
      lastAlert = 0;
    const enabled = () => {
      const prefs = readNotificationPreferences(userId);
      return prefs.sound && prefs.tableAlerts && prefs.tableSounds && prefs.volume > 0;
    };
    const chime = () => {
      if (!enabled() || Date.now() - lastAlert < 1000) return;
      const prefs = readNotificationPreferences(userId);
      lastAlert = Date.now();
      void playAlertChime(prefs.tone, prefs.volume).catch(() => undefined);
    };
    function record(row: TableState, old?: TableState) {
      if (!row.id || !row.service_status) return false;
      const status = `${row.service_status}:${row.is_active}`;
      const before = old?.service_status
        ? `${old.service_status}:${old.is_active ?? row.is_active}`
        : previous.get(row.id);
      previous.set(row.id, status);
      return Boolean(before && before !== status);
    }
    async function poll(silent = false) {
      if (fetching || cancelled || (!silent && !enabled())) return;
      fetching = true;
      const before = revision;
      try {
        const { data, error } = await (supabase.from("restaurant_tables") as any)
          .select("id,service_status,is_active")
          .eq("restaurant_id", restaurantId);
        if (cancelled || error || before !== revision) return;
        let changed = false;
        for (const row of (data ?? []) as TableState[]) changed = record(row) || changed;
        if (changed && !silent) chime();
      } catch {
        /* Realtime/polling will recover on the next successful response. */
      } finally {
        fetching = false;
      }
    }
    void poll(true);
    const channel = supabase
      .channel(`table-alert-audio:${restaurantId}:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "restaurant_tables",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          revision++;
          if (record(payload.new as TableState, payload.old as TableState)) chime();
        },
      )
      .subscribe();
    // Polling also covers restaurants without table Realtime publication enabled.
    const timer = window.setInterval(() => {
      void poll();
    }, 15000);
    const reset = () => {
      revision++;
      previous.clear();
      void poll(true);
    };
    window.addEventListener("quickserve:notifications-change", reset);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("quickserve:notifications-change", reset);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, userId]);
}
