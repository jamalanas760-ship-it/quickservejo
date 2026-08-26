/**
 * Menu design system for tenant-facing (diner) menus.
 *
 * A theme is stored on `restaurants.menu_theme` as JSON so every restaurant can
 * have its own template, palette, typography and layout without code changes.
 */

export type TemplateId = "classic" | "midnight" | "street" | "cafe" | "bold";
export type FontId = "sans" | "serif" | "rounded" | "mono" | "display";
export type LayoutId = "list" | "grid" | "magazine";
export type HeroId = "cover" | "gradient" | "minimal";
export type ImageShape = "rounded" | "circle" | "square";
export type ButtonStyleId = "solid" | "pill" | "soft" | "outline";
export type CardStyleId = "flat" | "elevated" | "outline" | "glass";
export type BgStyleId = "solid" | "gradient" | "dots" | "glow";
export type DensityId = "compact" | "comfortable" | "airy";

export type MenuTheme = {
  template: TemplateId;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  accent: string;
  bodyFont: FontId;
  headingFont: FontId;
  layout: LayoutId;
  hero: HeroId;
  radius: number;
  showImages: boolean;
  imageShape: ImageShape;
  showIcons: boolean;
  buttonStyle: ButtonStyleId;
  cardStyle: CardStyleId;
  bgStyle: BgStyleId;
  density: DensityId;
};

export const FONT_STACKS: Record<FontId, string> = {
  sans: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  rounded: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  display: "'Palatino Linotype', 'Book Antiqua', Georgia, serif",
};

export const FONT_LABELS: Record<FontId, { en: string; ar: string }> = {
  sans: { en: "Modern sans", ar: "سانس حديث" },
  serif: { en: "Editorial serif", ar: "سيريف كلاسيكي" },
  rounded: { en: "Friendly rounded", ar: "مستدير ودود" },
  mono: { en: "Technical mono", ar: "مونو تقني" },
  display: { en: "Elegant display", ar: "عرض أنيق" },
};

export const LAYOUT_LABELS: Record<LayoutId, { en: string; ar: string }> = {
  list: { en: "Photo list", ar: "قائمة بالصور" },
  grid: { en: "Card grid", ar: "شبكة بطاقات" },
  magazine: { en: "Magazine", ar: "مجلة" },
};

export const HERO_LABELS: Record<HeroId, { en: string; ar: string }> = {
  cover: { en: "Cover photo", ar: "صورة غلاف" },
  gradient: { en: "Colour gradient", ar: "تدرّج لوني" },
  minimal: { en: "Minimal bar", ar: "شريط بسيط" },
};

export const TEMPLATES: Record<TemplateId, { label: { en: string; ar: string }; theme: MenuTheme }> = {
  classic: {
    label: { en: "Classic light", ar: "كلاسيكي فاتح" },
    theme: {
      template: "classic",
      bg: "#f6f5f2",
      surface: "#ffffff",
      text: "#1f2421",
      muted: "#7c7a74",
      primary: "#2c2a26",
      primaryText: "#ffffff",
      accent: "#d9a441",
      bodyFont: "sans",
      headingFont: "sans",
      layout: "list",
      hero: "cover",
      radius: 16,
      showImages: true,
      imageShape: "rounded",
      showIcons: true,
      buttonStyle: "pill",
      cardStyle: "elevated",
      bgStyle: "solid",
      density: "comfortable",
    },
  },
  midnight: {
    label: { en: "Midnight luxe", ar: "فخامة ليلية" },
    theme: {
      template: "midnight",
      bg: "#0e0f12",
      surface: "#181a1f",
      text: "#f4f1ea",
      muted: "#9a9689",
      primary: "#e0b168",
      primaryText: "#141313",
      accent: "#e0b168",
      bodyFont: "serif",
      headingFont: "display",
      layout: "magazine",
      hero: "gradient",
      radius: 6,
      showImages: true,
      imageShape: "square",
      showIcons: false,
      buttonStyle: "outline",
      cardStyle: "outline",
      bgStyle: "glow",
      density: "airy",
    },
  },
  street: {
    label: { en: "Street food", ar: "أكل الشارع" },
    theme: {
      template: "street",
      bg: "#fffdf5",
      surface: "#ffffff",
      text: "#1b1b1b",
      muted: "#6f6a5f",
      primary: "#e23b2e",
      primaryText: "#ffffff",
      accent: "#ffb703",
      bodyFont: "rounded",
      headingFont: "rounded",
      layout: "grid",
      hero: "cover",
      radius: 22,
      showImages: true,
      imageShape: "rounded",
      showIcons: true,
      buttonStyle: "pill",
      cardStyle: "elevated",
      bgStyle: "dots",
      density: "comfortable",
    },
  },
  cafe: {
    label: { en: "Calm café", ar: "مقهى هادئ" },
    theme: {
      template: "cafe",
      bg: "#f3f1ec",
      surface: "#fbfaf7",
      text: "#33302b",
      muted: "#87817a",
      primary: "#5f7a61",
      primaryText: "#ffffff",
      accent: "#c78b60",
      bodyFont: "serif",
      headingFont: "serif",
      layout: "list",
      hero: "minimal",
      radius: 12,
      showImages: true,
      imageShape: "circle",
      showIcons: true,
      buttonStyle: "soft",
      cardStyle: "flat",
      bgStyle: "gradient",
      density: "airy",
    },
  },
  bold: {
    label: { en: "Bold grid", ar: "شبكة جسورة" },
    theme: {
      template: "bold",
      bg: "#111827",
      surface: "#1f2937",
      text: "#f9fafb",
      muted: "#9ca3af",
      primary: "#22d3ee",
      primaryText: "#06232a",
      accent: "#f472b6",
      bodyFont: "mono",
      headingFont: "sans",
      layout: "grid",
      hero: "gradient",
      radius: 4,
      showImages: true,
      imageShape: "square",
      showIcons: true,
      buttonStyle: "solid",
      cardStyle: "glass",
      bgStyle: "glow",
      density: "compact",
    },
  },
};

