// Games are meant to work offline. The games pages fill GAMES_CACHE themselves (see
// src/lib/games-offline.ts) and this worker only reads it; every other request goes
// straight to the network as before.
const GAMES_CACHE = "games-v2";
const GAMES_PAGES = ["/games", "/games/imposter", "/games/word"];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Take over pages already open when the worker first installs, so a notification click
// can reuse them. Old games caches are dropped when GAMES_CACHE is bumped.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("games-") && k !== GAMES_CACHE).map((k) => caches.delete(k)))
      )
      .catch(() => {})
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "PayTrack", {
      body: data.body,
      icon: "/icons/icon-192.png",
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === target) || windows[0];
      if (!open) return self.clients.openWindow(target);
      if (open.url === target) return open.focus();
      // navigate() rejects on a tab this worker does not control yet; open a new one then.
      return open
        .navigate(target)
        .then((w) => (w || open).focus())
        .catch(() => self.clients.openWindow(target));
    })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && GAMES_PAGES.includes(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(url.pathname).then((hit) => hit || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
  }
});
