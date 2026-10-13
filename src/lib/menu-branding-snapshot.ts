import type { RestaurantAppearance } from "./restaurant-appearance";

/** Merge only fields editable in the branding studio into the latest persisted theme. */
export function mergeMenuBrandingTheme(current: unknown, edited: RestaurantAppearance) {
  const theme =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  const workspace =
    theme.workspace && typeof theme.workspace === "object" && !Array.isArray(theme.workspace)
      ? (theme.workspace as Record<string, unknown>)
      : {};
  return {
    ...theme,
    workspace: {
      ...workspace,
      guestMenuMode: edited.guestMenuMode,
      guestMenuLight: edited.guestMenuLight,
      guestMenuDark: edited.guestMenuDark,
      homeTitle: edited.homeTitle,
      dashboardTitle: edited.dashboardTitle,
      menuMode: edited.menuMode,
    },
  };
}
