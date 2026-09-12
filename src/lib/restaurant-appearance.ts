export type RestaurantAppearance = {
  menuMode: "pdf" | "products";
  menuLogo: string | null;
  homeTitle: string;
  dashboardTitle: string;
};
export function readAppearance(theme: unknown): RestaurantAppearance {
  const raw = theme && typeof theme === "object" ? (theme as Record<string, unknown>).workspace : null;
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    menuMode: value.menuMode === "products" ? "products" : "pdf",
    menuLogo: typeof value.menuLogo === "string" && /^https:\/\//.test(value.menuLogo) ? value.menuLogo : null,
    homeTitle: typeof value.homeTitle === "string" ? value.homeTitle.slice(0, 100) : "",
    dashboardTitle: typeof value.dashboardTitle === "string" ? value.dashboardTitle.slice(0, 100) : "",
  };
}
