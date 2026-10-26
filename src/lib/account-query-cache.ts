import type { QueryClient } from "@tanstack/react-query";

/** Clear every feature cache, including mutations and in-flight queries. */
export function clearAccountQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
}
