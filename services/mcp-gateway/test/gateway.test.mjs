import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { loadConfig } from "../config.mjs";
import { createVerifier } from "../auth.mjs";
import { createDatabase } from "../database.mjs";
import { createApp } from "../server.mjs";
import { tools, executeTool } from "../tools.mjs";
import { assertProviderReady } from "../discovery.mjs";

async function decodeMcp(response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const line = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .at(-1);
    return JSON.parse(line.slice(5));
  }
  return JSON.parse(text);
}

const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const env = {
  MCP_PUBLIC_URL: "https://gateway.example/mcp",
  MCP_OAUTH_ISSUER: "https://tenant.auth0.com/",
  MCP_OAUTH_JWKS_URL: "https://tenant.auth0.com/.well-known/jwks.json",
  MCP_OAUTH_AUDIENCE: "https://gateway.example/mcp",
  MCP_IDENTITY_BINDINGS: JSON.stringify({ "auth0|one": user }),
  MCP_DATABASE_URL: "postgresql://quickserve_mcp_gateway:test@db.example:5432/postgres",
};
const config = loadConfig(env);
const keys = await generateKeyPair("RS256");
const jwk = await exportJWK(keys.publicKey);
jwk.kid = "test";
const verify = createVerifier(config, createLocalJWKSet({ keys: [jwk] }));
async function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: "auth0|one",
    azp: "approved-client",
    scope: "quickserve:read",
    iss: config.issuer,
    aud: config.audience,
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(keys.privateKey);
}

