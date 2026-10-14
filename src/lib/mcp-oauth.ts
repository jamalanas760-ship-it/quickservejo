export const MCP_CONSENT_PATH = "/.lovable/oauth/consent";
const authorizationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validAuthorizationId(value: unknown): value is string {
  return typeof value === "string" && authorizationIdPattern.test(value);
}
/** Only the OAuth consent return path is honored. Never accept an arbitrary login redirect. */
export function consentAuthorizationId(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 512) return null;
  try {
    const url = new URL(value, "https://quickserve.invalid");
    const id = url.searchParams.get("authorization_id");
    return url.origin === "https://quickserve.invalid" &&
      url.pathname === MCP_CONSENT_PATH &&
      validAuthorizationId(id)
      ? id
      : null;
  } catch {
    return null;
  }
}
export function safeOAuthCallback(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw new Error("Unsafe authorization callback");
  return url.href;
}
export function oauthErrorKind(error: unknown): "disabled" | "unavailable" {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "feature_disabled" || /OAuth server is disabled/i.test(e?.message ?? "")
    ? "disabled"
    : "unavailable";
}
export type McpReadiness = {
  status:
    "ready" | "oauth_disabled" | "registration_required" | "discovery_invalid" | "unavailable";
  asymmetricKeys: boolean;
  dynamicRegistration: boolean;
};
export async function checkMcpOAuthReadiness(
  supabaseUrl: string,
  request: typeof fetch = fetch,
): Promise<McpReadiness> {
  const result = (status: McpReadiness["status"], keys = false, dcr = false): McpReadiness => ({
    status,
    asymmetricKeys: keys,
    dynamicRegistration: dcr,
  });
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== "https:" || !base.hostname.endsWith(".supabase.co"))
      return result("discovery_invalid");
    const issuer = `${base.origin}/auth/v1`;
    const response = await request(
      `${base.origin}/.well-known/oauth-authorization-server/auth/v1`,
      { signal: AbortSignal.timeout(8000), redirect: "error" },
    );
    const metadata = await response.json();
    if (
      metadata.error_code === "feature_disabled" ||
      /OAuth server is disabled/i.test(metadata.msg ?? "")
    )
      return result("oauth_disabled");
    if (!response.ok) return result("unavailable");
    const validEndpoint = (value: unknown) =>
      typeof value === "string" && value.startsWith(issuer + "/");
    if (
      metadata.issuer !== issuer ||
      !validEndpoint(metadata.authorization_endpoint) ||
      !validEndpoint(metadata.token_endpoint) ||
      !validEndpoint(metadata.jwks_uri) ||
      !metadata.code_challenge_methods_supported?.includes("S256")
    )
      return result("discovery_invalid");
    const jwksResponse = await request(metadata.jwks_uri, {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    const jwks = await jwksResponse.json();
    const keys =
      jwksResponse.ok &&
      Array.isArray(jwks.keys) &&
      jwks.keys.some(
        (k: { kty?: string; alg?: string }) =>
          ["EC", "RSA"].includes(k.kty ?? "") && ["ES256", "RS256"].includes(k.alg ?? ""),
      );
    const dcr = validEndpoint(metadata.registration_endpoint);
    return result(!keys ? "discovery_invalid" : dcr ? "ready" : "registration_required", keys, dcr);
  } catch {
    return result("unavailable");
  }
}
