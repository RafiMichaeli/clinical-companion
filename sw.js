/* Service worker — makes the app open without a connection.
   The page itself is network-first: online you always get the latest version
   (and the copy kept for offline is refreshed); offline, or when the network
   takes more than NET_TIMEOUT_MS, the last copy is served.
   Icons and the manifest are cache-first. Bump CACHE when the file list changes
   or when an icon / the manifest changes (otherwise phones keep the old copy). */
"use strict";
const CACHE = "clinical-companion-v2";
const NET_TIMEOUT_MS = 4000;
const PAGE = "./index.html";
const PRECACHE = [
  PAGE,
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("clinical-companion-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPage(req){
  if(req.mode === "navigate") return true;
  const u = new URL(req.url);
  return u.origin === location.origin && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"));
}

async function pageNetworkFirst(req){
  const cache = await caches.open(CACHE);
  const network = fetch(req, { cache: "no-cache" }).then(res => {
    if(res.ok) cache.put(PAGE, res.clone());
    return res;
  });
  network.catch(err => console.warn("[sw] background page refresh failed", err));
  const timeout = new Promise(resolve => setTimeout(resolve, NET_TIMEOUT_MS));
  let res;
  try{
    res = await Promise.race([network, timeout]);
    if(res && res.ok) return res;
  }catch(err){
    console.warn("[sw] network failed, serving cached page", err);
  }
  const cached = await cache.match(PAGE);
  if(cached) return cached;
  return res || network; // nothing cached yet: the network answer (or its error) is all there is
}

async function cacheFirst(req){
  const cached = await caches.match(req);
  if(cached) return cached;
  const res = await fetch(req);
  if(res.ok){ const cache = await caches.open(CACHE); cache.put(req, res.clone()); }
  return res;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith(isPage(req) ? pageNetworkFirst(req) : cacheFirst(req));
});
