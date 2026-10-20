// A schematic distance indicator, not a navigation route or movement history.
const total = 365;
export function attendanceRoadmapPosition(distance: number | null, radius: number) {
  if (
    distance == null ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(radius) ||
    radius <= 0
  )
    return null;
  const boundary = 1 - 43 / total;
  const progress =
    distance <= radius
      ? 1 - (distance / radius) * (1 - boundary)
      : Math.max(0, boundary * (1 - (distance - radius) / (radius * 4)));
  return { progress, x: 60 + total * progress, y: 90 };
}
