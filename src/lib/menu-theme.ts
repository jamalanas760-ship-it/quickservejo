/**
 * Menu design system for tenant-facing (diner) menus.
 *
 * A theme is stored on `restaurants.menu_theme` as JSON so every restaurant can
 * have its own template, palette, typography, decoration and layout without
 * code changes.
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
  | "bakery"
  | "poster"
  | "coffeehouse"
  | "emerald"
  | "script"
  | "retro"
  | "brush"
  | "nautical"
  | "ornate"
  | "tiles"
  | "wellness";
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
/** Decorative thin line-art band drawn at the foot of the menu. */
export type DecorId =
  | "none"
  | "veg"
  | "fastfood"
  | "bakery"
  | "shapes"
  | "ornate"
  | "coffee"
  | "seafood";
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
  /** Short line rendered under the restaurant name in the hero. */
  tagline: string;
};

export const FONT_STACKS: Record<FontId, string> = {
  sans: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
  rounded: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  display: "'Palatino Linotype', 'Book Antiqua', Georgia, serif",
  condensed:
    "'Haettenschweiler', 'Arial Narrow', 'Oswald', 'Impact', ui-sans-serif, system-ui, sans-serif",
  script: "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive",
};

export const FONT_LABELS: Record<FontId, { en: string; ar: string }> = {
  sans: { en: "Modern sans", ar: "سانس حديث" },
  serif: { en: "Editorial serif", ar: "سيريف كلاسيكي" },
  rounded: { en: "Friendly rounded", ar: "مستدير ودود" },
  mono: { en: "Technical mono", ar: "مونو تقني" },
  display: { en: "Elegant display", ar: "عرض أنيق" },
  condensed: { en: "Bold condensed", ar: "عريض مضغوط" },
  script: { en: "Handwritten script", ar: "خط يدوي" },
};

export const LAYOUT_LABELS: Record<LayoutId, { en: string; ar: string }> = {
  list: { en: "Photo list", ar: "قائمة بالصور" },
  grid: { en: "Card grid", ar: "شبكة بطاقات" },
  magazine: { en: "Magazine", ar: "مجلة" },
  columns: { en: "Printed columns", ar: "أعمدة مطبوعة" },
};

export const HERO_LABELS: Record<HeroId, { en: string; ar: string }> = {
  cover: { en: "Cover photo", ar: "صورة غلاف" },
  gradient: { en: "Colour gradient", ar: "تدرّج لوني" },
  minimal: { en: "Minimal bar", ar: "شريط بسيط" },
  chalk: { en: "Chalkboard title", ar: "عنوان سبورة" },
  stamp: { en: "Sketch stamp", ar: "طابع مرسوم" },
  ribbon: { en: "Editorial ribbon", ar: "شريط تحريري" },
  blob: { en: "Colour blob", ar: "كتلة لونية" },
  sidebar: { en: "Vertical wordmark", ar: "شعار عمودي" },
};

export const TEXTURE_LABELS: Record<TextureId, { en: string; ar: string }> = {
  none: { en: "Clean", ar: "نظيف" },
  chalk: { en: "Chalk dust", ar: "غبار طباشير" },
  paper: { en: "Kraft paper", ar: "ورق كرافت" },
  grain: { en: "Fine grain", ar: "حبيبات ناعمة" },
};

export const DECOR_LABELS: Record<DecorId, { en: string; ar: string }> = {
  none: { en: "No illustration", ar: "بدون رسوم" },
  veg: { en: "Herbs & vegetables", ar: "أعشاب وخضار" },
  fastfood: { en: "Fast-food sketches", ar: "رسومات وجبات سريعة" },
  bakery: { en: "Bakery line art", ar: "رسوم مخبوزات" },
  ornate: { en: "Ornate filigree", ar: "زخرفة كلاسيكية" },
  coffee: { en: "Coffee & pastry", ar: "قهوة ومعجنات" },
  seafood: { en: "Seafood engraving", ar: "نقوش بحرية" },
  shapes: { en: "Geometric shapes", ar: "أشكال هندسية" },
};

