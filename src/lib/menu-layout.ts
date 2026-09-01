/**
 * Structural layout engine for themed menus.
 *
 * A template is more than colours: each layout id describes a genuinely
 * different *arrangement* of the item list — editorial spotlights, bento
 * mosaics, receipt tickets, full-bleed galleries, horizontal rails — and both
 * the public menu and the studio preview render through these helpers so the
 * structure always matches.
 */
import type { MenuTheme } from "./menu-theme";

/** How a single item card is composed. */
export type ItemVariant = "row" | "stacked" | "printed" | "overlay";

/** Horizontal scroll rail instead of a wrapping grid. */
export function isRail(theme: MenuTheme) {
  return theme.layout === "rail";
}

/** Numbered receipt-style rows (no cards). */
export function isTicket(theme: MenuTheme) {
  return theme.layout === "ticket";
}

/** Container classes for the item collection of one category. */
export function itemsContainerClass(theme: MenuTheme): string {
  const two = theme.columns === 2;
  switch (theme.layout) {
    case "grid":
      return two ? "grid grid-cols-2 sm:grid-cols-3" : "grid grid-cols-1 sm:grid-cols-3";
    case "magazine":
      return "grid grid-cols-1 sm:grid-cols-2";
    case "columns":
      return two ? "grid grid-cols-2" : "grid grid-cols-1 sm:grid-cols-2";
    case "gallery":
      return two ? "grid grid-cols-2" : "grid grid-cols-1 sm:grid-cols-2";
    case "mosaic":
      return "grid grid-cols-2 sm:grid-cols-4";
    case "duo":
      // Facing-page bill of fare: two printed columns of dotted-leader rows.
      return "grid grid-cols-1 sm:grid-cols-2 sm:gap-x-10";
    case "triptych":
      // Broadsheet: three narrow editorial columns on tablet and up.
      return "grid grid-cols-1 sm:grid-cols-3 sm:gap-x-8";
    case "panel":
      // Main list plus a tinted feature panel for the last third of the items.
      return "grid grid-cols-1 sm:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] sm:gap-x-8";
    case "spotlight":
      return "grid grid-cols-1";
    case "rail":
      return "no-scrollbar flex snap-x snap-mandatory overflow-x-auto pb-1";
    case "ticket":
      return "grid grid-cols-1";
    case "list":
    default:
      return "grid grid-cols-1";
  }
}

/** Per-item variant — layouts may mix variants by position. */
export function itemVariant(theme: MenuTheme, index: number): ItemVariant {
  switch (theme.layout) {
    case "grid":
    case "magazine":
    case "mosaic":
    case "rail":
      return "stacked";
    case "gallery":
      return "overlay";
    case "columns":
    case "ticket":
    case "duo":
    case "triptych":
      return "printed";
    case "panel":
      // Every third dish becomes the panel's feature card.
      return index % 3 === 2 ? "stacked" : "printed";
    case "spotlight":
      // First dish of every section is the editorial hero, the rest are rows.
      return index === 0 ? "stacked" : "row";
    case "list":
    default:
      return "row";
  }
}

/** Grid span / rail sizing for a given position. */
export function itemSpanClass(theme: MenuTheme, index: number): string {
  if (theme.layout === "mosaic") {
    // 4-col bento on tablet+: hero, tall, pair, wide — repeating rhythm.
    const cycle = index % 5;
    if (cycle === 0) return "col-span-2 sm:col-span-2 sm:row-span-2";
    if (cycle === 3) return "col-span-2 sm:col-span-2";
    return "col-span-1";
  }
  if (theme.layout === "rail") return "w-[70%] shrink-0 snap-start sm:w-[45%]";
  if (theme.layout === "panel" && index % 3 !== 2) return "sm:col-start-1";
  if (theme.layout === "panel") return "sm:col-start-2";
  return "";
}

/** Image sizing per variant, scaled for the compact studio preview. */
export function itemImageClass(
  theme: MenuTheme,
  variant: ItemVariant,
  index: number,
  compact?: boolean,
): string {
  if (variant === "overlay") return "absolute inset-0 size-full";
  if (variant === "printed") return compact ? "size-10 shrink-0" : "size-14 shrink-0";
  if (variant === "row") return compact ? "size-14 shrink-0" : "size-20 shrink-0";
  // stacked
  const tall =
    theme.layout === "magazine" ||
    theme.layout === "spotlight" ||
    (theme.layout === "mosaic" && index % 5 === 0);
  if (compact) return tall ? "mb-1.5 h-24 w-full" : "mb-1.5 h-20 w-full";
  return tall ? "mb-2 h-44 w-full" : "mb-2 h-28 w-full";
}
