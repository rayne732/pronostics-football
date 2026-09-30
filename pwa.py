"""Fichiers qui font du site une application installable (PWA) : icônes, manifeste, service worker.
Les icônes sont dessinées ici (pas de bibliothèque d'images) et écrites en PNG."""
import json
import os
import struct
import zlib

import numpy as np

SW = """const CACHE = 'pronos-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest', 'icons/icon-192.png'])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// réseau d'abord (la page est mise à jour chaque jour), cache en secours hors connexion
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./')))
  );
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