export const SECTION_STYLE_LABELS: Record<SectionStyleId, { en: string; ar: string }> = {
  plain: { en: "Plain heading", ar: "عنوان بسيط" },
  boxed: { en: "Bordered box", ar: "صندوق بإطار" },
  rule: { en: "Hairline rule", ar: "خط رفيع" },
  tab: { en: "Side tab", ar: "تبويب جانبي" },
  ribbon: { en: "Filled ribbon", ar: "شريط ملوّن" },
};

export const PRICE_STYLE_LABELS: Record<PriceStyleId, { en: string; ar: string }> = {
  inline: { en: "Under the name", ar: "تحت الاسم" },
  right: { en: "Aligned right", ar: "محاذاة لليمين" },
  leader: { en: "Dotted leaders", ar: "خطوط منقطة" },
};

type Extras = Pick<
  MenuTheme,
  "texture" | "decor" | "sectionStyle" | "priceStyle" | "columns" | "upperTitles" | "scriptAccent" | "tagline"
>;

const NEUTRAL_EXTRAS: Extras = {
  texture: "none",
  decor: "none",
  sectionStyle: "rule",
  priceStyle: "inline",
  columns: 1,
  upperTitles: false,
  scriptAccent: false,
  tagline: "",
};

export const TEMPLATES: Record<
  TemplateId,
  { label: { en: string; ar: string }; theme: MenuTheme }
