"""Logos des équipes (football) : ESPN fournit l'écusson de chaque équipe (ou le drapeau d'une sélection) dans ses flux de matchs.
On garde dans data/logos.json « nom ESPN -> fichier du logo », puis on relie chaque nom affiché dans l'appli (noms du CSV, d'ESPN, d'API-Football) à son logo."""
import json
import os
import re
import unicodedata

FILE = os.path.join("data", "logos.json")
PREFIX = "https://a.espncdn.com/i/teamlogos/"
TOP_SLUGS = {"eng.1": "E0", "eng.2": "E1", "esp.1": "SP1", "ger.1": "D1", "ita.1": "I1", "fra.1": "F1", "bra.1": "BRA"}


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def short(url):
    """URL ESPN d'un logo -> chemin court (« soccer/500/359.png ») ; None si ce n'est pas un vrai logo (image par défaut, autre hébergeur)."""
    if url and url.startswith(PREFIX) and url.endswith(".png"):
        return url[len(PREFIX):]
    return None


def _read():
    try:
        with open(FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def update(events):
    """Ajoute les logos vus dans les flux ESPN au cache ; renvoie le cache {nom normalisé: [nom, chemin, compétition]}."""
    m = _read().get("m", {})
    for it in events or []:
        for name, logo in ((it.get("home"), it.get("hl")), (it.get("away"), it.get("al"))):
            if name and logo:
                m[norm(name)] = [name, logo, it.get("slug", "")]
    os.makedirs("data", exist_ok=True)
    with open(FILE, "w", encoding="utf-8") as fh:
        json.dump({"m": m}, fh, ensure_ascii=False, separators=(",", ":"))
    return m


def build(m, leagues, names):
    """{nom affiché: chemin du logo} pour les noms donnés. `leagues` : {div: {"teams": [...]}} des championnats du CSV."""
    from fixtures_api import ESPN_SLUGS, to_csv_name
    slug2div = dict(TOP_SLUGS)
    slug2div.update({v: k for k, v in ESPN_SLUGS.items()})
    by_slug = {}
    for display, path, slug in m.values():
        by_slug.setdefault(slug, []).append((display, path))
    csvmap = {}
    for slug, div in slug2div.items():
        if div not in leagues:
            continue
        known = set(leagues[div]["teams"])
        for display, path in by_slug.get(slug, []):
            nm, ok = to_csv_name(display, known)
            if ok:
                csvmap[(div, nm)] = path
    flat = {}
    for (div, nm), path in csvmap.items():
        flat.setdefault(nm, path)
    out = {}
    for name in names:
        path = flat.get(name) or (m.get(norm(name)) or [None, None])[1]
        if path:
            out[name] = path
    return out
