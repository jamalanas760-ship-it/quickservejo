export async function assertProviderReady(config, request = fetch) {
  const response = await request(config.issuer + ".well-known/openid-configuration", {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Managed OAuth provider discovery is unavailable");
  const metadata = await response.json();
  const issuer = new URL(config.issuer);
  function endpoint(value) {
    try {
      const url = new URL(value);
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
  }
  if (
    metadata.issuer !== config.issuer ||
    metadata.jwks_uri !== config.jwksUrl ||
    !endpoint(metadata.authorization_endpoint) ||
    !endpoint(metadata.token_endpoint) ||
    !metadata.code_challenge_methods_supported?.includes("S256")
  )
    throw new Error("Managed OAuth provider does not match the pinned HTTPS/PKCE configuration");
}
