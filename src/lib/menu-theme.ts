/**
 * Menu design system for tenant-facing (diner) menus.
 *
 * A theme is stored on `restaurants.menu_theme` as JSON so every restaurant can
 * have its own template, palette, typography and layout without code changes.
 */

export type TemplateId =
  | "classic"
  | "midnight"
  | "street"
  | "cafe"
  | "bold"
  | "chalkboard"
  | "sketch"
  | "bifold"
  | "editorial"
  | "breakfast"
  | "bakery";
export type FontId = "sans" | "serif" | "rounded" | "mono" | "display" | "condensed" | "script";
export type LayoutId = "list" | "grid" | "magazine" | "columns";
export type HeroId =
  | "cover"
  | "gradient"
  | "minimal"
  | "chalk"
  | "stamp"
  | "ribbon"
  | "blob"
  | "sidebar";
export type ImageShape = "rounded" | "circle" | "square";
export type ButtonStyleId = "solid" | "pill" | "soft" | "outline";
export type CardStyleId = "flat" | "elevated" | "outline" | "glass";
export type BgStyleId = "solid" | "gradient" | "dots" | "glow";
export type DensityId = "compact" | "comfortable" | "airy";
export type AnimationId = "none" | "fade" | "rise" | "pop" | "slide";
/** Paper / surface texture layered over the page background. */
export type TextureId = "none" | "chalk" | "paper" | "grain";
/** Decorative illustration band drawn with thin line art. */
export type DecorId = "none" | "veg" | "fastfood" | "bakery" | "shapes";
/** How each category block is framed. */
export type SectionStyleId = "plain" | "boxed" | "rule" | "tab" | "ribbon";
/** How prices sit relative to the item name. */
export type PriceStyleId = "inline" | "right" | "leader";

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
  /** Entrance motion applied to menu item cards. */
  animation: AnimationId;
  texture: TextureId;
  decor: DecorId;
  sectionStyle: SectionStyleId;
  priceStyle: PriceStyleId;
  /** Number of item columns on phones (1 or 2). */
  columns: 1 | 2;
  /** Uppercase, letter-spaced section + hero titles. */
  upperTitles: boolean;
  /** Script/handwritten accent word under the hero title. */
  scriptAccent: boolean;
  /** Short script line rendered under the restaurant name. */
  tagline: string;
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
      animation: "rise",
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
      animation: "fade",
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
      animation: "pop",
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
      animation: "fade",
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
      animation: "slide",
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
    animation: oneOf<AnimationId>(
      input["animation"],
      ["none", "fade", "rise", "pop", "slide"],
      base.animation,
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

export const BUTTON_STYLE_LABELS: Record<ButtonStyleId, { en: string; ar: string }> = {
  solid: { en: "Solid", ar: "صلب" },
  pill: { en: "Pill", ar: "كبسولة" },
  soft: { en: "Soft tint", ar: "تدرّج ناعم" },
  outline: { en: "Outline", ar: "محدد" },
};

export const CARD_STYLE_LABELS: Record<CardStyleId, { en: string; ar: string }> = {
  flat: { en: "Flat", ar: "مسطح" },
  elevated: { en: "Elevated", ar: "بارز" },
  outline: { en: "Outlined", ar: "بإطار" },
  glass: { en: "Glass", ar: "زجاجي" },
};

export const BG_STYLE_LABELS: Record<BgStyleId, { en: string; ar: string }> = {
  solid: { en: "Solid colour", ar: "لون واحد" },
  gradient: { en: "Soft gradient", ar: "تدرّج هادئ" },
  dots: { en: "Dot pattern", ar: "نقشة نقاط" },
  glow: { en: "Ambient glow", ar: "توهّج محيط" },
};

export const DENSITY_LABELS: Record<DensityId, { en: string; ar: string }> = {
  compact: { en: "Compact", ar: "مضغوط" },
  comfortable: { en: "Comfortable", ar: "مريح" },
  airy: { en: "Airy", ar: "فسيح" },
};

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

/** Page background for the diner menu, derived from the theme's background style. */
export function pageBackground(theme: MenuTheme): React.CSSProperties {
  if (theme.bgStyle === "gradient") {
    return {
      backgroundColor: theme.bg,
      backgroundImage: `linear-gradient(170deg, ${hexAlpha(theme.accent, 0.16)} 0%, ${hexAlpha(theme.bg, 0)} 45%), linear-gradient(20deg, ${hexAlpha(theme.primary, 0.12)} 0%, ${hexAlpha(theme.bg, 0)} 55%)`,
    };
  }
  if (theme.bgStyle === "dots") {
    return {
      backgroundColor: theme.bg,
      backgroundImage: `radial-gradient(${hexAlpha(theme.muted, 0.28)} 1px, transparent 1.2px)`,
      backgroundSize: "18px 18px",
    };
  }
  if (theme.bgStyle === "glow") {
    return {
      backgroundColor: theme.bg,
      backgroundImage: `radial-gradient(120% 60% at 50% -10%, ${hexAlpha(theme.primary, 0.35)} 0%, ${hexAlpha(theme.bg, 0)} 70%), radial-gradient(80% 50% at 100% 20%, ${hexAlpha(theme.accent, 0.22)} 0%, ${hexAlpha(theme.bg, 0)} 70%)`,
    };
  }
  return { backgroundColor: theme.bg };
}

/** Card / panel surface styling for the diner menu. */
export function surfaceStyle(theme: MenuTheme): React.CSSProperties {
  const base: React.CSSProperties = {
    background: theme.surface,
    borderRadius: `${theme.radius}px`,
    transition: "transform .18s ease, box-shadow .18s ease",
  };
  if (theme.cardStyle === "elevated") {
    return { ...base, boxShadow: `0 10px 30px -18px ${hexAlpha(theme.text, 0.55)}` };
  }
  if (theme.cardStyle === "outline") {
    return { ...base, border: `1px solid ${hexAlpha(theme.muted, 0.4)}` };
  }
  if (theme.cardStyle === "glass") {
    return {
      ...base,
      background: hexAlpha(theme.surface, 0.62),
      border: `1px solid ${hexAlpha(theme.text, 0.12)}`,
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    } as React.CSSProperties;
  }
  return base;
}

/** Button / chip styling. `active` false renders the quiet variant. */
export function buttonStyle(theme: MenuTheme, active = true): React.CSSProperties {
  const radius =
    theme.buttonStyle === "pill" ? "999px" : `${Math.max(6, theme.radius)}px`;
  if (!active) {
    return {
      borderRadius: radius,
      background: theme.cardStyle === "glass" ? hexAlpha(theme.surface, 0.6) : theme.surface,
      color: theme.muted,
      border: `1px solid ${hexAlpha(theme.muted, 0.28)}`,
    };
  }
  if (theme.buttonStyle === "outline") {
    return {
      borderRadius: radius,
      background: "transparent",
      color: theme.primary,
      border: `1.5px solid ${theme.primary}`,
    };
  }
  if (theme.buttonStyle === "soft") {
    return {
      borderRadius: radius,
      background: hexAlpha(theme.primary, 0.16),
      color: theme.primary,
      border: `1px solid ${hexAlpha(theme.primary, 0.28)}`,
    };
  }
  return {
    borderRadius: radius,
    background: theme.primary,
    color: theme.primaryText,
    border: "none",
    boxShadow: `0 8px 20px -12px ${hexAlpha(theme.primary, 0.9)}`,
  };
}

export function densityGap(theme: MenuTheme): string {
  if (theme.density === "compact") return "0.5rem";
  if (theme.density === "airy") return "1.25rem";
  return "0.75rem";
}

export function densityPadding(theme: MenuTheme): string {
  if (theme.density === "compact") return "0.625rem";
  if (theme.density === "airy") return "1.125rem";
  return "0.875rem";
}

export const ANIMATION_LABELS: Record<AnimationId, { en: string; ar: string }> = {
  none: { en: "None", ar: "بدون" },
  fade: { en: "Soft fade", ar: "تلاشٍ ناعم" },
  rise: { en: "Rise up", ar: "صعود" },
  pop: { en: "Pop in", ar: "ظهور نابض" },
  slide: { en: "Slide in", ar: "انسياب" },
};

/** Entrance animation class + staggered delay for a menu item card. */
export function itemMotion(
  theme: MenuTheme,
  index: number,
): { className: string; style: React.CSSProperties } {
  if (theme.animation === "none") return { className: "", style: {} };
  return {
    className: `qs-anim qs-anim-${theme.animation}`,
    style: { animationDelay: `${Math.min(index, 12) * 45}ms` },
  };
}
