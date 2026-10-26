import { quickServeSupabase } from "@/integrations/supabase/public-config";
let cached: { at: number; healthy: boolean } | undefined;
let pending: Promise<boolean> | undefined;
/** Small public dependency probe; no customer records or privileged key. */
export async function databaseReady(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 10_000) return cached.healthy;
  if (pending) return pending;
  pending = (async () => {
    let healthy = false;
    try {
      const response = await fetch(`${quickServeSupabase.url}/rest/v1/rpc/quickserve_readiness`, {
        method: "POST", headers: { apikey: quickServeSupabase.publishableKey, "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(2_500), redirect: "error",
      });
      healthy = response.ok && await response.json() === true;
    } catch { /* Return a generic dependency failure; do not leak internal details. */ }
    cached = { at: Date.now(), healthy };
    return healthy;
  })();
  try { return await pending; } finally { pending = undefined; }
}
