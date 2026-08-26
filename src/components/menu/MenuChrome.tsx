/**
 * Shared presentational chrome for themed diner menus: texture overlay,
 * line-art decoration bands, hero variants and section headings.
 *
 * Used by the public menu (`/r/$slug`) and by the design studio preview so both
 * always render the exact same design language.
 */
import {
  hexAlpha,
  sectionTitleStyle,
  textureStyle,
  type MenuTheme,
} from "@/lib/menu-theme";
import { cn } from "@/lib/utils";

export function TextureLayer({ theme }: { theme: MenuTheme }) {
  const style = textureStyle(theme);
  if (!style) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{ ...style, mixBlendMode: "overlay" }}
    />
  );
}

const LINE_ART: Record<string, string[]> = {
  // Herbs, leaves, mushroom, chilli — chalkboard bottom band.
  veg: [
    "M6 44c8-16 22-24 34-22-4 14-16 24-34 22Z",
    "M40 22c0-10 8-18 16-18 2 10-4 20-16 18Z",
    "M62 44c0-10 6-16 14-16s14 6 14 16Zm14 0v10",
    "M100 44c10-4 18-14 18-26-12 2-20 12-18 26Z",
    "M126 44c6-12 18-18 30-16-4 12-16 20-30 16Z",
  ],
  // Fries, burger, cup, donut — vintage sketch band.
  fastfood: [
    "M8 20h20l-4 24H12ZM12 20l2-12M20 20V6M26 20l4-12",
    "M46 30h30c0 8-6 14-15 14s-15-6-15-14Zm0-4c0-8 6-14 15-14s15 6 15 14Z",
    "M92 16h22l-3 28H95Z",
    "M132 30a14 14 0 1 0 28 0 14 14 0 1 0-28 0Zm10 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0Z",
  ],
  // Croissant, cupcake, glass — bakery footer.
  bakery: [
    "M6 34c6-14 22-22 36-18-2 12-14 22-36 18Zm10-6 8-6m-2 10 10-8",
    "M56 22h26l-4 22H60Zm-2-4c0-8 8-12 15-12s15 4 15 12Z",
    "M100 14h24l-4 30h-16Zm2 10h20",
    "M138 44c0-14 8-22 18-22v22Z",
  ],
  shapes: [],
};

