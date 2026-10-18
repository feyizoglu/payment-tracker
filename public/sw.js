// Take over pages already open when the worker first installs, so a notification click
// can reuse them.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
