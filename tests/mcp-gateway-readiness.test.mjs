import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function compile(path) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports, URL, AbortSignal, fetch },
  );
  return exports;
}
const { resolveMcpPublicUrl } = compile("../src/lib/mcp-public-url.ts");
const { checkMcpGatewayReadiness } = compile("../src/lib/mcp-gateway-readiness.ts");
const gateway = "https://gateway.example/mcp",
  issuer = "https://tenant.auth0.com/";
const resource = { resource: gateway, authorization_servers: [issuer] };
const metadata = {
  issuer,
  authorization_endpoint: issuer + "authorize",
  token_endpoint: issuer + "oauth/token",
  jwks_uri: issuer + ".well-known/jwks.json",
  code_challenge_methods_supported: ["S256"],
};
test("separate gateway URL is explicit HTTPS; malformed configuration never silently falls back", () => {
  assert.equal(
    resolveMcpPublicUrl(undefined, "https://quickservejo.lovable.app"),
    "https://quickservejo.lovable.app/mcp",
  );
  assert.equal(resolveMcpPublicUrl(gateway, "https://quickservejo.lovable.app"), gateway);
  for (const url of [
    "http://localhost:3000/mcp",
    "https://user:secret@gateway.example/mcp",
    "https://gateway.example/wrong",
    "https://gateway.example/mcp?token=secret",
    "/mcp",
  ])
    assert.throws(() => resolveMcpPublicUrl(url, "https://quickservejo.lovable.app"));
});
test("managed-provider readiness supports pre-registered clients without dynamic registration", async () => {
  let calls = 0;
  const result = await checkMcpGatewayReadiness(gateway, issuer, async (url) => {
    calls++;
    return {
      ok: true,
      json: async () =>
        url.includes("oauth-protected-resource")
          ? resource
          : url.includes("openid-configuration")
            ? metadata
            : { keys: [{ kty: "RSA", alg: "RS256" }] },
    };
  });
  assert.equal(result.status, "ready");
  assert.equal(result.dynamicRegistration, false);
  assert.equal(calls, 3);
});
test("foreign or malformed resource/issuer metadata cannot trigger a fetch to an attacker URL", async () => {
  for (const modified of [
    { resource: "https://evil.example/mcp", authorization_servers: [issuer] },
    { resource: gateway, authorization_servers: ["https://evil.example/"] },
  ]) {
    let calls = 0;
    const result = await checkMcpGatewayReadiness(gateway, issuer, async () => {
      calls++;
      return { ok: true, json: async () => modified };
    });
    assert.equal(result.status, "discovery_invalid");
    assert.equal(calls, 1);
  }
  let calls = 0;
  const result = await checkMcpGatewayReadiness(gateway, issuer, async () => {
    calls++;
    return {
      ok: true,
      json: async () =>
        calls === 1 ? resource : { ...metadata, jwks_uri: "https://evil.example/keys" },
    };
  });
  assert.equal(result.status, "discovery_invalid");
  assert.equal(calls, 2);
  assert.equal(
    (
      await checkMcpGatewayReadiness(gateway, "", async () => {
        throw new Error("must not fetch");
      })
    ).status,
    "unavailable",
  );
});
