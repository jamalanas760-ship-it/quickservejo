# QuickServe MCP connection status and safe replacement

The live `/mcp` endpoint advertises the Supabase issuer
`https://gtcmyaksmyiarokloyje.supabase.co/auth/v1`. On 2026-10-14 that
issuer's discovery endpoint returned `feature_disabled`: OAuth server is disabled.
The authorization preview in the reported screenshot points to
`http://localhost:3000/oauth/consent`, which is not the published QuickServe
consent route `/.lovable/oauth/consent`. Neither issue can be fixed by hiding a UI panel.

## Required constraint

Keep Supabase OAuth Server and dynamic OAuth app registration disabled.
The app must not recommend enabling either feature. The owner setup checklist
and project-owner settings links are removed from the customer-facing MCP flow.
Existing JWT validation, restaurant permissions and RLS remain enforced.
Server URL copying is disabled until the existing provider passes readiness checks.
A readiness check never means that an AI client has successfully connected.

## Safe architecture without those settings

Use a separately hosted, maintained OAuth 2.1 authorization provider. This is a
provisioning and integration task, not a change of browser settings. Do not create
an unauthenticated endpoint, accept copied browser sessions, or use a Supabase
service-role key in an AI client as a workaround.

Before changing the issuer, provision the following:

- Public HTTPS authorization, token, metadata and signing-key endpoints.
  The hosted consent/login URL must use the production domain, never a localhost
  fallback. Localhost callbacks are legitimate only for a local CLI client.
- Explicitly registered clients with exact callback URLs, authorization code
  flow and PKCE S256. Client registration support must be checked against each
  target AI client; static registration is not universally supported.
- Short-lived tokens bound to the MCP resource, restricted scopes, explicit
  consent, revocation and refresh-token rotation where applicable.
- A verified mapping from the external subject to the existing QuickServe user
  and restaurant memberships. Changing `issuer` alone is insufficient: current
  tools forward Supabase user tokens so database RLS runs as that user. External
  tokens require a supported Supabase third-party auth integration or a reviewed
  server-side delegation layer preserving that exact permission model.
- Rate limits and redacted operational logs; credentials stay server-side.

Do not advertise the replacement issuer or mark the UI ready until it is deployed
and the following checks pass: public metadata discovery, successful consent and
PKCE token exchange, MCP initialization/tool listing, permitted restaurant reads,
rejection of anonymous/expired/wrong-audience tokens, and cross-tenant denial.
Verify each AI client separately; the existence of an MCP URL does not establish
compatibility with ChatGPT, Claude, Gemini or Grok.

## What this patch does

Removes the setup checklist and links encouraging the prohibited settings,
replaces enable-setting instructions with accurate blocked-state messages, and
prevents copying the server URL as a ready connection before readiness succeeds.
It does not provision a replacement identity provider or claim to repair the
live OAuth flow. Existing connections continue to require valid delegated tokens.

References:

- https://modelcontextprotocol.io/specification/latest/basic/authorization
- https://www.npmjs.com/package/@lovable.dev/mcp-js

## Separate managed-OAuth gateway implementation

The implementation is in `services/mcp-gateway/`, with a pinned dependency lockfile, container definition, dedicated CI, deployment setup SQL and security tests. See its README for provider configuration, operator-verified identity bindings and release acceptance. It supports all nine QuickServe tools and keeps Supabase OAuth settings disabled.

After deploying that service, set `VITE_QUICKSERVE_MCP_URL` in Lovable to its exact HTTPS `/mcp` endpoint and `MCP_GATEWAY_OAUTH_ISSUER` in the website server environment to the managed issuer. Republish the website to show and validate the new connection URL. Without those explicit values, the existing website continues to report its original Supabase provider status; this code does not silently switch production authentication.
