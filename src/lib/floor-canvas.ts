export function normalizeCanvasSize(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const dimension = (value: unknown, fallback: number, min: number, max: number) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
  };
  return {
    width: dimension(raw.width, 1000, 600, 2400),
    height: dimension(raw.height, 700, 400, 1600),
  };
}
