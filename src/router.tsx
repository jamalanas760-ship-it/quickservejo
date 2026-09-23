import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep navigation responsive: cached data is reused briefly instead of
        // refetching every time a tab/route mounts. Mutations can still invalidate
        // individual queries immediately when fresh data is required.
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 60_000,
    // Fast navigations keep the current shell in place. A pending state is only
    // shown for genuinely slow routes, and it is never artificially prolonged.
    defaultPendingMs: 450,
    defaultPendingMinMs: 0,
  });

  return router;
};
