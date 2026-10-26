# QuickServe reliability remediation

## Delivery status

This change hardens application code and provides reviewed, testable database migrations.
It does not certify 1,000 active users, eliminate every shared-service outage, provision
paid resources, configure provider backups/HA, or prove a production recovery time.
The user explicitly declined the optional paid staging branch; do not provision one. No paid branch is required for local
checks. The test runner defaults to isolated PostgreSQL-in-WASM; CI runs the same suite
against native PostgreSQL 17, including competing claim transactions.

## Implemented changes

| Finding | Change | Verification |
|---|---|---|
| Integration credential exposure | Exact operator-controlled restaurant/connection/provider/endpoint binding; customer config is not a credential source; no global credential fallback; no redirects; deadline and capped response body | Wrong tenant/connection/provider/endpoint denied; unsafe URLs rejected; transport/header/body limits tested |
| Job overlap | Transactional SKIP LOCKED claims, attempt increment at claim time, expiring lease tokens and conditional acknowledgement | SQL claim/recovery/ACL tests; competing claims on native PostgreSQL CI |
| Stalled notifications | Booking, waitlist, message and campaign recipient claims; bounded parallelism; provider deadlines; email idempotency keys; unknown SMS outcomes quarantined | SQL lease tests, Edge Function typecheck; real provider fault tests still required |
| Tenant foreign records | Replace single-column tenant-to-tenant FKs with tenant-aware pairs while preserving names and deletion behavior | 101 live relationships had zero mismatches in read-only preflight; fixtures test privileged cross-tenant denial, SET NULL, cascade and dirty-data rollback |
| Counter amplification | One invoker RPC instead of five requests, caller RLS, tenant timezone, less polling, shared per-account/restaurant timers and channels, coalesced realtime invalidations | SQL authorization and numeric results; event-burst tests |
| Misleading counters | Retain last good data, show unavailable state, suppress unverified badges | Frontend typecheck and regression tests |
| Polling and large payloads | Membership/presence intervals 60s; healthy service/kitchen reconciliation 120s; bounded ID batches/pages; kitchen renders 50 cards per stage initially with Show more | Batch size/completeness/failure tests; build/typecheck |
| Release blast radius | Self-repair cannot push main; produces a validated review patch; separate non-production project settings fail closed | Workflow/config review; existing CI checks |
| Monitoring | Liveness/readiness endpoints, public minimal DB probe, independent uptime workflow, redacted/tenant-attributed metrics, owner-only per-tenant queue metrics | Access-control, route redaction and metrics tests; host/probe configuration pending |
| Gateway replicas | Database-backed request budgets replace per-process quota; DB readiness endpoint | Gateway HTTP tests and SQL quota test; hosted gateway deployment not established |

No new payment product or charging behavior is introduced. Existing cashier behavior is
preserved; tenant constraints also protect related existing records.

## Important design details

- Tenant foreign-key conversion preserves existing constraint names and removes the
  previous constraint atomically. Adding parallel duplicate FKs would make PostgREST
  embedded joins ambiguous. Nullable optional references clear only their foreign record
  ID on parent deletion, not restaurant_id. Dirty data aborts rather than being repaired
  automatically. Lock/statement budgets fail rather than holding indefinite locks.
- Existing rows were checked read-only across 101 eligible relationships. This is not
  evidence that a 101-constraint DDL rollout has been load-tested. Schema sizes and locks
  must be rechecked immediately before rollout on a representative deployment.
- New claim functions are invoker functions callable only by service_role. They accept
  only explicitly supported queue identifiers. API clients cannot claim work.
- Integration retries preserve an external idempotency key; the receiving provider must
  honor it. Exactly-once external delivery cannot be guaranteed if a provider ignores
  idempotency or loses acknowledgement. Unknown SMS outcomes are stopped for provider
  reconciliation instead of silently being resent.
- Each claim admits at most two jobs per restaurant and eight per invocation. Four jobs
  execute concurrently. This bounds one tenant's batch share and runtime, but is not an
  entitlement or a validated throughput target. Measure arrival rate, service time, queue
  age and scheduler cadence; tune worker count/batch size together with database budgets.
- The worker's operator allowlist must contain only provider-owned public HTTPS endpoints.
  It rejects IP literals and common local names, but is not an egress firewall or DNS
  pinning mechanism. Deploy outbound network restrictions if stronger SSRF containment
  is required; do not approve customer-controlled DNS in operator bindings.
- SQL fixture policies exercise new functions with real RLS, but are deliberately a
  small test model. They do not replace the repository's complete production policy
  suite, real API/Storage/Realtime tests, or a full schema replay.
- Shared PostgreSQL remains a shared availability domain. Horizontal web replicas do not
  automatically scale database writes or isolate migrations and provider outages.

## Rollout order

1. Run `bun install --frozen-lockfile`, `bun run build`, `bunx tsc --noEmit`,
   `bun run test:contracts`, `bun run test:database`, gateway tests, and Deno worker checks.
