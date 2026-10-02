export type FloorTableLayout = { x: number; y: number; rotation: number; scale: number };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** Convert a ray/ground-plane hit to the existing normalized layout coordinates. */
export function floorPointToLayout(x: number, z: number, width: number, depth: number) {
  return { x: (x / width + 0.5) * 1000, y: (z / depth + 0.5) * 700 };
}
export function moveTableInFloor(
  layout: FloorTableLayout,
  dx: number,
  dy: number,
  snap: boolean,
): FloorTableLayout {
  const quantize = (n: number) => (snap ? Math.round(n / 10) * 10 : n);
  return {
    ...layout,
    x: clamp(quantize(layout.x + dx), 45, 955),
    y: clamp(quantize(layout.y + dy), 45, 655),
  };
}
