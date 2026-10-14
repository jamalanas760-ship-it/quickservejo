const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function httpsUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error(`${name} must be a public HTTPS URL without credentials, query or fragment`);
  return url;
}
export function loadConfig(env = process.env) {
  const publicUrl = httpsUrl(env.MCP_PUBLIC_URL, "MCP_PUBLIC_URL");
  if (publicUrl.pathname !== "/mcp") throw new Error("MCP_PUBLIC_URL must end with /mcp");
  const issuer = httpsUrl(env.MCP_OAUTH_ISSUER, "MCP_OAUTH_ISSUER");
  if (!issuer.pathname.endsWith("/"))
    throw new Error("MCP_OAUTH_ISSUER must preserve the provider issuer trailing slash");
  const jwks = httpsUrl(env.MCP_OAUTH_JWKS_URL, "MCP_OAUTH_JWKS_URL");
  if (jwks.origin !== issuer.origin) throw new Error("JWKS must use the pinned issuer origin");
  if (env.MCP_OAUTH_AUDIENCE !== publicUrl.href)
    throw new Error("OAuth audience must equal the MCP resource URL");
  let entries;
  try {
    entries = JSON.parse(env.MCP_IDENTITY_BINDINGS);
  } catch {
    throw new Error(
      "MCP_IDENTITY_BINDINGS must be a JSON object of verified subject-to-user bindings",
    );
  }
  if (
    !entries ||
    typeof entries !== "object" ||
    Array.isArray(entries) ||
    !Object.keys(entries).length ||
    Object.keys(entries).length > 5000
  )
    throw new Error("At least one verified identity binding is required (maximum 5000)");
  const identities = new Map();
  for (const [subject, userId] of Object.entries(entries)) {
    if (!subject || subject.length > 256 || typeof userId !== "string" || !uuid.test(userId))
      throw new Error("Invalid identity binding");
    identities.set(subject, userId);
  }
  let db;
  try {
    db = new URL(env.MCP_DATABASE_URL);
  } catch {
    throw new Error("MCP_DATABASE_URL is required");
  }
  if (!["postgres:", "postgresql:"].includes(db.protocol) || !db.password)
    throw new Error("MCP_DATABASE_URL must be a credentialed PostgreSQL connection");
  const username = decodeURIComponent(db.username);
  if (username !== "quickserve_mcp_gateway" && !username.startsWith("quickserve_mcp_gateway."))
    throw new Error(
      "Use the dedicated quickserve_mcp_gateway database role, never postgres/service_role",
    );
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  return Object.freeze({
    publicUrl: publicUrl.href,
    origin: publicUrl.origin,
    host: publicUrl.host,
    issuer: issuer.href,
    jwksUrl: jwks.href,
    audience: env.MCP_OAUTH_AUDIENCE,
    databaseUrl: env.MCP_DATABASE_URL,
    identities,
    port,
  });
}
