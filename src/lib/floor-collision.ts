/** Rotation-aware separating-axis test in physical floor-plan units. */
export type FloorBounds = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  kind?: string;
};
function axes(box: FloorBounds) {
  const angle = (box.rotation * Math.PI) / 180;
  return [
    { x: Math.cos(angle), y: Math.sin(angle) },
    { x: -Math.sin(angle), y: Math.cos(angle) },
  ];
}
export function floorObjectsOverlap(a: FloorBounds, b: FloorBounds) {
  const aa = axes(a),
    ba = axes(b);
  for (const axis of [...aa, ...ba]) {
    const radius = (box: FloorBounds, directions: ReturnType<typeof axes>) =>
      (Math.abs(axis.x * directions[0].x + axis.y * directions[0].y) * box.width) / 2 +
      (Math.abs(axis.x * directions[1].x + axis.y * directions[1].y) * box.height) / 2;
    const distance = Math.abs((b.x - a.x) * axis.x + (b.y - a.y) * axis.y);
    if (distance >= radius(a, aa) + radius(b, ba) - 0.001) return false;
  }
  return true;
}
export function compatibleFloorObjects(a: FloorBounds, b: FloorBounds) {
  // Openings attach to walls. Table-owned seats are part of their table footprint.
  const opening = (kind?: string) => kind === "door" || kind === "window";
  return (
    (a.kind === "wall" && (b.kind === "wall" || opening(b.kind))) ||
    (b.kind === "wall" && opening(a.kind))
  );
}
export function floorCollision(candidate: FloorBounds, objects: FloorBounds[]) {
  return objects.find(
    (other) =>
      other.id !== candidate.id &&
      !compatibleFloorObjects(candidate, other) &&
      floorObjectsOverlap(candidate, other),
  );
}
