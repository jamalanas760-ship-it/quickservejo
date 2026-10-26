/** Deterministic SVG geometry, shared by server artwork and client motion. */
export function dialPoint(radius: number, degrees: number) {
  const angle = ((degrees - 90) * Math.PI) / 180;
  return { x: 320 + Math.cos(angle) * radius, y: 320 + Math.sin(angle) * radius };
}
export function dialArc(radius: number, start: number, end: number) {
  const a = dialPoint(radius, start),
    b = dialPoint(radius, end);
  return `M${a.x.toFixed(3)} ${a.y.toFixed(3)} A${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
}
export function servingWidth(y: number) {
  if (y >= 222 && y <= 242) return 12 * Math.sqrt(Math.max(0, 1 - ((y - 232) / 10) ** 2));
  if (y >= 248 && y < 365) return 132 * Math.sqrt(Math.max(0, 1 - ((365 - y) / 117) ** 2));
  if (y >= 365 && y < 376) return 148;
  if (y >= 386 && y <= 405) return 132 * Math.sqrt(Math.max(0, 1 - ((y - 386) / 21) ** 2));
  return 0;
}
export function serviceFlow(t: number) {
  const p = Math.max(0, Math.min(1, t)),
    q = 1 - p;
  return {
    x: q ** 3 * 205 + 3 * q ** 2 * p * 375 + 3 * q * p ** 2 * 265 + p ** 3 * 435,
    y: q ** 3 * 420 + 3 * q ** 2 * p * 420 + 3 * q * p ** 2 * 220 + p ** 3 * 220,
  };
}