test("configuration refuses localhost, wrong audience, foreign keys, empty mappings and privileged DB credentials", () => {
  for (const patch of [
    { MCP_PUBLIC_URL: "http://localhost:3000/mcp" },
    { MCP_PUBLIC_URL: "https://gateway.example/wrong" },
    { MCP_OAUTH_AUDIENCE: "https://other.example/mcp" },
    { MCP_OAUTH_JWKS_URL: "https://other.example/keys" },
    { MCP_IDENTITY_BINDINGS: "{}" },
    { MCP_IDENTITY_BINDINGS: JSON.stringify({ "auth0|one": "not-a-uuid" }) },
    { MCP_DATABASE_URL: "postgresql://postgres:secret@db.example/postgres" },
  ])
    assert.throws(() => loadConfig({ ...env, ...patch }));
});
test("only valid delegated tokens for the configured issuer, audience and linked identity pass", async () => {
  assert.equal((await verify("Bearer " + (await token()))).userId, user);
  const now = Math.floor(Date.now() / 1000);
  for (const patch of [
    { iss: "https://evil.example/" },
    { aud: "wrong" },
    { exp: now - 60 },
    { sub: "unknown" },
    { scope: "" },
    { iat: now + 300, exp: now + 600 },
    { exp: now + 3600 },
    { azp: undefined, client_id: undefined },
  ])
    await assert.rejects(() => token(patch).then((t) => verify("Bearer " + t)));
  for (const header of [
    undefined,
    "Basic abc",
    "Bearer bad",
    "Bearer " + (await token()) + "extra",
  ])
    await assert.rejects(() => verify(header));
});
test("provider metadata cannot override an identity binding", async () => {
  const identity = await verify(
    "Bearer " +
      (await token({ user_metadata: { quickserve_user_id: other }, quickserve_user_id: other })),
  );
  assert.equal(identity.userId, user);
});
test("write scope and input validation run before database access; tokens are checked again at tool execution", async () => {
  let calls = 0;
  const database = {
    run: async (identity, write, operation) => {
      calls++;
      if (write && !identity.scopes.has("quickserve:write")) throw new Error("denied");
      return operation(() => []);
    },
  };
  const identity = await verify("Bearer " + (await token()));
  const booking = tools.find((t) => t.name === "create_reservation");
  await assert.rejects(() =>
    executeTool(booking, { restaurant_id: "invalid" }, identity, database),
  );
  assert.equal(calls, 0);
  await assert.rejects(() => executeTool(tools[0], {}, { ...identity, expiresAt: 0 }, database));
  assert.equal(calls, 0);
  const db = createDatabase(config, () => ({
    begin: () => {
      throw new Error("must not open transaction");
    },
  }));
  await assert.rejects(
    () => db.run(identity, true, () => {}),
    (e) => e.code === "insufficient_scope",
  );
});
test("database runs claims and role inside one transaction and checks account eligibility before application data", async () => {
  const calls = [];
  const tx = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return text.includes("user_enabled") ? [{ enabled: true }] : [];
  };
  const db = createDatabase(config, () => ({ begin: (fn) => fn(tx) }));
  const identity = await verify("Bearer " + (await token()));
  await db.run(identity, false, async () => {
    calls.push({ text: "operation" });
  });
  assert.match(calls[0].text, /transaction read only/);
  const claims = JSON.parse(calls.find((c) => c.text.includes("set_config")).values[0]);
  assert.equal(claims.sub, user);
  assert.equal(claims.aal, "aal1");
  assert.equal(claims.role, "authenticated");
  assert.ok(!("app_metadata" in claims));
  assert.ok(
    calls.findIndex((c) => c.text.includes("user_enabled")) <
      calls.findIndex((c) => c.text.includes("role authenticated")),
  );
  assert.equal(calls.at(-1).text, "operation");
});
test("banned/deleted account gate prevents the database role switch and all application operations", async () => {
  let touched = false;
  const texts = [];
  const tx = async (strings) => {
    const text = strings.join("?");
    texts.push(text);
    return text.includes("user_enabled") ? [{ enabled: false }] : [];
  };
  const db = createDatabase(config, () => ({ begin: (fn) => fn(tx) }));
  await assert.rejects(
    () =>
      db.run(awaitIdentity, false, () => {
        touched = true;
      }),
    (e) => e.code === "account_unavailable",
  );
  assert.equal(touched, false);
  assert.ok(!texts.some((t) => t.includes("role authenticated")));
});
const awaitIdentity = await verify("Bearer " + (await token()));
test("HTTP MCP handshake and listing work; anonymous access, write discovery, host spoofing and raw database errors are blocked", async (t) => {
  let calls = 0;
  const db = {
    run: async () => {
      calls++;
      throw Object.assign(new Error("SECRET DATABASE DETAILS"), { code: "42501" });
    },
  };
  const local = { ...config };
  const app = createApp(local, db, verify);
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  const origin = `http://127.0.0.1:${listener.address().port}`;
  local.host = new URL(origin).host;
  t.after(async () => {
    await app.gatewayClose();
    await new Promise((resolve) => listener.close(resolve));
  });
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  const send = (body, auth) =>
    fetch(origin + "/mcp", {
      method: "POST",
      headers: { ...headers, ...(auth ? { Authorization: "Bearer " + auth } : {}) },
      body: JSON.stringify(body),
    });
  const request = (method, params = {}) => ({ jsonrpc: "2.0", id: 1, method, params });
  const anonymous = await send(request("tools/list"));
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get("www-authenticate"), /oauth-protected-resource\/mcp/);
  assert.equal(calls, 0);
  const metadata = await (await fetch(origin + "/.well-known/oauth-protected-resource/mcp")).json();
  assert.equal(metadata.resource, config.publicUrl);
  assert.deepEqual(metadata.authorization_servers, [config.issuer]);
  const bearer = await token();
  const init = await send(
    request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    }),
    bearer,
  );
  assert.equal(init.status, 200);
  assert.equal((await decodeMcp(init)).result.serverInfo.name, "quickserve");
  const listing = await decodeMcp(await send(request("tools/list"), bearer));
  assert.equal(listing.result.tools.length, 6);
  assert.ok(!listing.result.tools.some((t) => t.name === "create_reservation"));
  const modernMeta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const modernHeaders = {
    ...headers,
    Authorization: "Bearer " + bearer,
    "MCP-Protocol-Version": "2026-07-28",
    "MCP-Method": "tools/list",
  };
  const modern = await fetch(origin + "/mcp", {
    method: "POST",
    headers: modernHeaders,
    body: JSON.stringify(request("tools/list", { _meta: modernMeta })),
  });
  assert.equal(modern.status, 200);
  assert.equal((await decodeMcp(modern)).result.tools.length, 6);
  const mirrored = await fetch(origin + "/mcp", {
    method: "POST",
    headers: { ...modernHeaders, "MCP-Method": "tools/call", "MCP-Name": "different-tool" },
    body: JSON.stringify(
      request("tools/call", { name: "list_restaurants", arguments: {}, _meta: modernMeta }),
    ),
  });
  assert.equal(mirrored.status, 400);
  assert.equal(calls, 0);
  const writable = await token({ scope: "quickserve:read quickserve:write" });
  const all = await decodeMcp(await send(request("tools/list"), writable));
  assert.equal(all.result.tools.length, 9);
  const call = await send(
    request("tools/call", { name: "list_restaurants", arguments: {} }),
    bearer,
  );
  const result = await decodeMcp(call);
  assert.equal(result.result.isError, true);
  assert.ok(!JSON.stringify(result).includes("SECRET"));
  assert.equal(calls, 1);
  const spoof = await new Promise((resolve, reject) => {
    const req = httpRequest(origin + "/health", { headers: { Host: "evil.example" } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(spoof, 400);
  const badOrigin = await send(request("tools/list"), bearer);
  assert.equal(badOrigin.status, 200);
  const denied = await fetch(origin + "/mcp", {
    method: "POST",
    headers: { ...headers, Origin: "https://evil.example", Authorization: "Bearer " + bearer },
    body: JSON.stringify(request("tools/list")),
  });
  assert.equal(denied.status, 403);
});

test("startup discovery rejects mismatched issuer, foreign keys and PKCE downgrade", async () => {
  const metadata = {
    issuer: config.issuer,
    jwks_uri: config.jwksUrl,
    authorization_endpoint: config.issuer + "authorize",
    token_endpoint: config.issuer + "oauth/token",
    code_challenge_methods_supported: ["S256"],
  };
  await assertProviderReady(config, async () => ({ ok: true, json: async () => metadata }));
  for (const change of [
    { issuer: "https://evil.example/" },
    { jwks_uri: "https://evil.example/keys" },
    { token_endpoint: "http://localhost:3000/token" },
    { code_challenge_methods_supported: ["plain"] },
  ])
    await assert.rejects(() =>
      assertProviderReady(config, async () => ({
        ok: true,
        json: async () => ({ ...metadata, ...change }),
      })),
    );
});
test("startup refuses elevated or application-table-owning database roles", async () => {
  const good = {
    rolname: "quickserve_mcp_gateway",
    member: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolinherit: false,
    elevated_member: false,
  };
  for (const change of [
    { rolsuper: true },
    { rolbypassrls: true },
    { rolinherit: true },
    { elevated_member: true },
    { member: false },
    { rolname: "postgres" },
  ]) {
    const db = createDatabase(config, () => async () => [{ ...good, ...change }]);
    await assert.rejects(() => db.assertRole());
  }
  const db = createDatabase(
    config,
    () => async (strings) =>
      strings.join("").includes("owns_tables") ? [{ owns_tables: true }] : [good],
  );
  await assert.rejects(() => db.assertRole());
});
test("gateway order schemas match the live QuickServe enum and validate cancellation before database access", () => {
  const tool = tools.find((t) => t.name === "update_order_status");
  for (const status of ["new", "accepted", "preparing", "ready", "served", "paid"])
    assert.equal(tool.schema.safeParse({ order_id: user, status }).success, true);
  for (const status of ["pending", "confirmed", "completed"])
    assert.equal(tool.schema.safeParse({ order_id: user, status }).success, false);
  assert.equal(tool.schema.safeParse({ order_id: user, status: "cancelled" }).success, false);
  assert.equal(
    tool.schema.safeParse({
      order_id: user,
      status: "cancelled",
      cancellation_reason: "guest_request",
    }).success,
    true,
  );
});
