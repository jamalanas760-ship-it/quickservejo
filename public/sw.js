const CACHE = "quickserve-runtime-v6";
const OFFLINE_PAGE = "/offline.html";
const STATIC_SHELL = [OFFLINE_PAGE, "/manifest.webmanifest", "/favicon.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

function cacheableAsset(response, destination) {
  if (!response.ok || response.type === "opaque") return false;
  const contentType = response.headers.get("content-type") || "";
  if (destination === "script") return /javascript|ecmascript/.test(contentType);
  if (destination === "style") return /text\/css/.test(contentType);
  if (destination === "font") return /font|application\/octet-stream/.test(contentType);
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Never cache server-rendered HTML. A cached document can reference a route
    // graph from an older deployment and cause hydration/chunk mismatches.
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_PAGE)) || Response.error()));
    return;
  }

  // Hashed application assets are immutable. Validate the content type before
  // caching so a transient HTML error response can never be stored as JS/CSS.
  if (["script", "style", "font"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then(async (response) => {
          if (cacheableAsset(response, request.destination)) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        });
      }),
    );
  }
});
