"""Cotes réelles des bookmakers (The Odds API, offre gratuite : ~500 requêtes par mois ; clé : ODDS_API_KEY).
Une requête par championnat qui a des matchs dans les ~36 prochaines heures, au plus une fois toutes les CACHE_H heures,
avec un garde-fou sur le quota. Tout est facultatif : sans clé, sans réseau ou quota épuisé, le site fonctionne comme avant."""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

CACHE = "data/odds_cache.json"
CACHE_H = 10                       # une ligne de cotes est redemandée au plus toutes les 10 h
MAX_CALLS = 8                      # championnats demandés par exécution
MIN_REMAINING = 60                 # en dessous, on ne demande plus rien (le quota mensuel est de 500)
HORIZON_H = 36
FR_BOOKS = ("winamax_fr", "betclic_fr", "unibet_fr", "pmu_fr")
SPORT = {"F1": "soccer_france_ligue_one", "E0": "soccer_epl", "SP1": "soccer_spain_la_liga", "D1": "soccer_germany_bundesliga",
         "I1": "soccer_italy_serie_a", "E1": "soccer_efl_champ", "BRA": "soccer_brazil_campeonato", "F2": "soccer_france_ligue_two",
         "D2": "soccer_germany_bundesliga2", "I2": "soccer_italy_serie_b", "SP2": "soccer_spain_segunda_division", "N1": "soccer_netherlands_eredivisie",
         "B1": "soccer_belgium_first_div", "P1": "soccer_portugal_primeira_liga", "T1": "soccer_turkey_super_league", "G1": "soccer_greece_super_league",
         "SC0": "soccer_spl", "USA": "soccer_usa_mls", "MEX": "soccer_mexico_ligamx", "ARG": "soccer_argentina_primera_division",
         "JPN": "soccer_japan_j_league", "NOR": "soccer_norway_eliteserien", "SWE": "soccer_sweden_allsvenskan", "DNK": "soccer_denmark_superliga",
         "POL": "soccer_poland_ekstraklasa", "FIN": "soccer_finland_veikkausliiga", "IRL": "soccer_league_of_ireland", "SWZ": "soccer_switzerland_superleague"}


def _load():
    try:
        with open(CACHE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(fc|cf|ac|as|sc|ssc|afc|sv|vfl|vfb|fsv|tsg|rb|1\.|us|ud|cd|ca|ec|se|sd|calcio|club|de|del|the)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _sim(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0.0
    if a == b or a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _event(e):
    """Événement The Odds API -> { h, a, t, k: {bookmaker: [dom, nul, ext]}, m: moyenne, b: meilleure } ; None s'il n'y a aucune cote."""
    per = {}
    for bk in e.get("bookmakers", []):
        for mk in bk.get("markets", []):
            if mk.get("key") != "h2h":
                continue
            o = {x["name"]: x["price"] for x in mk.get("outcomes", [])}
            if e["home_team"] in o and e["away_team"] in o and "Draw" in o:
                per[bk["key"]] = [o[e["home_team"]], o["Draw"], o[e["away_team"]]]
    if not per:
        return None
    cols = list(zip(*per.values()))
    return dict(h=e["home_team"], a=e["away_team"], t=e["commence_time"], n=len(per),
                m=[round(sum(c) / len(c), 3) for c in cols], b=[max(c) for c in cols], k={b: v for b, v in per.items() if b in FR_BOOKS})


def _fetch(key, sport):
    url = f"https://api.the-odds-api.com/v4/sports/{sport}/odds?regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso&apiKey={key}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.load(resp)
        return data, resp.headers.get("x-requests-remaining")


def refresh(fixtures, now=None):
    """Met à jour data/odds_cache.json pour les championnats qui ont des matchs bientôt. Ne lève jamais d'exception."""
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        return
    now = now or datetime.now()
    cache = _load()
    soon = {}
    for r in fixtures:
        try:
            d = r["Date"]
            if now - timedelta(hours=3) <= d <= now + timedelta(hours=HORIZON_H) and r["Div"] in SPORT:
                soon[r["Div"]] = soon.get(r["Div"], 0) + 1
        except Exception:
            continue
    calls = 0
    for div in sorted(soon, key=lambda x: -soon[x]):
        ent = cache.get(div) or {}
        if time.time() - ent.get("fetched", 0) < CACHE_H * 3600:
            continue
        if calls >= MAX_CALLS:
            break
        try:
            data, remaining = _fetch(key, SPORT[div])
        except Exception as exc:
            print(f"[avertissement] cotes {div} indisponibles : {exc}", file=sys.stderr)
            continue
        calls += 1
        cache[div] = dict(fetched=time.time(), events=[x for x in (_event(e) for e in data) if x])
        print(f"Cotes {div} : {len(cache[div]['events'])} matchs (quota restant {remaining}).", file=sys.stderr)
        if remaining is not None and int(remaining) < MIN_REMAINING:
            print("[avertissement] quota The Odds API presque épuisé : plus de demandes ce mois-ci.", file=sys.stderr)
            break
    if calls:
        try:
            with open(CACHE, "w", encoding="utf-8") as fh:
                json.dump(cache, fh, ensure_ascii=False, separators=(",", ":"))
        except OSError as exc:
            print(f"[avertissement] cache des cotes non écrit : {exc}", file=sys.stderr)


_MEM = {}


def lookup(div, home, away, date):
    """Cotes d'un match : { m: [1, N, 2] moyenne, b: meilleures, k: {bookmaker FR: [1, N, 2]}, n } ou None. `date` : datetime du coup d'envoi (à ± 1 jour)."""
    if not _MEM:
        _MEM.update(_load() or {"_": 1})
    best, bs = None, 0.0
    for ev in (_MEM.get(div) or {}).get("events", []):
        try:
            t = datetime.fromisoformat(ev["t"].replace("Z", "+00:00")).replace(tzinfo=None)
            if abs((t - date).total_seconds()) > 36 * 3600:
                continue
        except Exception:
            continue
        s = min(_sim(home, ev["h"]), _sim(away, ev["a"]))
        if s > bs:
            best, bs = ev, s
    if best is None or bs < 0.55:
        return None
    return dict(m=best["m"], b=best["b"], k=best["k"], n=best["n"])
