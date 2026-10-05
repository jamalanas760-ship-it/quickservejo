<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## QuickServe interaction hierarchy

QuickServe should feel complete without looking busy. Preserve every capability, but expose it progressively.

- Keep one obvious primary action visible per page header, panel, card, or detail surface whenever possible.
- Keep no more than two visible action controls in one action cluster. When there are three or more, keep the primary action visible and move the rest into `ActionMenu`, a contextual menu, sheet, or drawer.
- Row and card actions should normally use one compact More menu. A direct row button is reserved for the single most common state-changing action.
- Destructive actions are never primary. Put delete/cancel/archive actions in a secondary menu or confirmation flow and visually separate them from routine actions.
- Tabs, segmented view switches, status filters, and navigation are not actions. Keep them directly available, but prefer horizontal scrolling or compact controls on mobile instead of wrapping many rows.
- Search and filters should form one compact toolbar. Avoid several separate filter buttons that open equivalent controls.
- On mobile, prevent action-button wrapping. Use one primary button plus a 44px-or-larger More control, or use a bottom sheet for secondary actions.
- Keep all touch targets at least 44px where practical and preserve keyboard/focus/ARIA behavior.
- Do not remove functionality to make a page look simpler. Use progressive disclosure: primary action -> contextual More -> advanced settings/details.
- New pages should reuse `MasterPageHeader`, `MasterActionSurface`, and `ActionMenu` rather than inventing dense bespoke action bars.
