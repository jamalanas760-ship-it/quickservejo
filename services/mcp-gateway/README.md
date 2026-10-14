# QuickServe managed-OAuth MCP gateway

The pinned official MCP SDK v2 serves both the finalized 2026-07-28 protocol and stateless compatibility for initialization-era clients. Both paths are covered by HTTP tests, including rejection of mismatched method/name headers.

This separately deployable service removes the MCP runtime's dependency on
Lovable publication and Supabase's disabled OAuth Server. It does **not** enable
Supabase OAuth Server or Dynamic OAuth Apps. The existing `/mcp` on the Lovable
site remains unchanged until the website is republished and its displayed
connection URL is updated to the deployed gateway.

## Deployment prerequisites

1. An accessible Auth0 tenant (or another compatible managed OAuth issuer), with
   a registered API whose audience is the exact gateway HTTPS `/mcp` URL.
   Configure delegated user access tokens with a maximum **900-second** lifetime,
   `quickserve:read` and optional `quickserve:write` scopes, and a client claim
   (`azp`/`client_id`). Configure authorization-code + PKCE S256, user consent,
   refresh rotation/revocation, and the client registration mechanism supported
   by each target AI client. The gateway implements no homemade authorization
   server and stores no user passwords or refresh tokens.
2. Operator-verified bindings from provider `sub` values to existing QuickServe
   `auth.users.id` UUIDs, supplied through `MCP_IDENTITY_BINDINGS`. Verify control
   of both accounts before adding a binding. Do not match by email or trust
   user-editable claims. Unknown subjects are denied. Remove a binding and restart
   the service to revoke gateway access; managed-provider revocation also applies
   subject to the short access-token lifetime.
3. Run `database-setup.sql` as the database administrator. Securely assign a strong
   deployment password and enable LOGIN for `quickserve_mcp_gateway`. Never use
   the `postgres` or `service_role` account. Configure `MCP_DATABASE_URL` using
   the Supabase pooler/direct host with certificate-verified TLS. Deployment
   secrets belong in the hosting secret manager, not GitHub source or VITE vars.
4. Deploy this directory to a Node 22+ container host with public HTTPS. Use
   `.env.example` as a configuration reference, not real credentials. Publish
   the gateway only after identity bindings and database role validation pass.
   Pin the base container image to an approved digest in the deployment system.
5. Set edge/IP rate limits at the host; the service also limits each subject to
   120 HTTP MCP requests/minute per process. Configure health monitoring and
   alerts. Do not log Authorization headers, JWTs or database URLs.
6. Point each compatible AI client at the gateway URL, complete managed OAuth,
   and test a permitted read before any writes. Republish the Lovable UI to show
   the new URL. Set Lovable build variable `VITE_QUICKSERVE_MCP_URL` to the exact gateway HTTPS `/mcp` URL and server variable `MCP_GATEWAY_OAUTH_ISSUER` to the managed issuer (including its trailing slash). The UI readiness check validates the configured gateway and provider before enabling URL copying. GitHub merge/sync alone does not publish the website.

## Permission preservation

The gateway verifies JWT signature, pinned issuer, resource audience, expiry,
client claim and scopes. Token `sub` is mapped only by trusted operator config.
Every database call checks that the mapped Supabase user still exists and is not
banned/deleted. Then a **single transaction** sets local JWT claims and switches
to the non-owner, non-bypass-RLS `authenticated` role. Existing RLS policies and
the existing capability-checked MCP RPCs run as that mapped UUID. Transaction-local
role/claims reset on commit or rollback, including pooled connections.

Read calls use read-only transactions. Only explicitly registered tools can run;
there is no arbitrary SQL/RPC API. Write tools are absent from discovery without
`quickserve:write`, and writes retain existing database permissions. Scope never
grants additional restaurant access. Claims use `aal1`; this deliberately does
not assert MFA or a Supabase browser session. Existing policies requiring stronger
authentication or a session must deny those calls until a separately reviewed
integration supports them. Existing Auth0 access tokens cannot access Supabase's
REST API through this service; they are never treated as Supabase JWTs.

The internal SECURITY DEFINER helper is in an unexposed schema, checks auth.uid(),
and returns only account eligibility. It never accesses application records.

## Run and test

```sh
npm ci --ignore-scripts
npm test
# Supply deployment environment via a secret manager before starting:
npm start
```

The tests perform real signed-JWT validation and HTTP MCP initialization,
discovery and tool calls using a simulated database. Non-executing plans for all nine queries and transactional negative account/tenant checks were also verified against the live schema with all temporary role/schema changes rolled back. Live-provider authorization,
positive/cross-user access with actual mapped identities, TLS/pooler compatibility and each AI client's callback
must additionally pass before this is considered a working production connection.
Missing/unsafe configuration prevents startup. `/health` verifies process health,
not complete provider discovery, database availability or an AI client connection.

## Release acceptance

- Public resource metadata identifies the exact deployed MCP URL and issuer.
- Provider discovery, consent, PKCE exchange and refresh work on hosted HTTPS;
  no production consent URL or server endpoint points at localhost.
- Anonymous, wrong-signature/issuer/audience, expired, unlinked, banned and
  insufficient-scope callers are rejected.
- A valid mapped user sees only their restaurants; a second user cannot access
  the first user's data. Verify both SELECT and UPDATE denial with live RLS.
- Existing account capabilities still restrict analytics, reservations and
  attendance. Revoking membership takes effect on the next database call.
- Read-only users cannot discover or execute writes. Writes are tested with
  controlled test records, not customer orders.
- Database connections retain neither role nor claims across calls/errors.
- Verify supported ChatGPT, Claude, Gemini and Grok clients independently.

Until these deployment checks pass, this is a tested implementation awaiting
provider/hosting configuration, not a repaired live QuickServe connector.
