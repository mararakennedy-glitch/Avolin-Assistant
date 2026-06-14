// Avolin Service Worker — minimal, safe, install-only.
// Goal: be installable as a PWA and provide a tiny offline fallback shell.
// We deliberately AVOID caching API responses so chat / image / TTS always hit
// the network and you never see stale answers.
//
// IMPORTANT: bump CACHE_VERSION any time the upgrade flow, payment flow, or
// other critical client logic changes — this purges old script bundles that
// installed PWAs may still be running. v3 below clears the legacy Stripe-era
// bundle that was triggering "Stripe price for CORE not found" alerts.

const CACHE_VERSION = "avolin-shell-20260428173851";
const SHELL_ASSETS = [
  "/",
  "/favicon.svg",
  "/icon-192.svg",
  "/icon-512.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {
        // Best-effort: keep install successful even if a single asset fails.
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(async () => {
        // Tell every open page to reload once, so they pick up the fresh
        // JS bundle instead of running the stale code that was loaded
        // before this new SW took control.
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "AVOLIN_SW_UPDATED" });
        }
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls — always go to network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/__")) return;

  // Network-first for navigations (HTML), fall back to cached "/" if offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/").then((m) => m || new Response("Avolin is offline", { status: 503 })))
    );
    return;
  }

  // Network-first for scripts and styles so a freshly-deployed bundle
  // always wins. We still fall back to cache when offline.
  if (request.destination === "script" || request.destination === "style") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(request).then((m) => m || Response.error()))
    );
    return;
  }

  // Cache-first for static images / fonts (safe: they have stable URLs).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && (request.destination === "image" || request.destination === "font")) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || Response.error());
    })
  );
});
