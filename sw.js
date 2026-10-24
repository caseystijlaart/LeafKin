// LeafKin service worker: caches the app shell so it opens offline.
// Bump VERSION whenever app files change, so phones pick up the new version.
// The test copy at /beta/ has its own worker and caches; the live worker leaves /beta/ alone.
const BETA = self.location.pathname.includes("/beta/");
const VERSION = (BETA ? "leafkin-beta-" : "leafkin-") + "v2.2.0";
const mine = (k) => k.startsWith("leafkin-beta-") === BETA; // only clean up our own old caches
// The photo check's model and runtime (25 MB) are cached on first use, separately from the app files, so app
// updates don't download them again. Change ML_VERSION when models/ or js/vendor/ort/ change.
const ML_VERSION = "2026-10-24c";
const ML_CACHE = (BETA ? "leafkin-beta-" : "leafkin-") + "ml-" + ML_VERSION;
const isML = (url) => /\/(models|js\/vendor\/ort)\//.test(url.pathname);
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./css/fonts.css",
  "./fonts/bricolage-grotesque.woff2",
  "./fonts/atkinson-hyperlegible-400.woff2",
  "./fonts/atkinson-hyperlegible-700.woff2",
  "./fonts/jetbrains-mono-500.woff2",
  "./js/app.js",
  "./js/db.js",
  "./js/util.js",
  "./js/care-library.js",
  "./js/plant-data.js",
  "./js/config.js",
  "./js/plantnet.js",
  "./js/health.js",
  "./js/conditions.js",
  "./js/schedule.js",
  "./js/sync.js",
  "./js/cloud.js",
  "./js/push.js",
  "./js/privacy.js",
  "./js/diagnose.js",
  "./js/vendor/supabase.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

// New versions take over straight away; the page reloads itself once (see app.js).
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => mine(k) && !k.startsWith(VERSION) && k !== ML_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks a waiting worker to take over when the user taps "Update".
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!BETA && url.pathname.includes("/beta/")) return; // the beta has its own worker

  // Page loads: try the network first so updates show quickly, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  // Photo check model and runtime: cache on first use.
  if (url.origin === self.location.origin && isML(url)) {
    event.respondWith(caches.open(ML_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Same-origin files: cache first.
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

});

// Daily reminder from the send-reminders Edge Function.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || "LeafKin";
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: data.body || "Some plants need care today.",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "leafkin-daily",
      data: { url: data.url || "./" },
    }),
    data.count && self.navigator?.setAppBadge ? self.navigator.setAppBadge(data.count).catch(() => {}) : null,
  ]));
});

// Tapping the notification opens LeafKin (or brings it to the front).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow(target);
  }));
});
