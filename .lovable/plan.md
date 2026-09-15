# Diagnosis: user-management 401 (read-only, no changes made)

## Root cause found — a name mismatch

The custom key you added is stored under the name **`SUPABAS_SECRET_KEY`**.
The server code looks for **`SUPAB_SECRET_KEY`** (`src/integrations/supabase/client.server.ts:12`).

Those two names are not the same, so the key you added is never picked up. The
code then falls through to the built-in Lovable Cloud keys, which belong to a
**different** database project than the one the app signs in against — a valid
key for the wrong project, which the sign-in service rejects with 401.

## Evidence

- Configured secret names (values never read): `LOVABLE_API_KEY`,
  `LOVABLE_CRON_SECRET`, `SUPABAS_SECRET_KEY`. No `SUPAB_SECRET_KEY` exists.
- `client.server.ts` selection order: `SUPAB_SECRET_KEY` → `SUPABASE_SECRET_KEY`
  → `SUPABASE_SECRET_KEYS.default` → `SUPABASE_SERVICE_ROLE_KEY`. With the first
  absent, a managed key is selected.
- Destination project: the admin client's URL comes from
  `src/integrations/supabase/public-config.ts`, hardcoded to project ref
  `gtcmyaksmyiarokloyje` (your external sign-in project).
- Managed keys in this workspace are issued for a different project ref, so the
  admin request is cross-project → HTTP 401 from the Auth Admin API.
- This is a configuration mismatch, not a stale deployment: the same mismatch
  exists in preview and production, which matches "republished and 401 persists".
- Key **type** could not be classified, because the value is not exposed to me
  and no server log currently records a type-only marker. That check is part of
  the fix below.

## Smallest supported fix (two options, pick one)

1. **Rename the secret** in Project Settings → Secrets to exactly
   `SUPAB_SECRET_KEY` (delete `SUPABAS_SECRET_KEY`, add the same value under the
   correct name). Zero code change. Requires you to paste the value again.
2. **Or** change one line in `client.server.ts` to also accept
   `SUPABAS_SECRET_KEY`. One-line, no secret handling on your side.

The value must be the **secret / service-role** key of project
`gtcmyaksmyiarokloyje` — a publishable key or a key from another project will
still return 401.

## Optional safety add-on (recommended, no secrets exposed)

Add a startup check that logs only: which variable name was selected, the key
**type** (secret / publishable / legacy JWT / unrecognised), and whether its
project ref matches the configured URL. Never the value, prefix, or hash. This
turns any future mismatch into a one-line log instead of a bare 401.

## What is preserved

No change to authentication flow, RLS, staff/menu/orders/ERP features, routes,
or architecture. The proposed fix touches only key selection.

## Access limits

Key type and upstream Auth error body cannot be confirmed without either
resuming diagnostics on the external project's own dashboard (outside my
access) or adding the type-only log above. Everything else is confirmed.
