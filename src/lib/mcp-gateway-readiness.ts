import type { McpReadiness } from "./mcp-oauth";
/** Fixed deployment configuration only: never fetch an issuer supplied by an anonymous caller. */
export async function checkMcpGatewayReadiness(
  gatewayUrl: string,
  issuerUrl: string,
  request: typeof fetch = fetch,
): Promise<McpReadiness> {
  const result = (status: McpReadiness["status"], keys = false, dcr = false): McpReadiness => ({
    status,
    asymmetricKeys: keys,
    dynamicRegistration: dcr,
  });
  try {
    const gateway = new URL(gatewayUrl),
      issuer = new URL(issuerUrl);
    if (
      [gateway, issuer].some(
        (url) =>
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      ) ||
      gateway.pathname !== "/mcp" ||
      !issuer.pathname.endsWith("/")
    )
      return result("discovery_invalid");
    const read = async (url: string) => {
      const response = await request(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Discovery unavailable");
      return response.json();
    };
    const resource = await read(gateway.origin + "/.well-known/oauth-protected-resource/mcp");
    if (
      resource.resource !== gateway.href ||
      !Array.isArray(resource.authorization_servers) ||
      resource.authorization_servers.length !== 1 ||
      resource.authorization_servers[0] !== issuer.href
    )
      return result("discovery_invalid");
    const metadata = await read(issuer.href + ".well-known/openid-configuration");
    const endpoint = (value: unknown): value is string => {
      try {
        const url = new URL(String(value));
        return (
          url.protocol === "https:" &&
          url.origin === issuer.origin &&
          !url.username &&
          !url.password &&
          !url.hash
        );
      } catch {
        return false;
      }
    };
    if (
      metadata.issuer !== issuer.href ||
      !endpoint(metadata.authorization_endpoint) ||
      !endpoint(metadata.token_endpoint) ||
      !endpoint(metadata.jwks_uri) ||
      !metadata.code_challenge_methods_supported?.includes("S256")
    )
      return result("discovery_invalid");
    const jwks = await read(metadata.jwks_uri);
    const keys =
      Array.isArray(jwks.keys) &&
      jwks.keys.some(
        (key: { kty?: string; alg?: string }) =>
          ["RSA", "EC"].includes(key.kty ?? "") && ["RS256", "ES256"].includes(key.alg ?? ""),
      );
    // A managed provider may use CIMD or pre-registration; DCR is not mandatory here.
    return result(
      keys ? "ready" : "discovery_invalid",
      keys,
      endpoint(metadata.registration_endpoint),
    );
  } catch {
    return result("unavailable");
  }
}
