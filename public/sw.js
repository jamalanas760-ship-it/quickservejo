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

// Push runs while the installed app is closed. Only open routes on this origin.
function notificationUrl(value) {
  try { const url = new URL(value || "/notifications", self.location.origin); return url.origin === self.location.origin ? url.href : self.location.origin + "/notifications"; }
  catch { return self.location.origin + "/notifications"; }
}
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* still display a safe fallback */ }
  event.waitUntil(self.registration.showNotification(String(data.title || "QuickServe update").slice(0, 160), {
    body: String(data.body || "Open QuickServe to see your latest updates.").slice(0, 500),
    icon: "/icon-192.png", badge: "/icon-192.png", tag: String(data.tag || "quickserve-update"),
    data: { url: notificationUrl(data.url) },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = notificationUrl(event.notification.data?.url);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(c => new URL(c.url).origin === self.location.origin);
    if (client) { await client.navigate(url); await client.focus(); }
    else await self.clients.openWindow(url);
  }));
});
