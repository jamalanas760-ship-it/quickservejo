# Profile settings

The Personal Information, Preferences, Security, and Organization & Appearance sections restore the earlier profile hero, underline tabs, and overview cards. Forms stack on mobile and retain wider layouts on tablet and desktop. A scoped header grid overrides the shared mobile action-width rule that previously squeezed the heading into a narrow column.

Personal information updates the user's display metadata and contact number. Login email and organization roles are not editable here. Preferences are saved on the current device; theme and language controls retain their earlier behavior. Detailed notification settings remain available. Restaurant branding, navigation, colors, imagery, regional settings, and GPS attendance configuration retain their existing permission checks.

Bundled avatars use 32 reference-based vector portrait WebP assets in `public/avatars/reference-b/`, generated with the built-in image generator. The production brief is: polished modern flat-vector head-and-shoulder portraits matching the supplied style, 32 distinct characters, role-specific uniforms/accessories, and 32 different pastel backgrounds; no labels or text. Each catalogue role receives a distinct default portrait; gender variants and alternate portraits remain selectable. Legacy bundled SVG selections resolve to their corresponding new portrait; uploaded photos remain unchanged.

## Password policy scope

`workspace_password_policies` stores tenant-specific rules. Active workspace members may read their policy. Only an active `restaurant_admin` for that tenant or a platform super administrator may insert/update it. Anonymous users have no table access. Delete, truncate, and other inherited privileges are revoked.

The `quickserve-password` Edge Function requires an authenticated bearer token and the current password. It checks all policies for the account's active workspaces and verifies the current password in a separate short-lived session. It revokes only that verification session and forwards the change with the caller's original token, preserving its authentication assurance. Passwords and tokens are not logged or persisted by this function.

**These custom rules protect password changes through the QuickServe profile.** They do not replace Supabase Auth's project-wide password policy, recovery flow, direct Auth API, or administrator credential tools. Those flows continue using the provider's configured rules. The Security page discloses this scope. Before a workspace policy has been saved, profile password changes use the displayed default rules (12 characters, one of each character type, username and sequence blocking).

The username check uses the authenticated email's local-part tokens of at least three characters. Sequence blocking rejects ascending and descending runs of four or more ASCII letters or digits. Character classes support Unicode; passwords also respect the provider's 72-byte bcrypt limit.

## Validation

- TypeScript and targeted lint checks.
- Contract tests including policy validation and authenticated password gateway behavior.
- Isolated Postgres/PGlite tests for cross-tenant isolation, member read-only behavior, admin writes, input bounds, and privilege restrictions.
- Chromium checks using full shared app styles at 320, 360, 390, 430, 768, 820, 1024, and 1440px across all four sections; heading sizing, horizontal overflow, Arabic, avatar gallery, and password dialog checks.
- Live migration/privilege verification, Edge Function deployment, and an unauthenticated endpoint check returning HTTP 401. No real user's password was changed for testing.
