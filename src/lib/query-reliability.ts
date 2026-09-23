const TRANSIENT_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_DATABASE_CODES = new Set(["08000", "08003", "08006", "53300", "57P01", "57P02", "57P03"]);

export function isRetryableQueryError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof Response) return TRANSIENT_HTTP_STATUS.has(error.status);

  const value = error as { status?: unknown; code?: unknown; message?: unknown } | null;
  const status = Number(value?.status);
  if (Number.isFinite(status) && status > 0) return TRANSIENT_HTTP_STATUS.has(status);
  if (typeof value?.code === "string" && TRANSIENT_DATABASE_CODES.has(value.code)) return true;

  const message = error instanceof Error ? error.message : String(value?.message ?? error ?? "");
  return /failed to fetch|network(?: request)? failed|load failed|econn|enotfound|timed? out|timeout|temporarily unavailable|connection (?:closed|reset|refused)/i.test(message);
}

/** Two short retries cover transient deploy/network edges without a retry storm. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  return failureCount < 2 && isRetryableQueryError(error);
}

export function queryRetryDelay(attempt: number) {
  return Math.min(600 * 2 ** attempt, 2_400);
}