> = {
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
      ...NEUTRAL_EXTRAS,
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
      ...NEUTRAL_EXTRAS,
      sectionStyle: "rule",
      upperTitles: true,
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
      ...NEUTRAL_EXTRAS,
      columns: 2,
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
      ...NEUTRAL_EXTRAS,
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
      ...NEUTRAL_EXTRAS,
      columns: 2,
      upperTitles: true,
    },
  },
  chalkboard: {
    label: { en: "Dark chalkboard", ar: "سبورة داكنة" },
    theme: {
      template: "chalkboard",
      bg: "#131313",
      surface: "#1c1c1c",
      text: "#f5f1e8",
      muted: "#a29c8f",
      primary: "#e8772e",
      primaryText: "#131313",
      accent: "#e8772e",
      bodyFont: "sans",
      headingFont: "condensed",
      layout: "list",
      hero: "chalk",
      radius: 8,
      showImages: true,
      imageShape: "circle",
      showIcons: true,
      buttonStyle: "outline",
      cardStyle: "outline",
      bgStyle: "solid",
      density: "comfortable",
      animation: "fade",
      texture: "chalk",
      decor: "veg",
      sectionStyle: "boxed",
      priceStyle: "right",
      columns: 1,
      upperTitles: true,
      scriptAccent: true,
      tagline: "Dinner",
    },
  },
  sketch: {
    label: { en: "Vintage sketch", ar: "رسم قديم" },
    theme: {
      template: "sketch",
      bg: "#efe7d6",
      surface: "#f7f1e3",
      text: "#3b2418",
      muted: "#8a6f57",
      primary: "#d2691e",
      primaryText: "#fff8ec",
      accent: "#e0952a",
      bodyFont: "serif",
      headingFont: "condensed",
      layout: "columns",
      hero: "stamp",
      radius: 4,
      showImages: false,
      imageShape: "square",
      showIcons: false,
      buttonStyle: "solid",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "comfortable",
      animation: "rise",
      texture: "paper",
      decor: "fastfood",
      sectionStyle: "tab",
      priceStyle: "right",
      columns: 1,
      upperTitles: true,
      scriptAccent: true,
      tagline: "Fresh daily",
    },
  },
  bifold: {
    label: { en: "Dark bi-fold", ar: "طيّة داكنة" },
    theme: {
      template: "bifold",
      bg: "#0b0b0b",
      surface: "#141414",
      text: "#f2f2f2",
      muted: "#8b8b8b",
      primary: "#e9a53a",
      primaryText: "#151007",
      accent: "#e9a53a",
      bodyFont: "sans",
      headingFont: "sans",
      layout: "columns",
      hero: "gradient",
      radius: 6,
      showImages: true,
      imageShape: "circle",
      showIcons: false,
      buttonStyle: "solid",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "compact",
      animation: "fade",
      texture: "grain",
      decor: "veg",
      sectionStyle: "plain",
      priceStyle: "right",
      columns: 1,
      upperTitles: true,
      scriptAccent: false,
      tagline: "Delivery available",
    },
  },
  editorial: {
    label: { en: "Clean editorial", ar: "تحريري نظيف" },
    theme: {
      template: "editorial",
      bg: "#fbf9f4",
      surface: "#ffffff",
      text: "#111111",
      muted: "#7a7570",
      primary: "#111111",
      primaryText: "#ffffff",
      accent: "#f2a13b",
      bodyFont: "sans",
      headingFont: "display",
      layout: "columns",
      hero: "ribbon",
      radius: 2,
      showImages: true,
      imageShape: "circle",
      showIcons: false,
      buttonStyle: "solid",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "airy",
      animation: "fade",
      texture: "none",
      decor: "none",
      sectionStyle: "boxed",
      priceStyle: "leader",
      columns: 1,
      upperTitles: true,
      scriptAccent: true,
      tagline: "Mains",
    },
  },
  breakfast: {
    label: { en: "Bright breakfast", ar: "فطور مشرق" },
    theme: {
      template: "breakfast",
      bg: "#ffffff",
      surface: "#ffffff",
      text: "#22201d",
      muted: "#8a8377",
      primary: "#f59310",
      primaryText: "#ffffff",
      accent: "#f59310",
      bodyFont: "sans",
      headingFont: "sans",
      layout: "list",
      hero: "blob",
      radius: 20,
      showImages: true,
      imageShape: "rounded",
      showIcons: true,
      buttonStyle: "pill",
      cardStyle: "elevated",
      bgStyle: "solid",
      density: "airy",
      animation: "rise",
      texture: "none",
      decor: "shapes",
      sectionStyle: "ribbon",
      priceStyle: "right",
      columns: 1,
      upperTitles: false,
      scriptAccent: true,
      tagline: "Breakfast menu set",
    },
  },
  bakery: {
    label: { en: "Dark bakery", ar: "مخبز داكن" },
    theme: {
      template: "bakery",
      bg: "#1a1d1c",
      surface: "#212524",
      text: "#f6f2e8",
      muted: "#9d9789",
      primary: "#f2b134",
      primaryText: "#1a1512",
      accent: "#f2b134",
      bodyFont: "sans",
      headingFont: "condensed",
      layout: "list",
      hero: "sidebar",
      radius: 4,
      showImages: false,
      imageShape: "square",
      showIcons: false,
      buttonStyle: "solid",
      cardStyle: "outline",
      bgStyle: "solid",
      density: "comfortable",
      animation: "slide",
      texture: "grain",
      decor: "bakery",
      sectionStyle: "ribbon",
      priceStyle: "leader",
      columns: 1,
      upperTitles: true,
      scriptAccent: true,
      tagline: "Baked fresh, served warm",
    },
  },
  poster: {
    label: { en: "Yellow poster", ar: "ملصق أصفر" },
    theme: {
      template: "poster",
      bg: "#333333",
      surface: "#3c3c3c",
      text: "#ffffff",
      muted: "#b3aea3",
      primary: "#f9cb2f",
      primaryText: "#26240f",
      accent: "#f9cb2f",
      bodyFont: "condensed",
      headingFont: "serif",
      layout: "list",
      hero: "ribbon",
      radius: 0,
      showImages: true,
      imageShape: "circle",
      showIcons: false,
      buttonStyle: "solid",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "comfortable",
      animation: "fade",
      texture: "none",
      decor: "none",
      sectionStyle: "plain",
      priceStyle: "inline",
      columns: 1,
      upperTitles: true,
      scriptAccent: false,
      tagline: "Food menu",
    },
  },
  coffeehouse: {
    label: { en: "Vintage coffee house", ar: "بيت قهوة كلاسيكي" },
    theme: {
      template: "coffeehouse",
      bg: "#f6efe1",
      surface: "#fdf9f0",
      text: "#4b2a20",
      muted: "#93705c",
      primary: "#a02c2c",
      primaryText: "#fdf9f0",
      accent: "#a02c2c",
      bodyFont: "serif",
      headingFont: "serif",
      layout: "columns",
      hero: "stamp",
      radius: 4,
      showImages: true,
      imageShape: "circle",
      showIcons: false,
      buttonStyle: "outline",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "compact",
      animation: "fade",
      texture: "paper",
      decor: "coffee",
      sectionStyle: "rule",
      priceStyle: "right",
      columns: 1,
      upperTitles: true,
      scriptAccent: false,
      tagline: "Café menu",
    },
  },
  emerald: {
    label: { en: "Emerald grid", ar: "شبكة زمردية" },
    theme: {
      template: "emerald",
      bg: "#0d3b32",
      surface: "#124a40",
      text: "#f3efe0",
      muted: "#9cb5ac",
      primary: "#f3efe0",
      primaryText: "#0d3b32",
      accent: "#e8ddb5",
      bodyFont: "sans",
      headingFont: "display",
      layout: "grid",
      hero: "sidebar",
      radius: 2,
      showImages: true,
      imageShape: "circle",
      showIcons: false,
      buttonStyle: "outline",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "airy",
      animation: "rise",
      texture: "none",
      decor: "none",
      sectionStyle: "tab",
      priceStyle: "right",
      columns: 2,
      upperTitles: true,
      scriptAccent: false,
      tagline: "Kitchen & bar",
    },
  },
  script: {
    label: { en: "Crimson script", ar: "خط قرمزي" },
    theme: {
      template: "script",
      bg: "#ffffff",
      surface: "#fffdfc",
      text: "#1c1414",
      muted: "#8a6d6d",
      primary: "#8c1c2b",
      primaryText: "#ffffff",
      accent: "#b3202f",
      bodyFont: "sans",
      headingFont: "script",
      layout: "columns",
      hero: "cover",
      radius: 24,
      showImages: true,
      imageShape: "rounded",
      showIcons: true,
      buttonStyle: "pill",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "comfortable",
      animation: "fade",
      texture: "none",
      decor: "veg",
      sectionStyle: "rule",
      priceStyle: "right",
      columns: 1,
      upperTitles: false,
      scriptAccent: true,
      tagline: "The menu",
    },
  },
  retro: {
    label: { en: "Retro splash", ar: "رشّة ريترو" },
    theme: {
      template: "retro",
      bg: "#211913",
      surface: "#f2ece3",
      text: "#2a201a",
      muted: "#7e6a5b",
      primary: "#f08a24",
      primaryText: "#2a1a0c",
      accent: "#f08a24",
      bodyFont: "sans",
      headingFont: "serif",
      layout: "list",
      hero: "blob",
      radius: 28,
      showImages: true,
      imageShape: "circle",
      showIcons: true,
      buttonStyle: "pill",
      cardStyle: "elevated",
      bgStyle: "solid",
      density: "comfortable",
      animation: "pop",
      texture: "none",
      decor: "shapes",
      sectionStyle: "ribbon",
      priceStyle: "leader",
      columns: 1,
      upperTitles: false,
      scriptAccent: true,
      tagline: "Special menu",
    },
  },
  brush: {
    label: { en: "Orange brush", ar: "فرشاة برتقالية" },
    theme: {
      template: "brush",
      bg: "#f5a623",
      surface: "#3a3a3a",
      text: "#f7f5f2",
      muted: "#b8b2a8",
      primary: "#f5821f",
      primaryText: "#241505",
      accent: "#f5a623",
      bodyFont: "condensed",
      headingFont: "rounded",
      layout: "list",
      hero: "stamp",
      radius: 12,
      showImages: true,
      imageShape: "square",
      showIcons: true,
      buttonStyle: "solid",
      cardStyle: "flat",
      bgStyle: "solid",
      density: "compact",
      animation: "slide",
      texture: "grain",
      decor: "fastfood",
      sectionStyle: "ribbon",
      priceStyle: "right",
      columns: 1,
      upperTitles: false,
      scriptAccent: true,
      tagline: "Food menu design",
    },
  },
  nautical: {
    label: { en: "Nautical fine dining", ar: "فخامة بحرية" },
    theme: {
      template: "nautical",
      bg: "#f2efe6",
      surface: "#faf8f2",
      text: "#1f2f6b",
      muted: "#6f7aa3",
      primary: "#1f2f6b",
      primaryText: "#faf8f2",
      accent: "#d81e63",
      bodyFont: "serif",
      headingFont: "sans",
      layout: "columns",
      hero: "ribbon",
      radius: 0,
      showImages: false,
      imageShape: "square",
      showIcons: false,
      buttonStyle: "outline",
      cardStyle: "outline",
      bgStyle: "solid",
      density: "compact",
      animation: "fade",
      texture: "paper",
      decor: "seafood",
      sectionStyle: "rule",
      priceStyle: "inline",
      columns: 1,
      upperTitles: true,
      scriptAccent: false,
      tagline: "Bar & grill",
    },
  },
  ornate: {
    label: { en: "Ornate navy", ar: "كحلي مزخرف" },
    theme: {
      template: "ornate",
      bg: "#141a2b",
      surface: "#1b2237",
      text: "#f4f2ea",
      muted: "#9aa1b8",
      primary: "#e6e2d3",
      primaryText: "#141a2b",
      accent: "#d8cfa8",
      bodyFont: "serif",
      headingFont: "serif",
      layout: "list",
      hero: "chalk",
      radius: 2,
      showImages: false,
      imageShape: "square",
      showIcons: false,
      buttonStyle: "outline",
      cardStyle: "outline",
      bgStyle: "gradient",
      density: "airy",
      animation: "fade",
      texture: "grain",
      decor: "ornate",
      sectionStyle: "rule",
      priceStyle: "leader",
      columns: 1,
      upperTitles: false,
      scriptAccent: false,
      tagline: "Restaurant menu",
    },
  },
  tiles: {
    label: { en: "Photo tiles", ar: "بلاطات صور" },
    theme: {
      template: "tiles",
      bg: "#2b2320",
      surface: "#372d29",
      text: "#f8f4ef",
      muted: "#b0a49c",
      primary: "#f07c20",
      primaryText: "#2a1607",
      accent: "#7bc47f",
      bodyFont: "condensed",
      headingFont: "sans",
      layout: "grid",
      hero: "minimal",
      radius: 14,
      showImages: true,
      imageShape: "circle",
      showIcons: false,
      buttonStyle: "pill",
      cardStyle: "flat",
      bgStyle: "glow",
      density: "compact",
      animation: "pop",
      texture: "grain",
      decor: "none",
      sectionStyle: "plain",
      priceStyle: "right",
      columns: 2,
      upperTitles: true,
      scriptAccent: false,
      tagline: "Italian food",
    },
  },
  wellness: {
    label: { en: "Teal wellness", ar: "هدوء فيروزي" },
    theme: {
      template: "wellness",
      bg: "#f7f3e8",
      surface: "#ffffff",
      text: "#243b38",
      muted: "#7d8e89",
      primary: "#1f6b63",
      primaryText: "#ffffff",
      accent: "#c0873f",
      bodyFont: "sans",
      headingFont: "script",
      layout: "columns",
      hero: "gradient",
      radius: 8,
      showImages: false,
      imageShape: "rounded",
      showIcons: true,
      buttonStyle: "soft",
      cardStyle: "flat",
      bgStyle: "gradient",
      density: "compact",
      animation: "fade",
      texture: "paper",
      decor: "veg",
      sectionStyle: "boxed",
      priceStyle: "right",
      columns: 1,
      upperTitles: false,
      scriptAccent: true,
      tagline: "Lunch & dinner",
    },
  },
};

