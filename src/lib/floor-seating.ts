/** Shared furniture geometry in metres; plan Y corresponds to scene Z. */
export function floorSeats(shape: "round" | "square" | "rectangle", capacity: number) {
  const count = Math.max(2, Math.min(8, Math.round(capacity) || 4));
  return Array.from({ length: count }, (_, i) => {
    const angle = (i * 2 * Math.PI) / count;
    const x = Math.sin(angle) * (shape === "rectangle" ? 0.83 : 0.7);
    const y = Math.cos(angle) * 0.7;
    // The chair's back is local -Z; its front must point toward the centre.
    return { x, y, rotation: Math.atan2(-x, -y) };
  });
}
