/** 2D canvas width is zoom * viewportWidth * size.width / 1000. */
export function floorFitZoom(
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  if (viewport.width <= 0 || viewport.height <= 0) return 1000 / size.width;
  return Math.min(1000 / size.width, (viewport.height * 1000) / (viewport.width * size.height));
}
export function stepFloorZoom(current: number, direction: number, fit: number) {
  return Math.min(fit * 4, Math.max(fit * 0.4, current + direction * fit * 0.1));
}
