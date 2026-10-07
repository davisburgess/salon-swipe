// Offline support. The app shell is cached on install; artwork images are cached as you see them
// (newest 300 kept); museum API calls always go to the network so you get fresh works.
const VERSION = "pp-0.2.0-alpha";
const SHELL = ["./", "./index.html", "./app.css", "./manifest.webmanifest", "./privacy.html",
  "./js/app.js", "./js/util.js", "./js/curation.js", "./js/sources.js", "./js/model.js", "./js/deck.js",
  "./js/store.js", "./js/rewards.js", "./js/sync.js", "./js/vision.js", "./js/config.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
const IMG = `${VERSION}-img`, MAX_IMG = 300;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isImage = (u) => /\/iiif\/|images\.metmuseum\.org|openaccess-cdn\.clevelandart\.org|framemark\.vam\.ac\.uk|iip(-thumb)?\.smk\.dk|api\.smk\.dk\/api\/v1\/thumbnail|upload\.wikimedia\.org|Special:FilePath|\.(jpe?g|png|webp)(\?|$)/i.test(u.href);
const isFont = (u) => u.hostname === "fonts.gstatic.com" || u.hostname === "fonts.googleapis.com";

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.endsWith("/api.json")) return;   // always fresh
    // Shell: network first so updates land immediately, cache as fallback for offline.
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then((m) => m || caches.match("./index.html"))));
    return;
  }
  if (isFont(u)) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; })));
    return;
  }
  // Only plain image loads are cached; cross-origin reads (used to measure color) go straight to the network.
  if (isImage(u) && req.mode === "no-cors") {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok || r.type === "opaque") { c.put(req, r.clone()); trim(IMG, MAX_IMG); }
      return r;
    }));
  }
});
