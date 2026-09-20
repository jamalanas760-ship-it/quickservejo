const CACHE = "quickserve-shell-v5";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.png", "/icon-192.png", "/icon-512.png"];
const PUBLIC_NAVIGATION_PREFIXES = ["/r/", "/m/", "/o/", "/preview/"];
const PUBLIC_NAVIGATION_PATHS = new Set(["/", "/contact", "/privacy", "/terms"]);

function isPublicNavigation(pathname) {
  return PUBLIC_NAVIGATION_PATHS.has(pathname) || PUBLIC_NAVIGATION_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Authenticated/operational pages are always network-only. Caching their HTML
    // can expose stale or user-specific state on shared restaurant devices.
    if (!isPublicNavigation(url.pathname)) return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  // Only immutable/static browser assets use cache-first behavior.
  if (["script", "style", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
            }
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      }),
    );
  }
});
