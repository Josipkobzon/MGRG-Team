// ═══════════════════════════════════════════════════════════════════
// Service Worker — Offline-Cache + Android-Share-Target
// Bei jeder Änderung an App-Dateien VERSION erhöhen → Nutzer bekommen
// beim nächsten Start den Hinweis "Neue Version verfügbar".
// ═══════════════════════════════════════════════════════════════════
const VERSION = "1.0.3";
const CACHE = "mgwp-app-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/core.js",
  "./js/bp-import.js",
  "./js/plan.js",
  "./js/crypto.js",
  "./js/store.js",
  "./js/icons.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("mgwp-app-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // fremde Links (Karten, tel:) nicht anfassen

  // Android: Datei wurde per "Teilen" an die App geschickt
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get("plan");
        if (file && typeof file.text === "function") {
          const cache = await caches.open("mgwp-share");
          await cache.put("shared-file", new Response(await file.text(), {
            headers: { "content-type": "application/json", "x-filename": encodeURIComponent(file.name || "Plan.json") },
          }));
        }
      } catch (err) { /* ignorieren */ }
      return Response.redirect(new URL("./?share=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== "GET") return;

  // App-Shell: Cache zuerst, Netz als Fallback (offline-fähig)
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const isNav = e.request.mode === "navigate";
    const hit = await cache.match(isNav ? "./index.html" : e.request, { ignoreSearch: isNav });
    if (hit) return hit;
    try {
      return await fetch(e.request);
    } catch (err) {
      if (isNav) return (await cache.match("./")) || Response.error();
      return Response.error();
    }
  })());
});
