// A schematic distance indicator, not a navigation route or movement history.
const points: [number, number][] = [
  [60, 135],
  [145, 135],
];
for (let i = 1; i <= 20; i++) {
  const t = i / 20;
  points.push([145 + 80 * t - 40 * t * t, 135 - 35 * t * t]);
}
for (let i = 1; i <= 20; i++) {
  const t = i / 20;
  points.push([185 + 40 * t * t, 100 - 68 * t + 34 * t * t]);
}
points.push([425, 66]);
const lengths = points.map((point, index) =>
  index ? Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) : 0,
);
const total = lengths.reduce((sum, length) => sum + length, 0);
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
  let remaining = total * progress;
  for (let i = 1; i < points.length; i++) {
    if (remaining <= lengths[i]) {
      const t = remaining / lengths[i];
      return {
        progress,
        x: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        y: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      };
    }
    remaining -= lengths[i];
  }
  return { progress: 1, x: 425, y: 66 };
}
