const CACHE_NAME = "ai-assistant-v2";

const PRECACHE_URLS = ["/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Network-first for API calls, server actions, app navigations, and RSC refreshes.
  // The web board mutates server state; cached /app or ?_rsc responses can replay
  // stale item statuses after actions like Complete.
  if (
    url.pathname.startsWith("/api/") ||
    event.request.method !== "GET" ||
    url.pathname.startsWith("/_next/data/") ||
    url.searchParams.has("_rsc") ||
    event.request.mode === "navigate" ||
    url.pathname.startsWith("/app")
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json"
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// --- Push Notification Handlers ---

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "AI Assistant", body: event.data?.text() ?? "New notification" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "AI Assistant", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "checkin",
      data: { url: data.url || "/app/my-day" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/my-day";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/app") && "focus" in client) {
          return client.focus().then((c) => c.navigate(url));
        }
      }
      return clients.openWindow(url);
    })
  );
});
