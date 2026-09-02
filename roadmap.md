# QuickServe — production pass roadmap

## 1. Live menu bridge (designer → diner)
- [x] `src/lib/menu-theme-bridge.ts` exists: v1 payload with `restaurantId`, `theme` (+`composition`), `source`, `updatedAt`; strict same-origin `postMessage` + `BroadcastChannel` fallback.
- [x] `UnifiedMenuStudio` opens `/r/:slug` in a named window, posts on open and on every `theme`/`composition` change, and re-posts on save.
- [ ] Diner route `src/routes/r/$slug.tsx` does NOT yet listen for the bridge message. Add a listener that validates `event.origin === window.location.origin`, checks `isMenuThemeBridgeMessage`, matches `restaurantId`, and writes the theme into the `["diner", slug, token]` React Query cache via `queryClient.setQueryData` so layout/type/colors/imagery update with no reload.
- [ ] Mirror the same listener for `BroadcastChannel(MENU_THEME_CHANNEL)`.
- [ ] While in preview mode, suppress order/waiter mutations.

## 2. Menu design studio — real preview
- [ ] Replace the abstract `SmartCompositionCanvas` blocks in the preview with the real diner renderer primitives (`MenuHero`, `SectionHeading`, `PriceLine`, `TextureLayer`, `itemsContainerClass`, `itemVariant`) so the preview is the same design graph as the published menu.
- [ ] Preview data: real restaurant name/logo/currency, real categories, real item names/descriptions/prices/images (studio query currently fetches items but not categories/logo — extend it).
- [ ] Keep portrait proportion, iPhone frame, Desktop/Tablet/iPhone segmented control, zoom, desktop split view; make the menu scroll inside the device frame.
- [ ] Fallback path when AI is unavailable must still render real restaurant data.
- [ ] Arabic: real RTL + Arabic typography in the preview frame.
- [ ] Consolidate the redundant designer components (`MasterMenuDesigner*`, `UltimateMenuDesigner`, `SmartMenuStudio`, `AIStudioMenuDesigner`, `CanvaAdobeMenuStudio`, `StudioMenuDesigner`) down to the unified studio; point the super-admin design route at it too.

## 3. Profile + restaurant workspace + navigation
- [ ] Rebuild `src/routes/_authenticated/profile.tsx` to the mockup direction (premium, dense, rounded surfaces, subtle shadows).
- [ ] Polish the restaurant workspace shell (`manage/$restaurantId/route.tsx`, `index.tsx`) and menu management for one consistent product feel.
- [ ] Bottom nav: safe-area padding, no content overlap, clear active state, desktop nav untouched, no horizontal overflow.

## 4. Kitchen operational flow
- [ ] Enforce Received → Accepted → Preparing → Ready → Served, each transition persisted to `orders.status` + `order_status_events`.
- [ ] Per-stage timestamps and elapsed duration on each ticket.
- [ ] Chef/staff assignment + assignment timestamp visible on the ticket.
- [ ] Status history log obvious per ticket.
- [ ] Sound alerts for new orders and meaningful stage changes, respecting audio unlock + saved preference.
- [ ] Keep Supabase realtime; preserve cancellation rules and role permissions.

## 5. Publish + verify
- [ ] `bunx tsgo --noEmit -p tsconfig.json`, `bun run lint`, `bun run build`.
- [ ] Browser-verify `/r/:slug` + designer bridge together.
- [ ] Publish to lovable.app and report the production URL.
