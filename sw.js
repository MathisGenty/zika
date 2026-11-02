// Service worker : permet à l'app de fonctionner sans connexion.
// Stratégie « réseau d'abord » : quand tu es en ligne, tu as toujours la dernière
// version publiée ; hors ligne, l'app utilise la copie gardée en cache.
// Pas besoin de changer de numéro de version à chaque modif.

const CACHE = "zika-cache-v6";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "sync.js",
  "defis.js",
  "social.js",
  "multi.js",
  "config.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Polices Google et bibliothèque Supabase (version fixe) : cache d'abord
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com") || url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Fichiers de l'app : réseau d'abord, cache en secours
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req, { cache: "no-cache" }).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
  }
});
