/** Only reads can be replayed: a failed write may already have committed. */
export async function fetchWithSafeRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 3 : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await fetcher(input, init);
      if (attempt >= attempts || ![408, 425, 429, 502, 503, 504].includes(result.status)) return result;
      await result.body?.cancel();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (attempt >= attempts || !/failed to fetch|network|load failed|fetch failed|econn|enotfound|timeout|dns|temporarily unavailable/i.test(message)) throw error;
    }
    if (init.signal?.aborted || (input instanceof Request && input.signal.aborted)) throw new DOMException("The request was aborted", "AbortError");
    await wait(250 * 2 ** (attempt - 1));
  }
}