2. Rehearse migrations on an approved separate database using production-equivalent
   schema and synthetic data. Confirm full schema replay and PostgREST joins. No paid
   environment is created by the local test command or CI fixture job.
3. Confirm a restorable backup and a rollback plan before any production DDL. Apply the
   five `20261026...` migrations in filename order with a short lock budget. Stop on
   mismatch or lock failure; never disable FK/RLS checks to force a rollout.
4. Reload PostgREST schema cache and confirm new RPCs and embedded joins with normal
   users. Deploy the five updated workers with their `_shared` dependencies. Preserve
   each function's existing verify_jwt configuration and worker-secret authentication.
5. Set worker secret `QUICKSERVE_INTEGRATION_BINDINGS` as a JSON array using a secret
   manager, not Git/VITE_ variables. Bind each restaurant and connection to its provider,
   exact endpoint, and credential. New generic integrations deliberately fail closed
   until approved. Investigate/rotate any older shared secret if exposure occurred.
6. Publish the web application with matching project settings. Apply migrations before
   publishing the counter/health RPC consumers. GitHub merge alone is not website publish.
7. Configure repository variable QUICKSERVE_PUBLIC_URL only after `/health/live` and
   `/health/ready` work on the actual deployment. Verify workflow failure notifications
   reach the operator and add an independent alert destination if needed.
8. For the optional separate MCP gateway, run reviewed database-setup.sql and configure
   least-privilege credentials/OAuth/hosting before rollout. All replicas use the same
   budget table. Budget total pool connections across every replica and platform service.
9. Smoke-test login/logout, restaurant switching, normal staff permissions, menu editing,
   kitchen backlogs, notifications and a controlled provider delivery. Observe queue age,
   lease expiry, error rates and tenant latency before expanding traffic.

## Outstanding infrastructure and validation gates

| Gate | What remains | Why code alone cannot complete it |
|---|---|---|
| Production-equivalent load | 1,000 active users across 20+ synthetic tenants, ramp/spike/soak/noisy neighbor, per-tenant percentiles | No approved staging target/fixture identities; paid staging was declined |
| Complete workflow coverage | Real browser/mobile, websocket, write race, provider timeout and recovery tests | Local SQL/read tests do not exercise the full deployment |
| Deployment confirmation | Match live frontend/worker versions, migrations, environment config and smoke results | Source changes and passing builds are not deployment evidence |
| Database sizing | CPU/RAM/IOPS, pool waits, active/reserved connections, query plans, actual enforced Realtime limits | Provider compute settings and representative peak telemetry are needed |
| HA/failover | Validate provider topology, restart/failover/reconnect and deployment-cell requirements | Requires infrastructure configuration and controlled fault exercise |
| Backups and recovery | Confirm retention/PITR, private off-site DB/file backups, full and one-tenant restore with reconciliation | Backup inventory, approved private storage and restore exercise are not available here |
| Security settings | Enable supported leaked-password protection and review existing definer grants and extension placement | Provider settings access/plan and function-by-function compatibility review required |
| Fleet isolation | Dedicated customer deployments if contractual/resource isolation is needed | Shared resources cannot promise independent tenant uptime |

Do not label these gates passed until measured. No availability SLA or zero-downtime
promise is created by this PR. Do not run stress or chaos traffic against production as
a shortcut for missing staging.

## Capacity criteria

At target load, initially require core reads p95 <500ms/p99 <1.5s; writes p95 <1s excluding
external settlement; unexpected failures <0.5%; zero cross-tenant leakage or duplicate
business effects; realtime p95 <1s; no unbounded backlog, stale leases, or leaks during
8–24h soak. Report every tenant separately and test one tenant generating half the load.
These are proposed gates, not observed results.

The original polling example was approximately 350 requests/s for 1,000 active authenticated
clients mounting memberships, presence and five counters. The analogous timer-only estimate
is now about 41.7 requests/s when realtime is healthy (60s + 60s + 120s). Event-triggered
refreshes, foreground actions, screen polling, retries and actual role mix are additional;
this estimate is not a benchmark or capacity guarantee.

## Recovery procedure

Use compatible migrations and canary/feature rollout where possible. If application code
fails, roll back the web/worker version while retaining compatible additive RPC/lease
columns. Pause dispatch before reverting worker claims; do not run old and new workers
with incompatible claiming behavior. Once new lease workers are active, prefer a forward
fix over reverting them to unleased claiming. Tenant-aware FK rollback must preserve
correct rows, names and nullable delete actions; rehearse against a backup first.

For lost customer data, restore DB and file objects to an isolated target first. Reconcile
identity mappings, FK dependencies, ledgers, job acknowledgements and attachments before
importing a tenant subset. Do not restore the whole shared production database to fix one
restaurant's deletion. Document operator, incident timeline, backup/restore points, actual
RPO/RTO and post-recovery validation. A written runbook is not a successful restore drill.
