# Approved Phase 2 studio

## Result

Standard Menu and Clickable PDF Menu share compact responsive illustrated cards. Each image comes directly from its independent Workspace Settings → Interface image setting. No generated illustration replaces those configured images. Missing/broken images fall back to a system icon. The branding snapshot merges editable fields into the latest theme, preserving Interface images, navigation settings and unrelated workspace fields.

The branding workbench groups identity, colors, publishing, history and menu settings beside a sticky preview of available Standard products. Mobile switches between editor and preview with a persistent publishing action. Existing draft/publish/scheduling/history/rollback and tax/service capabilities remain. Unsupported conceptual typography controls are not introduced.

Menu catalog uses compact shared filter chips and indentation for category → product → option group → option. Category ownership changes through a dedicated move dialog with duplicate-name checking and tenant/Standard-origin scoped updates. Arbitrary category nesting is not introduced. Editing, option pricing and confirmed deletion retain existing persistence.

Single and recurring shifts use compact templates and numbered Basics / Time & repeat / Team sections, with a persistent creation footer. Templates support apply/save/update/duplicate/active/delete. One week explicitly stops after that week; Repeat weekly generates selected weekdays through the chosen end date. It does not continue beyond that date or add an open-ended background rule. Creation keeps the existing atomic schedule RPC, tenant timezone conversion, overnight handling and overlap/approved-leave checks. Total scheduled hours use timestamp differences, including daylight-saving changes.

Navigation uses a 44px edge control with a directional chevron, synchronized rail/label motion, mirrored RTL and reduced-motion support. Existing preference persistence and mobile drawer remain.

## Validation

208/208 contract tests pass, including updated card contracts and regressions for image independence and preserving newer Interface settings. TypeScript passes. ESLint has zero errors and 59 existing warnings. Production build passes.

Browser component verification covers 320,390,768,1024,1440px in English/light and Arabic/dark: cards, branding sections/mobile preview/publish payload, Standard/PDF separation, catalog search/options/editor/move, single-to-recurring creation with matching preview/save counts, navigation geometry/toggle. Fixtures isolate backend calls; this is not signed-in production verification. Live Lovable deployment remains unverified.

The generated concept images are visual references. Implementation uses supported controls and real persisted data rather than illustrative sample totals or availability claims. No database schema or live data changes were required; menu_origin client types were aligned with the existing live column.