/** Thin illustrated band that anchors the foot of the menu. */
export function DecorBand({ theme, className }: { theme: MenuTheme; className?: string }) {
  if (theme.decor === "none") return null;
  if (theme.decor === "shapes") {
    return (
      <div aria-hidden className={cn("relative h-16 overflow-hidden", className)}>
        <span
          className="absolute -bottom-8 start-4 size-24 rounded-full"
          style={{ background: hexAlpha(theme.accent, 0.18) }}
        />
        <span
          className="absolute bottom-2 end-8 size-10 rounded-full"
          style={{ background: hexAlpha(theme.primary, 0.22) }}
        />
        <span
          className="absolute bottom-6 end-24 size-4 rounded-full"
          style={{ background: hexAlpha(theme.accent, 0.5) }}
        />
      </div>
    );
  }
  const paths = LINE_ART[theme.decor] ?? [];
  return (
    <svg
      aria-hidden
      viewBox="0 0 170 48"
      className={cn("h-14 w-full", className)}
      fill="none"
      stroke={hexAlpha(theme.text, 0.45)}
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Sub-line rendered in the script face when the theme asks for it. */
function ScriptLine({ theme, text }: { theme: MenuTheme; text: string }) {
  if (!theme.scriptAccent || !text) return null;
  return (
    <span
      className="block text-xl leading-none"
      style={{ fontFamily: "var(--qs-script-font)", color: theme.accent }}
    >
      {text}
    </span>
  );
}

export type HeroProps = {
  theme: MenuTheme;
  name: string;
  subtitle?: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  /** Compact sizing for the studio phone preview. */
  compact?: boolean;
  /** Right-hand slot (language switch, table badge…). */
  aside?: React.ReactNode;
};

/**
 * Hero band. Every variant delivers a strong title area with a focal point,
 * which is what separates the designed templates from a plain list.
 */
export function MenuHero({
  theme,
  name,
  subtitle,
  logoUrl,
  coverUrl,
  compact,
  aside,
}: HeroProps) {
  const titleClass = compact ? "text-2xl" : "text-4xl sm:text-5xl";
  const titleStyle: React.CSSProperties = {
    fontFamily: "var(--qs-heading-font)",
    textTransform: theme.upperTitles ? "uppercase" : "none",
    letterSpacing: theme.upperTitles ? "0.06em" : "0",
    lineHeight: 1,
  };

  const logo = logoUrl ? (
    <img
      src={logoUrl}
      alt=""
      className={cn(
        "shrink-0 object-cover",
        compact ? "size-9" : "size-14",
        theme.imageShape === "circle"
          ? "rounded-full"
          : theme.imageShape === "square"
            ? "rounded-none"
            : "rounded-xl",
      )}
    />
  ) : null;

  if (theme.hero === "sidebar") {
    return (
      <div className="relative flex items-stretch gap-4 px-4 pt-6">
        <div
          className="shrink-0 self-stretch text-center font-black"
          style={{
            ...titleStyle,
            writingMode: "vertical-rl",
            fontSize: compact ? "1.6rem" : "3rem",
            color: theme.text,
            opacity: 0.95,
          }}
        >
          {name}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-2 pb-2">
          <ScriptLine theme={theme} text={theme.tagline} />
          {subtitle ? (
            <p className="text-xs" style={{ color: theme.muted }}>
              {subtitle}
            </p>
          ) : null}
          {aside}
        </div>
      </div>
    );
  }

  if (theme.hero === "blob") {
    return (
      <div className="relative overflow-hidden">
        <div
          className="absolute -start-16 -top-24 size-72 rounded-full"
          style={{ background: theme.primary, opacity: 0.95 }}
        />
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className={cn("absolute end-0 top-0 w-1/2 object-cover", compact ? "h-28" : "h-44")}
          />
        ) : null}
        <div className={cn("relative px-4", compact ? "pb-3 pt-10" : "pb-6 pt-20")}>
          <div
            className="max-w-[85%] p-4"
            style={{
              background: theme.surface,
              borderRadius: `${Math.max(12, theme.radius)}px`,
              boxShadow: `0 18px 40px -24px ${hexAlpha(theme.text, 0.6)}`,
            }}
          >
            <div className="flex items-center gap-2">
              {logo}
              <h1 className={cn("font-black", titleClass)} style={titleStyle}>
                {name}
              </h1>
            </div>
            <ScriptLine theme={theme} text={theme.tagline} />
            {subtitle ? (
              <p className="mt-1 text-xs" style={{ color: theme.muted }}>
                {subtitle}
              </p>
            ) : null}
            {aside ? <div className="mt-2">{aside}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  if (theme.hero === "ribbon") {
    return (
      <div className={cn("px-4 text-center", compact ? "pt-6" : "pt-12")}>
        {logo ? <div className="mb-2 flex justify-center">{logo}</div> : null}
        <p
          className="text-[11px] font-semibold tracking-[0.35em]"
          style={{ color: theme.accent, textTransform: "uppercase" }}
        >
          {theme.tagline || subtitle}
        </p>
        <h1 className={cn("mt-1 font-black", titleClass)} style={titleStyle}>
          {name}
        </h1>
        <span
          className="mt-2 inline-block px-6 py-1 text-xs font-bold tracking-[0.3em]"
          style={{ background: theme.accent, color: theme.primaryText, textTransform: "uppercase" }}
        >
          Menu
        </span>
        {aside ? <div className="mt-3">{aside}</div> : null}
      </div>
    );
  }

  if (theme.hero === "chalk" || theme.hero === "stamp") {
    const stamp = theme.hero === "stamp";
    return (
      <div className={cn("px-4 text-center", compact ? "pt-6" : "pt-10")}>
        {logo ? <div className="mb-2 flex justify-center">{logo}</div> : null}
        <h1
          className={cn("font-black", titleClass)}
          style={{
            ...titleStyle,
            color: theme.text,
            textShadow: stamp ? "none" : `0 0 1px ${hexAlpha(theme.text, 0.6)}`,
          }}
        >
          {name}
        </h1>
        <ScriptLine theme={theme} text={theme.tagline} />
        {stamp ? (
          <span
            className="mt-2 inline-block -rotate-2 px-4 py-1 text-[11px] font-bold tracking-[0.2em]"
            style={{
              background: theme.primary,
              color: theme.primaryText,
              textTransform: "uppercase",
            }}
          >
            {subtitle || theme.tagline}
          </span>
        ) : subtitle ? (
          <p className="mt-1 text-xs" style={{ color: theme.muted }}>
            {subtitle}
          </p>
        ) : null}
        <div
          className="mx-auto mt-3 h-px w-24"
          style={{ background: hexAlpha(theme.accent, 0.8) }}
        />
        {aside ? <div className="mt-3">{aside}</div> : null}
      </div>
    );
  }

  // cover / gradient / minimal — the classic bands.
  return (
    <div className="relative">
      {theme.hero === "cover" && coverUrl ? (
        <img src={coverUrl} alt="" className={cn("w-full object-cover", compact ? "h-24" : "h-40")} />
      ) : theme.hero === "gradient" ? (
        <div
          className={cn("w-full", compact ? "h-20" : "h-32")}
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
        />
      ) : (
        <div className="h-8 w-full" />
      )}
      <div className={cn("px-4", theme.hero === "minimal" ? "" : "-mt-8")}>
        <div
          className="flex items-center gap-3 p-4"
          style={{
            background: theme.surface,
            borderRadius: `${theme.radius}px`,
            boxShadow: `0 12px 30px -22px ${hexAlpha(theme.text, 0.6)}`,
          }}
        >
          {logo}
          <div className="min-w-0 flex-1">
            <h1
              className={cn("truncate font-bold", compact ? "text-sm" : "text-lg")}
              style={titleStyle}
            >
              {name}
            </h1>
            <ScriptLine theme={theme} text={theme.tagline} />
            {subtitle ? (
              <p className="truncate text-xs" style={{ color: theme.muted }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {aside}
        </div>
      </div>
    </div>
  );
}

/** Category heading with the theme's section treatment. */
export function SectionHeading({
  theme,
  title,
  compact,
}: {
  theme: MenuTheme;
  title: string;
  compact?: boolean;
}) {
  return (
    <div className="mb-2">
      <h2
        className={cn("font-bold", compact ? "text-xs" : "text-sm sm:text-base")}
        style={sectionTitleStyle(theme)}
      >
        {title}
      </h2>
      {theme.sectionStyle === "rule" || theme.sectionStyle === "boxed" ? (
        <div
          className="mt-1.5 h-px w-full"
          style={{ background: hexAlpha(theme.muted, 0.45) }}
        />
      ) : null}
    </div>
  );
}

/** Dotted-leader price row used by print-style templates. */
export function PriceLine({
  theme,
  price,
  className,
}: {
  theme: MenuTheme;
  price: string;
  className?: string;
}) {
  if (theme.priceStyle === "leader") {
    return (
      <span className={cn("flex flex-1 items-baseline gap-1", className)}>
        <span
          className="mx-1 flex-1 translate-y-[-2px] border-b border-dotted"
          style={{ borderColor: hexAlpha(theme.muted, 0.7) }}
        />
        <span className="font-bold" style={{ color: theme.accent }}>
          {price}
        </span>
      </span>
    );
  }
  return (
    <span className={cn("font-bold", className)} style={{ color: theme.accent }}>
      {price}
    </span>
  );
}
