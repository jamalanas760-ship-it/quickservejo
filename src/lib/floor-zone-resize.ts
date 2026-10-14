export type ZoneResizeCorner = "nw" | "ne" | "sw" | "se";
export type ZoneDragMode = "move" | "resize" | "resize-nw" | "resize-ne" | "resize-sw";
export function resizeFloorZone<T extends { x: number; y: number; width: number; height: number }>(
  zone: T,
  dx: number,
  dy: number,
  corner: ZoneResizeCorner,
): T {
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const right = clamp(zone.x + zone.width, 8, 100),
    bottom = clamp(zone.y + zone.height, 8, 100);
  const west = corner.endsWith("w"),
    north = corner.startsWith("n");
  const x = west ? clamp(zone.x + dx, 0, right - 8) : clamp(zone.x, 0, 92);
  const y = north ? clamp(zone.y + dy, 0, bottom - 8) : clamp(zone.y, 0, 92);
  return {
    ...zone,
    x,
    y,
    width: west ? right - x : clamp(zone.width + dx, 8, 100 - x),
    height: north ? bottom - y : clamp(zone.height + dy, 8, 100 - y),
  };
}
