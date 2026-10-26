/** Operator-owned bindings. Customer-editable connection JSON is never a secret source. */
export type IntegrationBinding = {
  restaurantId: string;
  connectionId: string;
  category: string;
  provider: string;
  endpoint: string;
  token: string;
};

export function approvedEndpoint(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search ||
    (url.port && url.port !== "443") || host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") ||
    host.includes(":") || /^[\d.]+$/.test(host)) {
    throw new Error("Integration endpoint is not approved");
  }
  return url.href;
}

export function resolveIntegrationBinding(
  raw: string | undefined,
  job: { restaurant_id: string; connection_id: string; category: string },
  connection: { provider: string; config: Record<string, unknown> },
): IntegrationBinding {
  let bindings: unknown;
  try { bindings = JSON.parse(raw || "[]"); } catch { throw new Error("Integration bindings are invalid"); }
  if (!Array.isArray(bindings)) throw new Error("Integration bindings are invalid");
  const matches = bindings.filter((b) => b && b.restaurantId === job.restaurant_id &&
    b.connectionId === job.connection_id && b.category === job.category && b.provider === connection.provider);
  if (matches.length !== 1) throw new Error("An operator must approve this restaurant integration");
  const binding = matches[0] as IntegrationBinding;
  if (typeof binding.token !== "string" || !binding.token.trim() || /[\r\n]/.test(binding.token)) {
    throw new Error("Integration credential is unavailable");
  }
  const endpoint = approvedEndpoint(binding.endpoint);
  if (typeof connection.config?.endpoint_url !== "string" || approvedEndpoint(connection.config.endpoint_url) !== endpoint) {
    throw new Error("Integration endpoint differs from its approved binding");
  }
  return { ...binding, endpoint, token: binding.token.trim() };
}

/** No redirects: a trusted provider cannot redirect an Authorization header elsewhere. */
export async function postIntegrationJson(
  binding: IntegrationBinding,
  idempotencyKey: string,
  payload: unknown,
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await fetcher(approvedEndpoint(binding.endpoint), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${binding.token}`,
      "Idempotency-Key": idempotencyKey, "User-Agent": "QuickServe-Connect/1.0" },
    body: JSON.stringify(payload),
  });
  // Provider bodies may contain credentials or personal data. Never persist raw bodies/errors.
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Integration provider HTTP ${response.status}`); }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 65_536) throw new Error("Integration response exceeds limit");
        chunks.push(next.value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  let data: unknown = {};
  try { data = bytes ? JSON.parse(new TextDecoder().decode(merged)) : {}; } catch { /* Empty acknowledgement is valid. */ }
  return { status: response.status, data: data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {} };
}

export async function mapConcurrent<T, R>(items: T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; try { results[index] = await run(items[index]); } catch (error) { failure ??= error; } }
  }));
  if (failure) throw failure;
  return results;
}