export const DEFAULT_THEME: MenuTheme = TEMPLATES.chalkboard.theme;

/** The professionally art-directed bases surfaced in the studio. */
export const SIGNATURE_TEMPLATES: TemplateId[] = [
  "chalkboard",
  "sketch",
  "bifold",
  "editorial",
  "breakfast",
  "bakery",
  "poster",
  "coffeehouse",
  "emerald",
  "script",
  "retro",
  "brush",
  "nautical",
  "ornate",
  "tiles",
  "wellness",
];

const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Normalizes anything stored in the database into a complete, safe theme. */
export function parseMenuTheme(raw: unknown): MenuTheme {
  const input = (raw ?? {}) as Record<string, unknown>;
  const template = oneOf<TemplateId>(input["template"], TEMPLATE_IDS, "chalkboard");
  const base = TEMPLATES[template].theme;
  const fonts: FontId[] = [
    "sans",
    "serif",
    "rounded",
    "mono",
    "display",
    "condensed",
    "script",
  ];
  const radius = Number(input["radius"]);
  const columns = Number(input["columns"]);
  const tagline = typeof input["tagline"] === "string" ? input["tagline"].slice(0, 60) : base.tagline;
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
    layout: oneOf<LayoutId>(
      input["layout"],
      ["list", "grid", "magazine", "columns"],
      base.layout,
    ),
    hero: oneOf<HeroId>(
      input["hero"],
      ["cover", "gradient", "minimal", "chalk", "stamp", "ribbon", "blob", "sidebar"],
      base.hero,
    ),
    radius: Number.isFinite(radius) ? Math.min(32, Math.max(0, radius)) : base.radius,
    showImages: bool(input["showImages"], base.showImages),
    imageShape: oneOf<ImageShape>(
      input["imageShape"],
      ["rounded", "circle", "square"],
      base.imageShape,
    ),
    showIcons: bool(input["showIcons"], base.showIcons),
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
    texture: oneOf<TextureId>(input["texture"], ["none", "chalk", "paper", "grain"], base.texture),
    decor: oneOf<DecorId>(
      input["decor"],
      ["none", "veg", "fastfood", "bakery", "shapes", "ornate", "coffee", "seafood"],
      base.decor,
    ),
    sectionStyle: oneOf<SectionStyleId>(
      input["sectionStyle"],
      ["plain", "boxed", "rule", "tab", "ribbon"],
      base.sectionStyle,
    ),
    priceStyle: oneOf<PriceStyleId>(
      input["priceStyle"],
      ["inline", "right", "leader"],
      base.priceStyle,
    ),
    columns: columns === 2 ? 2 : columns === 1 ? 1 : base.columns,
    upperTitles: bool(input["upperTitles"], base.upperTitles),
    scriptAccent: bool(input["scriptAccent"], base.scriptAccent),
    tagline,
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
    "--qs-script-font": FONT_STACKS.script,
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

export function hexAlpha(hex: string, alpha: number): string {
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

/**
 * Fixed, non-interactive texture layer painted over the page background.
 * Each recipe stacks several irregular layers (fibres, blotches, dust) so the
 * result reads like a real printed surface rather than a flat CSS pattern.
 */
export function textureStyle(theme: MenuTheme): React.CSSProperties | null {
  if (theme.texture === "none") return null;
  const ink = (a: number) => hexAlpha(theme.text, a);

  if (theme.texture === "chalk") {
    // Chalk dust + eraser smears drifting across a slate board.
    return {
      backgroundImage: [
        `radial-gradient(${ink(0.1)} 0.6px, transparent 0.8px)`,
        `radial-gradient(${ink(0.055)} 0.5px, transparent 0.7px)`,
        `radial-gradient(${ink(0.04)} 0.9px, transparent 1.1px)`,
        `radial-gradient(60% 32% at 22% 18%, ${hexAlpha("#ffffff", 0.05)} 0%, transparent 70%)`,
        `radial-gradient(45% 26% at 78% 62%, ${hexAlpha("#ffffff", 0.035)} 0%, transparent 72%)`,
      ].join(", "),
      backgroundSize: "7px 7px, 13px 11px, 23px 19px, 100% 100%, 100% 100%",
      backgroundPosition: "0 0, 4px 6px, 11px 3px, 0 0, 0 0",
      opacity: 0.95,
    };
  }

  if (theme.texture === "paper") {
    // Kraft fibres: crossed threads, long grain streaks and uneven pulp patches.
    return {
      backgroundImage: [
        `repeating-linear-gradient(94deg, ${ink(0.035)} 0 1px, transparent 1px 3px)`,
        `repeating-linear-gradient(3deg, ${ink(0.028)} 0 1px, transparent 1px 4px)`,
        `repeating-linear-gradient(48deg, ${ink(0.02)} 0 1px, transparent 1px 7px)`,
        `radial-gradient(38% 24% at 12% 26%, ${ink(0.05)} 0%, transparent 70%)`,
        `radial-gradient(30% 20% at 82% 44%, ${ink(0.045)} 0%, transparent 72%)`,
        `radial-gradient(42% 26% at 58% 84%, ${ink(0.04)} 0%, transparent 70%)`,
      ].join(", "),
      opacity: 0.85,
    };
  }

  // Fine offset-print grain with an uneven rosette.
  return {
    backgroundImage: [
      `radial-gradient(${ink(0.065)} 0.5px, transparent 0.7px)`,
      `radial-gradient(${ink(0.035)} 0.5px, transparent 0.7px)`,
      `radial-gradient(50% 30% at 70% 12%, ${ink(0.035)} 0%, transparent 74%)`,
    ].join(", "),
    backgroundSize: "4px 4px, 9px 7px, 100% 100%",
    backgroundPosition: "0 0, 2px 3px, 0 0",
    opacity: 0.8,
  };
}

/**
 * Soft press vignette + light fall-off, the way a real printed card darkens at
 * its edges. Painted above the texture, below the content.
 */
export function paperVignetteStyle(theme: MenuTheme): React.CSSProperties {
  const dark = hexAlpha(theme.text, 0.13);
  return {
    backgroundImage: [
      `radial-gradient(115% 78% at 50% 34%, transparent 52%, ${dark} 100%)`,
      `linear-gradient(196deg, ${hexAlpha("#ffffff", 0.05)} 0%, transparent 38%)`,
    ].join(", "),
  };
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

/** Frame around a whole category block (used with `sectionStyle`). */
export function sectionFrameStyle(theme: MenuTheme): React.CSSProperties {
  if (theme.sectionStyle === "boxed") {
    return {
      border: `1px solid ${hexAlpha(theme.accent, 0.55)}`,
      borderRadius: `${Math.max(4, theme.radius)}px`,
      padding: "0.875rem",
      background: hexAlpha(theme.surface, theme.cardStyle === "flat" ? 0.55 : 0.9),
    };
  }
  if (theme.sectionStyle === "tab") {
    return {
      borderInlineStart: `3px solid ${theme.primary}`,
      paddingInlineStart: "0.75rem",
    };
  }
  return {};
}

/** Heading typography for a category title. */
export function sectionTitleStyle(theme: MenuTheme): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "var(--qs-heading-font)",
    letterSpacing: theme.upperTitles ? "0.14em" : "0",
    textTransform: theme.upperTitles ? "uppercase" : "none",
    color: theme.accent,
  };
  if (theme.sectionStyle === "ribbon") {
    return {
      ...base,
      background: theme.primary,
      color: theme.primaryText,
      padding: "0.35rem 0.75rem",
      borderRadius: `${Math.max(2, Math.min(theme.radius, 10))}px`,
      display: "inline-block",
    };
  }
  return base;
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

/** Button / chip styling. `active` false renders the quiet variant. */
export function buttonStyle(theme: MenuTheme, active = true): React.CSSProperties {
  const radius = theme.buttonStyle === "pill" ? "999px" : `${Math.max(6, theme.radius)}px`;
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

/** Nudge phrases the studio offers for one-tap regeneration tweaks. */
export const TWEAKS: { id: string; en: string; ar: string }[] = [
  { id: "darker", en: "Make it darker", ar: "اجعله أغمق" },
  { id: "brighter", en: "Brighter and warmer", ar: "أكثر إشراقًا ودفئًا" },
  { id: "photos", en: "Add more photos", ar: "أضف صورًا أكثر" },
  { id: "illustrated", en: "Illustration-led, no photos", ar: "رسوم بدل الصور" },
  { id: "minimal", en: "More minimal", ar: "أكثر بساطة" },
  { id: "editorial", en: "More editorial and typographic", ar: "أكثر تحريرًا وطباعة" },
  { id: "playful", en: "More playful", ar: "أكثر مرحًا" },
];
