export const DESKTOP_NAV_LIMIT = 10;
export const PINNED_TOOL_LIMIT = DESKTOP_NAV_LIMIT - 1;

/** Keep preferred order, fill free slots, and only return permission-filtered destinations. */
export function selectDesktopPrimary<T extends { to: string }>(
  allowed: readonly T[],
  preferred: readonly T[],
): T[] {
  const byPath = new Map(allowed.map((item) => [item.to, item]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const candidate of [...preferred, ...allowed]) {
    const item = byPath.get(candidate.to);
    if (!item || seen.has(item.to)) continue;
    seen.add(item.to);
    result.push(item);
    if (result.length === DESKTOP_NAV_LIMIT) break;
  }
  return result;
}
