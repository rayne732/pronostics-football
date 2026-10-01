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
MAX_PRED = 30                   # 31 requêtes par exécution : 3 exécutions possibles par jour sous la limite de 100
PAUSE = 6.5                     # 10 requêtes par minute maximum
MAX_AGE = 6 * 3600              # un cache plus récent que 6 h est réutilisé (évite de gaspiller le quota)

# (morceau du nom de la compétition, priorité) : les plus suivies d'abord
PRIORITY = [("uefa nations league", 100), ("champions league", 96), ("europa league", 94), ("conference league", 92),
            ("world cup", 90), ("euro championship", 88), ("libertadores", 84), ("sudamericana", 82), ("friendlies", 75),
            ("premier league", 70), ("liga profesional", 66), ("major league soccer", 66), ("liga mx", 66), ("eredivisie", 64),
            ("primeira liga", 64), ("pro league", 62), ("super lig", 62), ("premiership", 60), ("serie b", 56), ("ligue 2", 56),
            ("2. bundesliga", 56), ("segunda", 54), ("copa", 52), ("cup", 50), ("coupe", 50), ("pokal", 50)]


def _prio(f):
    name = f["league"]["name"].lower()
    if "women" in name or "u21" in name or "u19" in name or "u20" in name or "reserve" in name:
        return 5
    for key, score in PRIORITY:
        if key in name:
            return score
    return 20


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
    today = f"{now:%Y-%m-%d}"
    try:
        with open(CACHE, encoding="utf-8") as fh:
            cache = json.load(fh)
        if cache.get("date") == today and time.time() - cache.get("fetched", 0) < MAX_AGE:
            return cache["items"]
    except (FileNotFoundError, ValueError, KeyError):
        pass
    items = []
    try:
        d = _call(key, f"fixtures?date={today}&timezone=Europe/Paris")
        if d.get("errors"):
            print(f"[avertissement] API-Football : {d['errors']}", file=sys.stderr)
            return []
        fixtures = [f for f in d.get("response", []) if f["fixture"]["status"]["short"] in ("NS", "TBD")]
        fixtures.sort(key=lambda f: (-_prio(f), f["fixture"]["date"]))
        for f in fixtures[:MAX_PRED]:
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
        return items
    items.sort(key=lambda x: (-next((_prio({"league": {"name": x["lg"]}}) for _ in [0]), 0), x["time"]))
    os.makedirs("data", exist_ok=True)
    with open(CACHE, "w", encoding="utf-8") as fh:
        json.dump(dict(date=today, fetched=time.time(), items=items), fh, ensure_ascii=False)
    return items
