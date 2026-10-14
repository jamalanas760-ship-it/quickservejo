import { createServerFn } from "@tanstack/react-start";
import { quickServeSupabase } from "@/integrations/supabase/public-config";
import { checkMcpOAuthReadiness, type McpReadiness } from "@/lib/mcp-oauth";
let cache: { value: McpReadiness; at: number } | undefined;
/** Public discovery only; fixed issuer, no caller URL, token or management credentials. */
export const getMcpOAuthReadiness = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.at < 15000) return cache.value;
  const value = await checkMcpOAuthReadiness(quickServeSupabase.url);
  cache = { value, at: Date.now() };
  return value;
});
