/* Service Worker — Créditos a tu medida (PWA + Web Push) */
const CACHE = "creditos-v2";
const PRECACHE = ["/", "/crm", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/badge-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia: red primero, cache como fallback (para que el CRM siempre esté fresco).
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});

// --- Web Push ---
self.addEventListener("push", (event) => {
  let data = { title: "Nuevo lead", body: "Tienes un nuevo lead en el CRM", url: "/crm", badge: 1 };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* payload no JSON */
  }
  event.waitUntil(
    (async () => {
      // Actualizar el badge numérico del ícono con el conteo de leads.
      try {
        if (typeof self.registration.setAppBadge === "function") {
          await self.registration.setAppBadge(Number(data.badge) || 1);
        }
      } catch {
        /* badge no soportado (iOS) */
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon-192.png",
        badge: "/badge-192.png",
        data: { url: data.url || "/crm" },
        vibrate: [200, 100, 200],
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/crm";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
