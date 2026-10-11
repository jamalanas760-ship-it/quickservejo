export type SearchDestination = { to: string; en: string; ar: string };
export const searchHistoryKey = (userId: string, restaurantId: string) =>
  `quickserve.search:${userId}:${restaurantId}`;

export function cleanSearchTerm(value: string) {
  return value.trim().slice(0, 100);
}

export function searchPattern(value: string) {
  return `%${cleanSearchTerm(value).replace(/[%_\\,().]/g, " ")}%`;
}

export function normalizeSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string")
    .map(cleanSearchTerm).filter(Boolean))].slice(0, 8);
}

export function rememberSearch(history: string[], term: string) {
  const next = cleanSearchTerm(term);
  return normalizeSearchHistory([next, ...history.filter(item => item.toLocaleLowerCase() !== next.toLocaleLowerCase())]);
}