/** Optional separate gateway URL. Never fall back from a malformed configured URL. */
export function resolveMcpPublicUrl(configured: unknown, siteOrigin: string): string {
  const value = typeof configured === "string" ? configured.trim() : "";
  const url = value ? new URL(value) : new URL("/mcp", siteOrigin);
  if (url.username || url.password || url.hash || url.search || url.pathname !== "/mcp")
    throw new Error("Invalid MCP server URL");
  if (
    value &&
    (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("The separate MCP gateway requires a public HTTPS URL");
  return url.href;
}
