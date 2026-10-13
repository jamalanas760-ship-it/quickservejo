export const DEFAULT_MENU_IMAGES = {
  standard: "/images/menu-standard-default-v1.webp",
  pdf: "/images/menu-pdf-default-v1.webp",
} as const;

/** Display fallback only; never write defaults into Workspace Interface settings. */
export function menuCardImage(mode: keyof typeof DEFAULT_MENU_IMAGES, configured: string | null) {
  return configured?.trim() || DEFAULT_MENU_IMAGES[mode];
}
