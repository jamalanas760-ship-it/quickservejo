# QuickServe Master Redesign — Full Application Implementation Plan

## Goal

Apply the approved premium restaurant-operations design across every existing QuickServe route while preserving all current data, authentication, tenant isolation, permissions, mutations, realtime behavior, PDF/QR workflows, integrations, and bilingual English/Arabic support.

## Assumptions

- The existing route structure and backend contracts remain authoritative; this is a presentation and interaction refactor, not a data-model rewrite.
- Existing restaurant photos, logos, menu photos, team portraits, and live records are used wherever available. Empty states replace unavailable data; no fabricated operational metrics or camera feeds are added.
- Tenant branding remains restaurant-scoped, but the product shell follows the approved white-sidebar system. Super Admin keeps QuickServe platform branding.
- The unfinished reliability work already present in My Work and Shifts will be preserved and completed only where required for coherent page interactions.

## Implementation

### 1. Establish one authoritative design system

- Replace the current stack of competing master/rebrand CSS imports with one final product layer on top of the Tailwind semantic tokens.
- Define the approved warm canvas, white surfaces/sidebar, deep charcoal text, vivid orange actions, semantic status colors, 12–16px radii, restrained shadows, spacing, and responsive breakpoints.
- Refactor the existing shared primitives into the canonical system: page header, KPI, status chip, tabs, filter bar, responsive data view, timeline, status/photo panel, detail sheet, chart shell, form section, and loading/empty/error states.
- Normalize buttons, inputs, selects, dialogs, drawers, tables, calendars, charts, and touch targets without altering behavior.

### 2. Rebuild the application shells

- Authenticated tenant shell: 220px white desktop sidebar, warm topbar, restaurant switcher/search/context/notifications/profile, tablet drawer, and role-aware mobile bottom navigation.
- Super Admin shell: same visual family with platform-specific navigation and QuickServe identity.
- Frontline composition: compact role-specific navigation and operational emphasis without exposing management modules.
- Public guest shell: restaurant-branded, touch-first flow without authenticated chrome.
- Preserve restaurant logo aspect ratio, tenant colors, route guards, role capability filtering, live counters, offline banners, and RTL direction.

### 3. Migrate core operational pages

- Auth: responsive photo-led split screen using the existing restaurant image, current providers, password tools, errors, and session behavior.
- Dashboard/Home: restaurant media banner, real KPIs, operations status, activity, orders, reservations, team, revenue, and quick actions in a responsive 12-column composition.
- Orders: status workflow, filters, responsive table/cards, elapsed-time treatment, and adaptive order detail panel while preserving read/write permissions.
- Reservations, bookings, and waitlist: KPI summary, live schedule/timeline, waitlist, guest detail, deposits, messaging, and existing status actions.
- Floor/Tables: live status KPIs, floor canvas, zones where stored, selected-table detail, touch interactions, and mobile list fallback.
- Menu: categories, product list, availability, item editor, digital preview, and unchanged Standard/PDF/QR separation.
- Kitchen/KDS: station-aware lanes, operational KPIs, urgency, elapsed time, product imagery where available, and current mutations.
- Analytics: current filters and real calculations in responsive chart/table panels without clipping or invented insights.
- Team/Staff: KPIs, responsive staff data views, schedules/attendance/permissions sections, staff detail, and all existing account actions.

### 4. Migrate management, ERP, and Super Admin

- Restyle Back Office overview, inventory, procurement, receiving, suppliers, recipes, invoices, finance, and reports using shared filters, tables/cards, forms, status treatment, and detail panels.
- Restyle all Super Admin dashboard, restaurant management, tenant detail tabs, subscriptions, licenses, platform orders, analytics, audit, health, and settings routes.
- Keep all current queries, exports, forms, audit behavior, and restaurant scoping intact.

### 5. Migrate frontline, secondary, and public routes

- Frontline: manager, waiter, host, cashier, work, approvals, shifts, daily close, notifications, and devices receive role-specific compact layouts and large operational actions.
- Secondary authenticated routes: profile, integrations, campaigns, automations, HQ, guests, and all remaining management views inherit the same system.
- Public routes: restaurant menu, booking, waitlist, kiosk, order status, staff badge entry, contact, privacy, and terms become consistent, fast, touch-friendly branded experiences.

### 6. Responsive and accessibility pass

- Verify intentional desktop, tablet, and mobile compositions at 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844, and 360×800.
- Remove horizontal overflow; adapt tables to cards; check charts, calendars, menus, drawers, sheets, sticky controls, bottom navigation, safe areas, keyboard focus, labels, contrast, and RTL.
- Keep transitions restrained and honor reduced-motion preferences.

### 7. Validation and completion criteria

- Inspect every content route and add any missing unique title, description, Open Graph title/description, `og:type`, and Twitter card metadata without changing route behavior.
- Run route generation through the normal build pipeline, strict TypeScript, ESLint, contract tests, and production build; fix all regressions introduced by this redesign.
- Exercise representative authenticated tenant, frontline, Super Admin, and public flows in the browser at desktop/tablet/mobile widths, including English and Arabic.
- Final audit must show every route using the authoritative shells/tokens and no legacy dark sidebar or unmigrated visual layer remaining.

## Technical details

- Primary files: `src/styles.css`, the final master CSS layer, `src/routes/__root.tsx`, `src/routes/_authenticated/route.tsx`, `src/components/nav/AppHeader.tsx`, `src/components/nav/BottomNav.tsx`, `src/components/superadmin/SuperAdminLayout.tsx`, `src/components/tenant/TenantBrandShell.tsx`, `src/components/public/PublicGuestShell.tsx`, and `src/components/app/MasterPage.tsx`.
- Existing page components are refactored in place so their hooks, query keys, mutations, guards, and route URLs remain unchanged.
- New shared responsive data-view and shell primitives are introduced only where they reduce duplication across multiple existing pages.
- No database migration is planned for this visual redesign. If an existing page exposes a backend defect during verification, it will be reported separately rather than hidden with mock data.

## Delivery order

1. Design tokens and shells.
2. Core shared primitives.
3. Dashboard, Orders, Reservations, Tables, Menu, Kitchen, Analytics, Team.
4. ERP and Super Admin.
5. Frontline and secondary authenticated routes.
6. Public/guest routes.
7. Full responsive, RTL, metadata, and regression verification.
