# QuickServe assessment and staging test starter

Read docs/architecture/reliability-remediation.md first. No stress/chaos test was executed against a deployment.

The k6 script tests ONLY authenticated REST order reads, with positive and negative sentinel
controls and per-tenant latency thresholds. It does not test the frontend, public ordering,
mutations, payments, websockets, noisy-neighbor control or recovery. Add those scenarios
from the assessment before a capacity approval. It is closed-loop; add an arrival-rate test.

## Prepare

1. Provision a separate staging Supabase project with production-equivalent schema, policies
   and sized infrastructure. Never use the production ref or copy production credentials.
2. Seed synthetic restaurants, orders and identities. Every user must be allowed to read
   its restaurant's sentinel order and denied the next restaurant's sentinel order.
   Do not use platform owners, service-role keys or users with cross-tenant memberships.
3. Create `fixtures.private.json` locally in this directory. Keep it out of Git and shared
   archives. Use this shape, with actual staging values:

```json
{
  "environment": "staging",
  "projectRef": "abcdefghijklmnopqrst",
  "supabaseUrl": "https://abcdefghijklmnopqrst.supabase.co",
  "publishableKey": "sb_publishable_REPLACE",
  "tenants": [
    {
      "restaurantId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "sentinelOrderId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "users": [
        { "userId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "accessToken": "REPLACE", "refreshToken": "REPLACE" }
      ]
    }
  ]
}
```

Smoke requires at least two distinct tenants. Target requires at least 20 tenants and enough
unique users to cover 1,000 VUs (50 users per tenant for 20 tenants). Target mode requires refresh tokens; each distinct VU refreshes its own session with staggered timing. Smoke needs a token valid at setup. Never change production token lifetime for a benchmark or use platform-owner identities.

4. Install k6 from its official distribution. Review provider costs and staging resource
   limits before running. Block outbound live payment/SMS/email/webhook effects.
5. Run local guard tests with `node --test load-config.test.mjs`.

## Run on staging

```sh
CONFIRM_STAGING=yes MODE=smoke k6 run load-read-path.js
CONFIRM_STAGING=yes MODE=target k6 run --summary-export=results.private.json load-read-path.js
```

Do not interpret default smoke mode as a 1,000-user test. This script was syntax/guard-tested
locally but was not executed with k6 or live fixtures. Setup validates identities and access
controls; those setup requests contribute HTTP metrics, so compare phase-specific data.
Run repeated baselines, capture metric time series and record host/DB/Realtime limits.

Use the release gates, role mix, fault matrix and recovery criteria in the remediation document for the
full campaign. Exclude secrets, bearer tokens, customer data and private result files from
reports. After running, revoke test sessions and remove synthetic data through the approved
staging reset process.
