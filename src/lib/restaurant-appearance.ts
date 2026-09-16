export type GuestMenuPalette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  accent: string;
};

export type RestaurantAppearance = {
  menuMode: "pdf" | "products";
  menuLogo: string | null;
  homeTitle: string;
  dashboardTitle: string;
  lightBackground: string;
  darkBackground: string;
  topNavBackground: string;
  topNavForeground: string;
  sidebarBackground: string;
  sidebarForeground: string;
  guestMenuMode: "light" | "dark";
  guestMenuLight: GuestMenuPalette;
  guestMenuDark: GuestMenuPalette;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const LIGHT_DEFAULTS: GuestMenuPalette = {
  bg: "#f7f8fa",
  surface: "#ffffff",
  text: "#14181c",
  muted: "#6b7280",
  primary: "#ff5a0a",
  primaryText: "#ffffff",
  accent: "#ff8a3d",
};
const DARK_DEFAULTS: GuestMenuPalette = {
  bg: "#101418",
  surface: "#181e23",
  text: "#f7f8f9",
  muted: "#9aa4ad",
  primary: "#ff6a1a",
  primaryText: "#ffffff",
  accent: "#ff9a5b",
};

function color(value: unknown, fallback: string) {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

function palette(value: unknown, fallback: GuestMenuPalette): GuestMenuPalette {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    bg: color(source.bg, fallback.bg),
    surface: color(source.surface, fallback.surface),
    text: color(source.text, fallback.text),
    muted: color(source.muted, fallback.muted),
    primary: color(source.primary, fallback.primary),
    primaryText: color(source.primaryText, fallback.primaryText),
    accent: color(source.accent, fallback.accent),
  };
}

export function readAppearance(theme: unknown): RestaurantAppearance {
  const raw = theme && typeof theme === "object" ? (theme as Record<string, unknown>).workspace : null;
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    menuMode: value.menuMode === "products" ? "products" : "pdf",
    menuLogo: typeof value.menuLogo === "string" && /^https:\/\//.test(value.menuLogo) ? value.menuLogo : null,
    homeTitle: typeof value.homeTitle === "string" ? value.homeTitle.slice(0, 100) : "",
    dashboardTitle: typeof value.dashboardTitle === "string" ? value.dashboardTitle.slice(0, 100) : "",
    lightBackground: color(value.lightBackground, "#ffffff"),
    darkBackground: color(value.darkBackground, "#11171b"),
    topNavBackground: color(value.topNavBackground, "#ffffff"),
    topNavForeground: color(value.topNavForeground, "#14181c"),
    sidebarBackground: color(value.sidebarBackground, "#ffffff"),
    sidebarForeground: color(value.sidebarForeground, "#14181c"),
    guestMenuMode: value.guestMenuMode === "dark" ? "dark" : "light",
    guestMenuLight: palette(value.guestMenuLight, LIGHT_DEFAULTS),
    guestMenuDark: palette(value.guestMenuDark, DARK_DEFAULTS),
  };
}

export const guestMenuPaletteDefaults = {
  light: LIGHT_DEFAULTS,
  dark: DARK_DEFAULTS,
} as const;
