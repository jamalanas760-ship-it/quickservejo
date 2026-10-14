import { createServerFn } from "@tanstack/react-start";
import { quickServeSupabase } from "@/integrations/supabase/public-config";
import { checkMcpOAuthReadiness, type McpReadiness } from "@/lib/mcp-oauth";
import { checkMcpGatewayReadiness } from "@/lib/mcp-gateway-readiness";
let cache: { value: McpReadiness; at: number } | undefined;
/** Public discovery only; fixed issuer, no caller URL, token or management credentials. */
export const getMcpOAuthReadiness = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.at < 15000) return cache.value;
  const gateway = import.meta.env.VITE_QUICKSERVE_MCP_URL?.trim();
  const value = gateway
    ? await checkMcpGatewayReadiness(gateway, process.env.MCP_GATEWAY_OAUTH_ISSUER ?? "")
    : await checkMcpOAuthReadiness(quickServeSupabase.url);
  cache = { value, at: Date.now() };
  return value;
});
