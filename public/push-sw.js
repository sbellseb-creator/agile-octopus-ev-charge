// Push-only service worker. Deliberately has NO fetch/caching handlers so it
// cannot serve stale app bundles.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Resolve against the worker's scope so it works under any base path (e.g. GitHub Pages /repo/).
const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore */ }
  event.waitUntil(
    self.registration.showNotification(data.title || "Agile rates", {
      body: data.body || "",
      icon: scoped("pwa-192.png"),
      badge: scoped("pwa-192.png"),
      tag: data.tag,
      data: { url: scoped(data.url || "./") },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || scoped("./");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
