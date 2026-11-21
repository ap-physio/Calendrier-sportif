/* Cache hors-ligne simple : le site s'ouvre et les fiches/GPX déjà consultés restent lisibles sans réseau. */
const CACHE = "courses-v13";
const BASE = ["./", "index.html", "assets/app.css", "assets/app.js", "assets/form.js", "assets/db.js", "assets/config.js", "assets/supabase/supabase.js", "assets/leaflet/leaflet.css", "assets/leaflet/leaflet.js", "manifest.webmanifest", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    // Réseau d'abord (données toujours à jour), cache si hors-ligne
    // no-cache : toujours revérifier auprès du serveur (sinon le navigateur garde l'ancienne version jusqu'à 10 min)
    const req = e.request.mode === "navigate" ? e.request : new Request(e.request, { cache: "no-cache" });
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
  } else if (/tile|arcgisonline/.test(url.hostname + url.pathname)) {
    // Tuiles de carte : cache d'abord
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
  }
});