export const DEFAULT_THEME: MenuTheme = TEMPLATES.classic.theme;

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Normalizes anything stored in the database into a complete, safe theme. */
export function parseMenuTheme(raw: unknown): MenuTheme {
  const input = (raw ?? {}) as Record<string, unknown>;
  const template = oneOf<TemplateId>(
    input["template"],
    ["classic", "midnight", "street", "cafe", "bold"],
    "classic",
  );
  const base = TEMPLATES[template].theme;
  const fonts: FontId[] = ["sans", "serif", "rounded", "mono", "display"];
  const radius = Number(input["radius"]);
  return {
    template,
    bg: color(input["bg"], base.bg),
    surface: color(input["surface"], base.surface),
    text: color(input["text"], base.text),
    muted: color(input["muted"], base.muted),
    primary: color(input["primary"], base.primary),
    primaryText: color(input["primaryText"], base.primaryText),
    accent: color(input["accent"], base.accent),
    bodyFont: oneOf<FontId>(input["bodyFont"], fonts, base.bodyFont),
    headingFont: oneOf<FontId>(input["headingFont"], fonts, base.headingFont),
    layout: oneOf<LayoutId>(input["layout"], ["list", "grid", "magazine"], base.layout),
    hero: oneOf<HeroId>(input["hero"], ["cover", "gradient", "minimal"], base.hero),
    radius: Number.isFinite(radius) ? Math.min(32, Math.max(0, radius)) : base.radius,
    showImages: typeof input["showImages"] === "boolean" ? input["showImages"] : base.showImages,
    imageShape: oneOf<ImageShape>(
      input["imageShape"],
      ["rounded", "circle", "square"],
      base.imageShape,
    ),
    showIcons: typeof input["showIcons"] === "boolean" ? input["showIcons"] : base.showIcons,
    buttonStyle: oneOf<ButtonStyleId>(
      input["buttonStyle"],
      ["solid", "pill", "soft", "outline"],
      base.buttonStyle,
    ),
    cardStyle: oneOf<CardStyleId>(
      input["cardStyle"],
      ["flat", "elevated", "outline", "glass"],
      base.cardStyle,
    ),
    bgStyle: oneOf<BgStyleId>(input["bgStyle"], ["solid", "gradient", "dots", "glow"], base.bgStyle),
    density: oneOf<DensityId>(
      input["density"],
      ["compact", "comfortable", "airy"],
      base.density,
    ),
  };
}

/** CSS custom properties consumed by the diner menu and its live preview. */
export function themeVars(theme: MenuTheme): React.CSSProperties {
  return {
    "--qs-bg": theme.bg,
    "--qs-surface": theme.surface,
    "--qs-text": theme.text,
    "--qs-muted": theme.muted,
    "--qs-primary": theme.primary,
    "--qs-primary-text": theme.primaryText,
    "--qs-accent": theme.accent,
    "--qs-radius": `${theme.radius}px`,
    "--qs-body-font": FONT_STACKS[theme.bodyFont],
    "--qs-heading-font": FONT_STACKS[theme.headingFont],
  } as React.CSSProperties;
}

export function imageShapeClass(theme: MenuTheme): string {
  if (theme.imageShape === "circle") return "rounded-full";
  if (theme.imageShape === "square") return "rounded-none";
  return "rounded-xl";
}
