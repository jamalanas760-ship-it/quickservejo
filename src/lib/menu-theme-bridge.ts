/**
 * Versioned designer <-> diner bridge.
 * Uses postMessage for an explicitly opened live-menu window and BroadcastChannel
 * for same-origin tabs. The payload is JSON-safe and intentionally small.
 */
import type { MenuTheme } from "./menu-theme";

export const MENU_THEME_BRIDGE_VERSION = 1 as const;
export const MENU_THEME_BRIDGE_TYPE = "quickserve:menu-theme" as const;
export const MENU_THEME_CHANNEL = "quickserve-menu-theme";

export type MenuThemeBridgeMessage = {
  type: typeof MENU_THEME_BRIDGE_TYPE;
  version: typeof MENU_THEME_BRIDGE_VERSION;
  restaurantId: string;
  theme: MenuTheme & { composition?: unknown };
  source: "designer";
  updatedAt: string;
};

export function createMenuThemeBridgeMessage(
  restaurantId: string,
  theme: MenuTheme & { composition?: unknown },
): MenuThemeBridgeMessage {
  return {
    type: MENU_THEME_BRIDGE_TYPE,
    version: MENU_THEME_BRIDGE_VERSION,
    restaurantId,
    theme,
    source: "designer",
    updatedAt: new Date().toISOString(),
  };
}

export function isMenuThemeBridgeMessage(value: unknown): value is MenuThemeBridgeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<MenuThemeBridgeMessage>;
  return (
    message.type === MENU_THEME_BRIDGE_TYPE &&
    message.version === MENU_THEME_BRIDGE_VERSION &&
    typeof message.restaurantId === "string" &&
    Boolean(message.theme) &&
    message.source === "designer"
  );
}

export function publishMenuThemeBridge(
  restaurantId: string,
  theme: MenuTheme & { composition?: unknown },
  target?: Window | null,
) {
  if (typeof window === "undefined") return;
  const message = createMenuThemeBridgeMessage(restaurantId, theme);
  if (target && !target.closed) {
    target.postMessage(message, window.location.origin);
  }
  try {
    const channel = new BroadcastChannel(MENU_THEME_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel is optional; postMessage remains the primary bridge.
  }
}
