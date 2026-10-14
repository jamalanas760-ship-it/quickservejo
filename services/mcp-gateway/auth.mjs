import { createRemoteJWKSet, jwtVerify } from "jose";
export class AccessError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export function createVerifier(
  config,
  keySet = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5000,
    cooldownDuration: 30000,
    cacheMaxAge: 600000,
  }),
) {
  return async function verify(header) {
    const match = typeof header === "string" && /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(header);
    if (!match || match[1].length > 8192) throw new AccessError(401, "invalid_token");
    let payload;
    try {
      ({ payload } = await jwtVerify(match[1], keySet, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256", "ES256"],
        requiredClaims: ["exp", "iat", "sub"],
        clockTolerance: 5,
      }));
    } catch {
      throw new AccessError(401, "invalid_token");
    }
    const clientId = payload.azp ?? payload.client_id;
    if (
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.exp - payload.iat > 900 ||
      payload.iat > Date.now() / 1000 + 5 ||
      typeof clientId !== "string" ||
      !clientId ||
      clientId.length > 256
    )
      throw new AccessError(401, "invalid_token");
    const userId = config.identities.get(payload.sub);
    if (!userId) throw new AccessError(403, "identity_not_linked");
    const scopes = new Set(typeof payload.scope === "string" ? payload.scope.split(/\s+/) : []);
    if (!scopes.has("quickserve:read")) throw new AccessError(403, "insufficient_scope");
    return Object.freeze({
      userId,
      subject: payload.sub,
      clientId,
      issuer: config.issuer,
      scopes,
      expiresAt: payload.exp,
    });
  };
}
