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


# autres sports : listes d'équipes ESPN (une requête par ligue, relue toutes les semaines) et clubs de l'EuroLeague
TEAM_FEEDS = {"baseball/mlb": "MLB", "basketball/nba": "NBA", "hockey/nhl": "NHL", "football/nfl": "NFL",
              "rugby/270559": "Top 14", "rugby/267979": "Premiership", "rugby/270557": "URC"}
EUR_CLUBS = "https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/clubs?limit=60"
WEEK = 7 * 86400


def _get(url):
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "pronostics-football"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_teams(m, now_ts):
    """Complète le cache avec les équipes des autres sports (au plus une fois par semaine)."""
    import sys
    if now_ts - (m.get("_ts") or [0])[0] < WEEK:
        return m
    for feed, tag in TEAM_FEEDS.items():
        try:
            data = _get(f"https://site.api.espn.com/apis/site/v2/sports/{feed}/teams?limit=100")
            for t in data["sports"][0]["leagues"][0]["teams"]:
                t = t["team"]
                path = short((t.get("logos") or [{}])[0].get("href"))
                if path:
                    m[norm(t["displayName"])] = [t["displayName"], path, tag]
        except Exception as exc:
            print(f"[avertissement] logos {tag} indisponibles : {exc}", file=sys.stderr)
    try:
        for c in _get(EUR_CLUBS)["data"]:
            crest = (c.get("images") or {}).get("crest")
            if crest:
                m[norm(c["name"])] = [c["name"], crest, "EuroLeague"]
    except Exception as exc:
        print(f"[avertissement] logos EuroLeague indisponibles : {exc}", file=sys.stderr)
    m["_ts"] = [now_ts, "", ""]
    return m


def _read():
    try:
        with open(FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def update(events, now_ts=0):
    """Ajoute les logos vus dans les flux ESPN au cache ; renvoie le cache {nom normalisé: [nom, chemin, compétition]}."""
    m = _read().get("m", {})
    for it in events or []:
        for name, logo in ((it.get("home"), it.get("hl")), (it.get("away"), it.get("al"))):
            if name and logo:
                m[norm(name)] = [name, logo, it.get("slug", "")]
    if now_ts:
        fetch_teams(m, now_ts)
    os.makedirs("data", exist_ok=True)
    with open(FILE, "w", encoding="utf-8") as fh:
        json.dump({"m": m, "lg": _read().get("lg", {})}, fh, ensure_ascii=False, separators=(",", ":"))
    return m


def league_logos(slugs):
    """{compétition ESPN: chemin du logo} ; une requête par compétition nouvelle (au plus 80 par exécution), mémorisée dans data/logos.json."""
    import sys
    from concurrent.futures import ThreadPoolExecutor
    cache = _read()
    lg = cache.get("lg", {})
    todo = sorted(s for s in slugs if s not in lg)[:80]

    def one(slug):
        try:
            d = _get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?limit=1")
            href = (d["leagues"][0].get("logos") or [{}])[0].get("href") or ""
            return slug, (href.split("/i/", 1)[1] if "/i/leaguelogos/" in href else "")
        except Exception as exc:
            print(f"[avertissement] logo de {slug} indisponible : {exc}", file=sys.stderr)
            return slug, None
    with ThreadPoolExecutor(8) as ex:
        for slug, path in ex.map(one, todo):
            if path is not None:
                lg[slug] = path
    if todo:
        cache["lg"] = lg
        os.makedirs("data", exist_ok=True)
        with open(FILE, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
    return {s: lg[s] for s in slugs if lg.get(s)}


# noms complets des clubs que les sources donnent en version courte (liste à compléter au besoin)
MANUAL_FULL = {"HJK": "HJK Helsinki", "VPS": "VPS Vaasa", "KuPS": "KuPS Kuopio", "Ilves": "Ilves Tampere", "SJK": "SJK Seinäjoki", "Gnistan": "IF Gnistan",
               "Jaro": "FF Jaro", "Lahti": "FC Lahti", "Mariehamn": "IFK Mariehamn", "TPS": "TPS Turku"}


def full_names(m, leagues, ext):
    """{nom court de l'appli: nom complet} d'après ESPN et API-Football (le plus long des noms qui désignent la même équipe) ; seulement quand ils diffèrent."""
    from fixtures_api import ESPN_SLUGS, EXT_LEAGUES, to_csv_name
    slug2div = dict(TOP_SLUGS)
    slug2div.update({v: k for k, v in ESPN_SLUGS.items()})
    cand = {}
    for display, path, slug in (v for k, v in m.items() if k != "_ts"):
        div = slug2div.get(slug)
        if div in leagues:
            nm, ok = to_csv_name(display, set(leagues[div]["teams"]))
            if ok:
                cand.setdefault(nm, []).append(display)
    for e in ext or []:
        div = EXT_LEAGUES.get((e.get("country"), e.get("lg")))
        if div in leagues:
            for name in (e["home"], e["away"]):
                nm, ok = to_csv_name(name, set(leagues[div]["teams"]))
                if ok:
                    cand.setdefault(nm, []).append(name)
    out = {}
    for nm, lst in cand.items():
        best = max(lst, key=len)
        if norm(best) != norm(nm):
            out[nm] = best
    for short, full in MANUAL_FULL.items():
        if any(short in lg["teams"] for lg in leagues.values()) and (short not in out or len(full) > len(out[short])):
            out[short] = full
    return out


def logo_pairs(obj, out=None):
    """{nom: logo} pour les éléments qui portent leur propre logo ou drapeau (champs home / hl et away / al)."""
    out = {} if out is None else out
    if isinstance(obj, dict):
        for nk, lk in (("home", "hl"), ("away", "al")):
            if isinstance(obj.get(nk), str) and obj.get(lk):
                out[obj[nk]] = obj[lk]
        for v in obj.values():
            logo_pairs(v, out)
    elif isinstance(obj, list):
        for v in obj:
            logo_pairs(v, out)
    return out


def names_in(obj, out=None):
    """Tous les noms d'équipes (champs « home » / « away ») trouvés dans une structure de données."""
    out = set() if out is None else out
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("home", "away") and isinstance(v, str):
                out.add(v)
            else:
                names_in(v, out)
    elif isinstance(obj, list):
        for v in obj:
            names_in(v, out)
    return out


def build(m, leagues, names):
    """{nom affiché: chemin du logo} pour les noms donnés. `leagues` : {div: {"teams": [...]}} des championnats du CSV."""
    from fixtures_api import ESPN_SLUGS, to_csv_name
    slug2div = dict(TOP_SLUGS)
    slug2div.update({v: k for k, v in ESPN_SLUGS.items()})
    by_slug = {}
    for display, path, slug in (v for k, v in m.items() if k != "_ts"):
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
