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
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
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
    defaultPreloadStaleTime: 5 * 60_000,
    // Keep the current screen mounted while normal route chunks resolve. This
    // prevents fast navigation from ever swapping to a transient loading frame.
    defaultPendingMs: 1_200,
    defaultPendingMinMs: 0,
  });

  return router;
};
