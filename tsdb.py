"""Calendrier de championnats absents d'ESPN (Canada, Islande, Balkans, Corée…) via TheSportsDB (clé gratuite « 3 »).
L'offre gratuite ne donne qu'une poignée de matchs par requête et limite le débit : on interroge donc chaque jour, championnat par championnat,
avec un cache (data/tsdb_cache.json) et un nombre maximal de requêtes par passage ; les jours les plus proches et les plus périmés passent d'abord."""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d={d}&l={l}"
CACHE = os.path.join("data", "tsdb_cache.json")
MAX_REQ = 45                      # requêtes réseau par passage (≈ 2 minutes)
TTL_NEAR = 5 * 3600               # aujourd'hui et demain : rafraîchis toutes les ~5 h
TTL_FAR = 20 * 3600               # plus loin : une fois par jour
# id TheSportsDB : (nom français, pays en anglais, féminin)
LEAGUES = {4820: ("Premier League canadienne", "Canada", 0), 5602: ("Northern Super League (F)", "Canada", 1), 5922: ("Championnat canadien", "Canada", 0),
           4642: ("Besta deild karla", "Iceland", 0), 4906: ("1. deild karla", "Iceland", 0),
           4629: ("HNL (Croatie)", "Croatia", 0), 4671: ("SuperLiga (Serbie)", "Serbia", 0), 4354: ("Première ligue d’Ukraine", "Ukraine", 0),
           4626: ("Première ligue de Bulgarie", "Bulgaria", 0), 4690: ("NB I (Hongrie)", "Hungary", 0), 4672: ("Fortuna Liga (Slovaquie)", "Slovakia", 0),
           4692: ("PrvaLiga (Slovénie)", "Slovenia", 0), 4689: ("K League 1", "South Korea", 0), 4822: ("K League 2", "South Korea", 0),
           4678: ("UAE Pro League", "United Arab Emirates", 0), 4829: ("Première ligue d’Égypte", "Egypt", 0), 4663: ("Qatar Stars League", "Qatar", 0),
           4638: ("Erovnuli Liga (Géorgie)", "Georgia", 0), 4649: ("Première ligue du Kazakhstan", "Kazakhstan", 0), 4617: ("Superliga (Albanie)", "Albania", 0),
           4694: ("Division nationale (Luxembourg)", "Luxembourg", 0), 4713: ("Challenge League (Suisse)", "Switzerland", 0),
           4623: ("Challenger Pro League (Belgique)", "Belgium", 0), 4796: ("2. Liga (Autriche)", "Austria", 0), 4661: ("I liga (Pologne)", "Poland", 0),
           4637: ("Ligue 3", "France", 0)}
CFR = {"Canada": "Canada", "Iceland": "Islande", "Croatia": "Croatie", "Serbia": "Serbie", "Ukraine": "Ukraine", "Bulgaria": "Bulgarie", "Hungary": "Hongrie",
       "Slovakia": "Slovaquie", "Slovenia": "Slovénie", "South Korea": "Corée du Sud", "United Arab Emirates": "Émirats arabes unis", "Egypt": "Égypte",
       "Qatar": "Qatar", "Georgia": "Géorgie", "Kazakhstan": "Kazakhstan", "Albania": "Albanie", "Luxembourg": "Luxembourg", "Switzerland": "Suisse",
       "Belgium": "Belgique", "Austria": "Autriche", "Poland": "Pologne", "France": "France"}


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pronostics-football"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def _load():
    try:
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save(cache, keep_from):
    cache = {k: v for k, v in cache.items() if k.split("|")[1] >= keep_from}          # on oublie les jours trop anciens
    try:
        os.makedirs("data", exist_ok=True)
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))
    except OSError as exc:
        print(f"[avertissement] cache TheSportsDB non enregistré : {exc}", file=sys.stderr)


def calendar_items(lo, days, back=1):
    """lo : date de Paris du jour. -> lignes compatibles avec espn_hub.calendar_items."""
    from tennis import paris
    cache = _load()
    now = time.time()
    # (priorité, clé de cache, id de championnat, date) : les jours jamais vus ou périmés d'abord, les plus proches avant les plus lointains
    todo = []
    for lid in LEAGUES:
        for k in range(-back, days + 2):
            d = lo + timedelta(days=k)
            key = f"{lid}|{d:%Y-%m-%d}"
            c = cache.get(key)
            age = now - c["t"] if c else 1e12
            ttl = TTL_NEAR if k <= 1 else TTL_FAR
            if k < 0 and c and any((e.get("strStatus") or "").upper() in ("FT", "AET", "PEN") for e in c["e"]):
                continue                                                                  # jour passé déjà terminé : inutile de le redemander
            if c is None or age > ttl:
                todo.append((0 if c is None else 1, abs(k), key, lid, d))
    todo.sort()
    nreq = 0
    for _, _, key, lid, d in todo:
        if nreq >= MAX_REQ:
            break
        nreq += 1
        try:
            try:
                evs = _get(URL.format(d=f"{d:%Y-%m-%d}", l=lid)).get("events") or []
            except urllib.error.HTTPError as exc:
                if exc.code != 429:
                    raise
                time.sleep(15)                                                           # débit dépassé : on attend et on réessaie une fois
                evs = _get(URL.format(d=f"{d:%Y-%m-%d}", l=lid)).get("events") or []
            cache[key] = {"t": now, "e": [{k: e.get(k) for k in ("strTimestamp", "strStatus", "strLeague", "strHomeTeam", "strAwayTeam", "intHomeScore", "intAwayScore")} for e in evs]}
        except Exception as exc:
            print(f"[avertissement] TheSportsDB {LEAGUES[lid][0]} {d} indisponible : {exc}", file=sys.stderr)
            if isinstance(exc, urllib.error.HTTPError) and exc.code == 429:
                break                                                                    # toujours limité : on s'arrête, le cache servira
        time.sleep(2.2)                                                                  # l'offre gratuite limite le débit
    _save(cache, f"{lo - timedelta(days=back + 2):%Y-%m-%d}")
    out = []
    for lid, (fr, ctry, w) in LEAGUES.items():
        for k in range(-back, days + 2):
            d = lo + timedelta(days=k)
            for e in (cache.get(f"{lid}|{d:%Y-%m-%d}") or {}).get("e", []):
                try:
                    ts = datetime.strptime(e["strTimestamp"][:19], "%Y-%m-%dT%H:%M:%S")          # UTC
                    home, away = e["strHomeTeam"], e["strAwayTeam"]
                except (KeyError, TypeError, ValueError):
                    continue
                if not home or not away:
                    continue
                loc = paris(ts)
                if not (lo - timedelta(days=back) <= loc.date() <= lo + timedelta(days=days)):
                    continue
                st = (e.get("strStatus") or "NS").upper()
                state = "post" if st in ("FT", "AET", "PEN", "MATCH FINISHED") else "pre" if st in ("NS", "TBD", "") else "in"
                hs, as_ = e.get("intHomeScore"), e.get("intAwayScore")
                out.append(dict(s=f"tsdb.{lid}", lg=e.get("strLeague") or fr, fr=fr, country=ctry, cfr=CFR.get(ctry, ctry), date=f"{loc:%Y-%m-%d}", time=f"{loc:%H:%M}",
                                home=home, away=away, p=None, st=state,
                                hs=int(hs) if state != "pre" and hs not in (None, "") else None, as_=int(as_) if state != "pre" and as_ not in (None, "") else None, w=w))
    seen, uniq = set(), []
    for it in out:
        k = (it["date"], it["home"], it["away"])
        if k not in seen:
            seen.add(k)
            uniq.append(it)
    return uniq
