/**
 * WCAG contrast helpers. Used as a safety guard on AI-generated menu themes so
 * a generated palette can never ship unreadable text/background pairs.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(value);
  const full = /^#([0-9a-fA-F]{6})$/.exec(value);
  const raw = full ? full[1]! : short ? short[1]!.split("").map((c) => c + c).join("") : null;
  if (!raw) return null;
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance per WCAG 2.1. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two hex colours (1 = identical, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex([
    rgb[0] + (target[0] - rgb[0]) * amount,
    rgb[1] + (target[1] - rgb[1]) * amount,
    rgb[2] + (target[2] - rgb[2]) * amount,
  ]);
}

/**
 * Nudges `foreground` towards black or white — whichever direction the
 * background allows — until it clears `ratio` against `background`.
 * Falls back to pure black/white when the hue simply cannot reach the target.
 */
export function ensureContrast(foreground: string, background: string, ratio = 4.5): string {
  if (!parseHex(foreground) || !parseHex(background)) return foreground;
  if (contrastRatio(foreground, background) >= ratio) return foreground;

  const target: [number, number, number] = luminance(background) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 10; step += 1) {
    const candidate = mix(foreground, target, step / 10);
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return toHex(target);
}

/** AA for large text (18.66px bold / 24px regular) is 3:1. */
export function ensureLargeTextContrast(foreground: string, background: string): string {
  return ensureContrast(foreground, background, 3);
}
