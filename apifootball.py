"""Matchs du jour de toutes les compétitions avec les prédictions d'API-Football (clé gratuite : API_FOOTBALL_KEY).
Offre gratuite : 100 requêtes/jour, 10 par minute, accès seulement à hier, avant-hier et aujourd'hui (pas au futur).
On fait donc 1 requête pour la liste du jour + 1 par match choisi (les compétitions les plus suivies d'abord).
Ce n'est PAS notre modèle : ces prédictions ne sont pas validées par nos backtests."""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime

BASE = "https://v3.football.api-sports.io/"
CACHE = "data/apif_cache.json"
MAX_PRED = 60                   # prédictions demandées par rafraîchissement (1 par match) ; limite de 100 requêtes par jour
PAUSE = 6.5                     # 10 requêtes par minute maximum
MAX_AGE = 20 * 3600             # un cache plus récent que 20 h est réutilisé : un seul rafraîchissement par jour (quota)
FILL = 30                       # on complète avec d'autres compétitions jusqu'à ce total si les compétitions suivies sont peu nombreuses

# (morceau du nom de la compétition, priorité) : les plus suivies d'abord
PRIORITY = [("uefa nations league", 100), ("champions league", 96), ("europa league", 94), ("conference league", 92),
            ("world cup", 90), ("euro championship", 88), ("libertadores", 84), ("sudamericana", 82), ("friendlies", 75),
            ("premier league", 70), ("liga profesional", 66), ("major league soccer", 66), ("liga mx", 66), ("eredivisie", 64),
            ("primeira liga", 64), ("pro league", 62), ("super lig", 62), ("premiership", 60), ("serie b", 56), ("ligue 2", 56),
            ("2. bundesliga", 56), ("segunda", 54), ("copa", 52), ("cup", 50), ("coupe", 50), ("pokal", 50)]


# Compétitions choisies par l'utilisateur : toujours affichées dès qu'un match a lieu (identifiants API-Football)
WANTED_IDS = {
    2, 3, 848, 1, 4, 5, 10, 13, 11, 536,                                  # Ligue des Champions, Europa, Conférence, Coupe du Monde, Euro, Ligue des Nations, amicaux, Libertadores, Sudamericana, CONCACAF
    39, 40, 45, 48, 179, 181, 185, 110, 408, 357,                          # Angleterre (PL, Championship, FA Cup, EFL Cup), Écosse, Pays de Galles, Irlande du Nord, Irlande
    78, 79, 81, 61, 62, 66, 64, 135, 136, 137, 140, 141, 143,              # Allemagne, France (+ D1 féminine), Italie, Espagne
    88, 94, 95, 144, 203, 307, 253, 262, 98, 292, 188, 73, 200, 479,       # Pays-Bas, Portugal, Belgique, Turquie, Arabie, MLS, Mexique, Japon, Corée, Australie, Brésil, Maroc, Canada
    103, 113, 119, 106, 345, 332, 271, 210, 244, 329, 218, 172, 286, 283, 207, 197,   # Norvège, Suède, Danemark, Pologne, Tchéquie, Slovaquie, Hongrie, Croatie, Finlande, Estonie, Biélorussie, Bulgarie, Serbie, Roumanie, Suisse, Grèce
    128, 242, 239,                                                         # Argentine, Équateur, Colombie
    525, 8,                                                                # Ligue des Champions féminine, Coupe du Monde féminine
}
WANTED_NAMES = ("world cup", "super league", "first division", "primera division", "premier division", "primera a", "pro league",
                "nations league", "euro championship")


def wanted(f):
    lg = f["league"]
    name = lg["name"].lower()
    if lg.get("id") in WANTED_IDS:
        return True
    if "u21" in name and "qualif" in name:
        return True
    if "friendl" in name:                                  # amicaux de jeunes (U17 à U23) : tous gardés
        t = f.get("teams") or {}
        if any(re.search(r"(^|\s)U-?(1[5-9]|2[0-3])($|\s)", (t.get(k) or {}).get("name", "")) for k in ("home", "away")):
            return True
    return any(k in name for k in WANTED_NAMES)


def _prio(f):
    name = f["league"]["name"].lower()
    if "women" in name or "u21" in name or "u19" in name or "u20" in name or "reserve" in name:
        return 5
    for key, score in PRIORITY:
        if key in name:
            return score
    return 20


def _paris_today(now):
    from datetime import timezone
    from tennis import paris
    return paris(datetime.fromtimestamp(now.timestamp(), timezone.utc).replace(tzinfo=None)).date()


def _call(key, path):
    req = urllib.request.Request(BASE + path, headers={"x-apisports-key": key})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def _pc(x):
    try:
        return int(str(x).replace("%", "").strip()) / 100
    except (TypeError, ValueError):
        return None


