import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import quickServeSystemCss from "../quickserve-system.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { SplashScreen } from "@/components/app/SplashScreen";
import { NotificationPrompt } from "@/components/app/NotificationPrompt";
import { AppRuntimeMonitor } from "@/components/app/AppRuntimeMonitor";
import { isMenuThemeBridgeMessage, MENU_THEME_CHANNEL } from "@/lib/menu-theme-bridge";

const RUNTIME_RECOVERY_PREFIX = "quickserve:runtime-recovery:";
const RUNTIME_RECOVERY_WINDOW_MS = 60_000;

function runtimeErrorMessage(error: unknown) {
  if (error instanceof Response) return `Response ${error.status}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error ?? "");
}

/**
 * A new Lovable deployment can briefly leave an already-open tab holding an old
 * route/module graph while the new assets become authoritative. Recover once
 * with a hard refresh for those transient cases, but never loop on real app bugs.
 */
function shouldHardRefresh(error: unknown) {
  if (error instanceof Response) return [408, 425, 429, 500, 502, 503, 504].includes(error.status);
  return /chunkloaderror|loading chunk|failed to fetch dynamically imported module|importing a module script failed|dynamically imported module|module script|failed to fetch|networkerror|load failed|network request failed/i.test(runtimeErrorMessage(error));
}

function hardRefreshOnce(error: unknown) {
  if (typeof window === "undefined" || !shouldHardRefresh(error)) return false;
  const key = `${RUNTIME_RECOVERY_PREFIX}${window.location.pathname}`;
  const now = Date.now();
  try {
    const previous = Number(window.sessionStorage.getItem(key) ?? 0);
    if (Number.isFinite(previous) && previous > 0 && now - previous < RUNTIME_RECOVERY_WINDOW_MS) return false;
    window.sessionStorage.setItem(key, String(now));
  } catch {
    // Storage may be unavailable in hardened/private browser contexts. A single
    // manual retry remains available below, so do not risk an uncontrolled loop.
    return false;
  }
  window.location.reload();
  return true;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-6"><Link to="/" className="qs-button-primary">Go home</Link></div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const recoverable = shouldHardRefresh(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component", recoverable });
    void hardRefreshOnce(error);
  }, [error, recoverable]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end. You can try refreshing or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button"
            onClick={() => {
              if (recoverable && typeof window !== "undefined") {
                window.location.reload();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="qs-button-primary"
          >
            Try again
          </button>
          <a href="/" className="qs-button-secondary">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "QuickServe — QR ordering platform for restaurants" },
      { name: "description", content: "QuickServe is a multi-tenant QR ordering platform: table QR menus, live kitchen display, waiter calls and cashier tools for every restaurant you run." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#e85d2a" },
      { name: "apple-mobile-web-app-title", content: "QuickServe" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: quickServeSystemCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}

function MenuThemeBridgeSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const apply = (value: unknown) => {
      if (!isMenuThemeBridgeMessage(value)) return;
      queryClient.setQueriesData({ queryKey: ["diner"] }, (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const data = current as { restaurant?: { id?: string; menu_theme?: unknown } };
        if (data.restaurant?.id !== value.restaurantId) return current;
        return { ...data, restaurant: { ...data.restaurant, menu_theme: value.theme } };
      });
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      apply(event.data);
    };
    window.addEventListener("message", onMessage);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(MENU_THEME_CHANNEL);
      channel.addEventListener("message", (event) => apply(event.data));
    } catch {
      channel = null;
    }
    return () => {
      window.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, [queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    let syncTimer: number | null = null;
    const scheduleAuthSync = (event: string) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        syncTimer = null;

        // Supabase auth state callbacks run while the auth client holds its own
        // synchronization lock. Starting router loaders or React Query refetches
        // inside that callback can recursively call auth/session APIs and deadlock
        // the client exactly as a user signs in. Always leave the callback first.
        if (event === "SIGNED_OUT") {
          queryClient.removeQueries({ queryKey: ["auth"] });
          queryClient.removeQueries({ queryKey: ["staff"] });
          void router.invalidate();
          return;
        }

        void queryClient.invalidateQueries({ queryKey: ["auth"] });
        void queryClient.invalidateQueries({ queryKey: ["staff"] });

        // /auth performs the SIGNED_IN navigation itself. Avoid racing that
        // transition with a second router.invalidate(). USER_UPDATED, however,
        // needs the current route guards to re-evaluate after profile changes.
        if (event === "USER_UPDATED") void router.invalidate();
      }, 0);
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      scheduleAuthSync(event);
    });
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.auth.getSession().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      if (syncTimer !== null) window.clearTimeout(syncTimer);
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <a href="#main-content" className="sr-only fixed start-3 top-3 z-[200] rounded-lg bg-background px-3 py-2 text-sm font-bold text-foreground shadow-lg focus:not-sr-only">Skip to main content</a>
        <MenuThemeBridgeSync />
        <AppRuntimeMonitor />
        <div id="main-content" tabIndex={-1}>
          <Outlet />
        </div>
        <SplashScreen />
        <NotificationPrompt />
        <Toaster />
      </I18nProvider>
    </QueryClientProvider>
  );
}
