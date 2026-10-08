"""Fichiers qui font du site une application installable (PWA) : icônes, manifeste, service worker.
Les icônes sont dessinées ici (pas de bibliothèque d'images) et écrites en PNG."""
import json
import os
import struct
import zlib

import numpy as np

SW = r"""const CACHE = 'pronos-v2', IMG = 'pronos-img-v1', MAX_IMG = 800;
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icons/icon-192.png'])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== IMG).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_IMG; i++) await cache.delete(keys[i]);
}
// images (logos, drapeaux) : d'abord le cache (affichage immédiat, même hors connexion), mise à jour en arrière-plan
async function image(req) {
  const cache = await caches.open(IMG), hit = await cache.match(req);
  const net = fetch(req, { mode: 'no-cors' }).then((r) => { cache.put(req, r.clone()).then(() => trim(cache)); return r; }).catch(() => hit);
  return hit || net;
}
// fichiers de données versionnés (data/xxx.json?v=...) : le numéro change à chaque mise à jour, donc le cache est sûr et la page s'ouvre sans attendre le réseau
async function versioned(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  cache.put(req, r.clone()).then(async () => {                         // on supprime les anciennes versions du même fichier (sinon le cache grossit à chaque mise à jour)
    const path = new URL(req.url).pathname;
    for (const k of await cache.keys()) if (k.url !== req.url && new URL(k.url).pathname === path) await cache.delete(k);
  });
  return r;
}
// page et reste : réseau d'abord (elle est mise à jour toute la journée) avec 4 s de patience, puis la dernière copie
function pageFirst(req) {
  return new Promise((resolve) => {
    let done = false;
    const fromCache = () => caches.match(req).then((r) => r || caches.match('./'));
    const t = setTimeout(() => { if (!done) fromCache().then((r) => { if (r && !done) { done = true; resolve(r); } }); }, 4000);
    fetch(req).then((r) => { clearTimeout(t); if (!done) { done = true; resolve(r.clone()); } caches.open(CACHE).then((c) => c.put(req, r)); })
      .catch(() => { clearTimeout(t); if (!done) { done = true; fromCache().then(resolve); } });
  });
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'a.espncdn.com' && /\.(png|jpg|svg)|combiner/.test(url.pathname + url.search) || url.hostname === 'media-cdn.cortextech.io' || url.hostname === 'media.api-sports.io') { if (req.mode === 'no-cors') e.respondWith(image(req)); return; }       // les requêtes « cors » (image du partage) passent sans interception
  if (url.origin !== location.origin) return;                          // API en direct (ESPN, ntfy) : jamais mise en cache
  if (url.pathname.indexOf('/data/') >= 0 && url.search.indexOf('v=') >= 0) { e.respondWith(versioned(req)); return; }
  e.respondWith(pageFirst(req));
});
"""

MANIFEST = {
    "name": "Pronostics football", "short_name": "Pronos", "description": "Probabilités et pronostics de 6 championnats de football.",
    "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait", "lang": "fr",
    "background_color": "#070b18", "theme_color": "#070b18",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}


def _png(a):
    h, w, _ = a.shape
    raw = b"".join(b"\x00" + a[y].tobytes() for y in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def icon(n, maskable=False):
    """Carré sombre, deux anneaux et un point ambre (même logo que l'en-tête de la page)."""
    S = n * 2                                               # dessiné en double résolution puis réduit (anti-crénelage)
    yy, xx = np.mgrid[0:S, 0:S]
    u, v = (xx + 0.5) / S, (yy + 0.5) / S
    t = ((u + v) / 2)[..., None]
    rgb = np.array([11, 16, 32]) * (1 - t) + np.array([30, 40, 74]) * t
    r = np.hypot(u - 0.5, v - 0.5)
    k = 0.78 if maskable else 1.0                           # zone de sécurité des icônes « maskable »
    ring = lambda radius, width, col, alpha: np.where((np.abs(r - radius * k) < width * k)[..., None], np.array(col) * alpha + rgb * (1 - alpha), rgb)
    rgb = ring(0.30, 0.032, [238, 241, 250], 1.0)
    r2 = np.abs(r - 0.17 * k) < 0.028 * k
    rgb = np.where(r2[..., None], np.array([238, 241, 250]) * 0.6 + rgb * 0.4, rgb)
    rgb = np.where((r < 0.066 * k)[..., None], np.array([247, 176, 61]), rgb)
    alpha = np.ones((S, S))
    if not maskable:                                        # coins arrondis
        q = np.abs(np.stack([u - 0.5, v - 0.5], -1)) - (0.5 - 0.21)
        d = np.hypot(np.maximum(q[..., 0], 0), np.maximum(q[..., 1], 0)) + np.minimum(np.maximum(q[..., 0], q[..., 1]), 0) - 0.21
        alpha = (d <= 0).astype(float)
    img = np.dstack([rgb, alpha * 255])
    img = img.reshape(n, 2, n, 2, 4).mean(axis=(1, 3))      # moyenne 2x2
    return np.clip(img, 0, 255).astype(np.uint8)


def write_site(out_dir):
    os.makedirs(os.path.join(out_dir, "icons"), exist_ok=True)
    with open(os.path.join(out_dir, "manifest.webmanifest"), "w", encoding="utf-8") as fh:
        json.dump(MANIFEST, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(out_dir, "sw.js"), "w", encoding="utf-8") as fh:
        fh.write(SW)
    for name, n, m in (("icon-192.png", 192, False), ("icon-512.png", 512, False), ("maskable-512.png", 512, True), ("apple-touch-icon.png", 180, False)):
        with open(os.path.join(out_dir, "icons", name), "wb") as fh:
            fh.write(_png(icon(n, m)))