def fr_advice(s):
    """Traduit le conseil d'API-Football (anglais) quand le motif est connu ; sinon le texte d'origine."""
    if not s:
        return ""
    t = s.replace("Combo ", "")
    m = re.match(r"^(Double chance|Winner) : (.+?)(?: and ([+-]\d+\.?\d*) goals)?$", t)
    if m:
        kind, what, goals = m.groups()
        if kind == "Double chance":
            what = what.replace(" or ", " ou ").replace("draw", "nul")
        out = ("Double chance : " if kind == "Double chance" else "Vainqueur : ") + what
        if goals:
            out += " et " + ("plus" if goals[0] == "+" else "moins") + " de " + goals[1:].replace(".", ",") + " buts"
        return out
    m = re.match(r"^([+-])(\d+\.?\d*) goals$", t)
    if m:
        return ("Plus" if m.group(1) == "+" else "Moins") + " de " + m.group(2).replace(".", ",") + " buts"
    return s


def _uo(v):
    if not v:
        return ""
    m = re.match(r"([+-])(\d+\.?\d*)", str(v))
    return (("Plus" if m.group(1) == "+" else "Moins") + " de " + m.group(2).replace(".", ",") + " buts") if m else ""


def _pair(c, k):
    try:
        return [_pc(c[k]["home"]), _pc(c[k]["away"])]
    except (KeyError, TypeError):
        return [None, None]


def _normalize(fx, pred):
    p = pred["predictions"]
    pc = p.get("percent") or {}
    cmp_ = pred.get("comparison") or {}
    h2h = []
    for m in (pred.get("h2h") or [])[:5]:
        try:
            h2h.append([m["fixture"]["date"][:10], f'{m["teams"]["home"]["name"]} {m["goals"]["home"]}-{m["goals"]["away"]} {m["teams"]["away"]["name"]}'])
        except (KeyError, TypeError):
            pass
    return dict(id=fx["fixture"]["id"], lg=fx["league"]["name"], country=fx["league"].get("country", ""), round=fx["league"].get("round", ""),
                date=fx["fixture"]["date"][:10], time=fx["fixture"]["date"][11:16], home=fx["teams"]["home"]["name"], away=fx["teams"]["away"]["name"],
                p=[_pc(pc.get("home")) or 0, _pc(pc.get("draw")) or 0, _pc(pc.get("away")) or 0],
                advice=fr_advice(p.get("advice")), uo=_uo(p.get("under_over")),
                cmp={k: _pair(cmp_, k) for k in ("form", "att", "def", "h2h", "total")}, h2h=h2h)


def external_matches(now, key=None):
    """Matchs du jour (date de Paris) des compétitions les plus suivies, avec prédictions. [] si pas de clé ou erreur."""
    key = key or os.environ.get("API_FOOTBALL_KEY")
    if not key:
        return []
    today = f"{_paris_today(now):%Y-%m-%d}"          # date de Paris (le serveur GitHub est en UTC : après 22 h il a un jour de retard)
    stale = []                      # cache du jour, plus ancien : sert de secours si l'API refuse (limite quotidienne atteinte)
    try:
        with open(CACHE, encoding="utf-8") as fh:
            cache = json.load(fh)
        if cache.get("date") == today:
            if time.time() - cache.get("fetched", 0) < MAX_AGE:
                return cache["items"]
            stale = cache.get("items", [])
    except (FileNotFoundError, ValueError, KeyError):
        pass
    items = []
    try:
        d = _call(key, f"fixtures?date={today}&timezone=Europe/Paris")
        if d.get("errors"):
            print(f"[avertissement] API-Football : {d['errors']}", file=sys.stderr)
            return stale
        fixtures = [f for f in d.get("response", []) if f["fixture"]["status"]["short"] in ("NS", "TBD")]
        fixtures.sort(key=lambda f: (not wanted(f), -_prio(f), f["fixture"]["date"]))
        n_wanted = sum(1 for f in fixtures if wanted(f))
        chosen = fixtures[:min(MAX_PRED, max(n_wanted, FILL))]
        print("[info] API-Football : compétitions retenues :", sorted({f"{f['league']['name']} ({f['league'].get('country', '')}, id {f['league'].get('id')})" for f in chosen}), file=sys.stderr)
        for f in chosen:
            time.sleep(PAUSE)
            try:
                r = _call(key, f"predictions?fixture={f['fixture']['id']}")
            except Exception as exc:
                print(f"[avertissement] prédiction {f['fixture']['id']} indisponible : {exc}", file=sys.stderr)
                continue
            if r.get("errors") or not r.get("response"):
                if r.get("errors"):
                    print(f"[avertissement] API-Football : {r['errors']}", file=sys.stderr)
                    if "rateLimit" in json.dumps(r["errors"]) or "limit" in json.dumps(r["errors"]).lower():
                        break
                continue
            items.append(_normalize(f, r["response"][0]))
    except Exception as exc:
        print(f"[avertissement] API-Football indisponible : {exc}", file=sys.stderr)
        return items or stale
    if len(items) < len(stale):     # rafraîchissement incomplet (limite atteinte) : on garde le cache complet
        return stale
    items.sort(key=lambda x: (-next((_prio({"league": {"name": x["lg"]}}) for _ in [0]), 0), x["time"]))
    os.makedirs("data", exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as fh:
        json.dump(dict(date=today, fetched=time.time(), items=items), fh, ensure_ascii=False)
    return items
