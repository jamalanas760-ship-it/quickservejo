import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/mcp-oauth.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports, URL, AbortSignal, fetch});
const {consentAuthorizationId, safeOAuthCallback, oauthErrorKind, checkMcpOAuthReadiness} = exports;
const id = "12345678-1234-1234-1234-123456789abc";
const base = "https://test.supabase.co", issuer = base + "/auth/v1";
const metadata = {issuer, authorization_endpoint:issuer+"/oauth/authorize", token_endpoint:issuer+"/oauth/token", jwks_uri:issuer+"/.well-known/jwks.json", registration_endpoint:issuer+"/oauth/register", code_challenge_methods_supported:["S256"]};
const reply = (body, ok=true) => ({ok, json:async()=>body});
test("login returns only to a valid consent request, preserving its id", () => {
 assert.equal(consentAuthorizationId("/.lovable/oauth/consent?authorization_id="+id), id);
 for (const path of ["https://evil.example", "//evil.example/.lovable/oauth/consent?authorization_id="+id, "/dashboard", "/.lovable/oauth/consent?authorization_id=invalid", "/\\evil.example", undefined]) assert.equal(consentAuthorizationId(path), null);
});
test("OAuth callbacks preserve code/state and permit local CLI callbacks", () => {
 for(const url of ["https://client.example/callback?code=one&state=two", "http://127.0.0.1:8000/callback?code=one", "http://[::1]:8000/callback"]) assert.equal(safeOAuthCallback(url), url);
 for(const url of ["javascript:alert(1)", "data:text/html,test", "http://evil.example", "https://user:password@client.example"]) assert.throws(()=>safeOAuthCallback(url));
});
test("disabled OAuth produces a specific actionable diagnostic", async()=>{
 assert.equal(oauthErrorKind({code:"feature_disabled"}),"disabled");
 assert.equal(oauthErrorKind(new Error("OAuth server is disabled")),"disabled");
 const result = await checkMcpOAuthReadiness(base, async()=>reply({error_code:"feature_disabled"}, false));
 assert.equal(result.status,"oauth_disabled");
});
test("valid discovery and asymmetric keys report readiness, never a client connection", async()=>{
 let requests=0;
 const result=await checkMcpOAuthReadiness(base,async(url)=>{requests++;return reply(url.includes("jwks.json")?{keys:[{kty:"EC",alg:"ES256"}]}:metadata)});
 assert.equal(result.status,"ready");assert.equal(result.asymmetricKeys,true);assert.equal(result.dynamicRegistration,true);assert.equal(requests,2);
});
test("missing registration endpoint is distinguished from invalid JWT signing keys", async()=>{
 assert.equal((await checkMcpOAuthReadiness(base,async(url)=>reply(url.includes("jwks.json")?{keys:[{kty:"RSA",alg:"RS256"}]}:{...metadata,registration_endpoint:undefined}))).status,"registration_required");
 assert.equal((await checkMcpOAuthReadiness(base,async(url)=>reply(url.includes("jwks.json")?{keys:[{kty:"oct",alg:"HS256"}]}:metadata))).status,"discovery_invalid");
});
test("reject foreign discovery endpoints before fetching them", async()=>{
 for(const change of [{issuer:"https://evil.example"}, {jwks_uri:"https://evil.example/keys"},{code_challenge_methods_supported:["plain"]}]) {
 let calls=0;assert.equal((await checkMcpOAuthReadiness(base,async()=>{calls++;return reply({...metadata,...change})})).status,"discovery_invalid");assert.equal(calls,1);
 }
});
test("network errors and invalid Supabase origins fail gracefully", async()=>{
 assert.equal((await checkMcpOAuthReadiness(base,async()=>{throw new Error("offline")})).status,"unavailable");
 assert.equal((await checkMcpOAuthReadiness("http://test.supabase.co",async()=>{throw new Error("must not fetch")})).status,"discovery_invalid");
});
