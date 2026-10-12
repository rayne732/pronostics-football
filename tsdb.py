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
MAX_REQ = 80                      # requêtes réseau par passage (≈ 2 minutes)
TTL_NEAR = 8 * 3600               # aujourd'hui et demain : rafraîchis toutes les ~5 h
TTL_FAR = 30 * 3600               # plus loin : une fois par jour
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
           4637: ("Ligue 3", "France", 0),
           4650: ("Virslīga (Lettonie)", "Latvia", 0), 4651: ("A Lyga (Lituanie)", "Lithuania", 0), 4634: ("Meistriliiga (Estonie)", "Estonia", 0),
           4619: ("Première ligue d’Arménie", "Armenia", 0), 4693: ("Première ligue d’Azerbaïdjan", "Azerbaijan", 0), 4655: ("Division nationale (Moldavie)", "Moldova", 0),
           4656: ("Première ligue du Monténégro", "Montenegro", 0), 4622: ("Vysshaya Liga (Biélorussie)", "Belarus", 0), 4742: ("Persian Gulf Pro League (Iran)", "Iran", 0),
           4743: ("Thai League 1", "Thailand", 0), 4803: ("V.League 1 (Vietnam)", "Vietnam", 0), 4790: ("Super League (Indonésie)", "Indonesia", 0),
           4792: ("Super League (Malaisie)", "Malaysia", 0), 4520: ("Botola Pro (Maroc)", "Morocco", 0), 4753: ("Ligue 1 (Algérie)", "Algeria", 0),
           4828: ("Ligue 1 (Tunisie)", "Tunisia", 0), 4974: ("Premier League (Ghana)", "Ghana", 0), 4827: ("NPFL (Nigeria)", "Nigeria", 0),
           4745: ("Premier League (Kenya)", "Kenya", 0), 4676: ("TFF 1. Lig (Turquie)", "Turkey", 0), 4824: ("J2 League", "Japan", 0),
           4628: ("China League One", "China", 0), 4457: ("OBOS-ligaen (Norvège)", "Norway", 0), 4683: ("1re division (Danemark)", "Denmark", 0),
           4899: ("Primera B (Chili)", "Chile", 0), 5073: ("Segunda División (Pérou)", "Peru", 0), 5072: ("Segunda División (Uruguay)", "Uruguay", 0),
           4900: ("División Intermedia (Paraguay)", "Paraguay", 0), 4910: ("Nacional B (Bolivie)", "Bolivia", 0), 4957: ("Serie B (Équateur)", "Ecuador", 0),
           5659: ("Segunda División (Venezuela)", "Venezuela", 0), 5627: ("Première division saoudienne", "Saudi Arabia", 0), 5055: ("Pro League (Jordanie)", "Jordan", 0),
           5056: ("Première ligue d’Irak", "Iraq", 0), 5256: ("Première ligue de Syrie", "Syria", 0), 5243: ("Première ligue du Liban", "Lebanon", 0),
           4794: ("Super League (Ouzbékistan)", "Uzbekistan", 0), 4826: ("Première ligue de Bahreïn", "Bahrain", 0), 4823: ("Première ligue du Koweït", "Kuwait", 0),
           5250: ("Pro League (Oman)", "Oman", 0), 4754: ("Ligue 1 (Sénégal)", "Senegal", 0), 5241: ("Ligue 1 (Côte d’Ivoire)", "Ivory Coast", 0),
           5211: ("Super League (Zambie)", "Zambia", 0), 5259: ("Première ligue d’Ouganda", "Uganda", 0), 4959: ("Première ligue d’Éthiopie", "Ethiopia", 0),
           4815: ("Liga FPD (Costa Rica)", "Costa Rica", 0), 4818: ("Liga Nacional (Honduras)", "Honduras", 0), 4817: ("Liga Nacional (Guatemala)", "Guatemala", 0),
           4816: ("Primera División (Salvador)", "El Salvador", 0), 4819: ("Liga Panameña", "Panama", 0), 5075: ("Première ligue de Jamaïque", "Jamaica", 0),
           4677: ("Première ligue d’Ukraine (D2)", "Ukraine", 0), 5314: ("2. Liga (Slovaquie)", "Slovakia", 0), 4966: ("Liga Leumit (Israël)", "Israel", 0),
           5504: ("National League (Nouvelle-Zélande)", "New Zealand", 0), 4673: ("Primera RFEF - Groupe 1", "Spain", 0), 4750: ("Primera RFEF - Groupe 2", "Spain", 0),
           5206: ("Liga MX Femenil (F)", "Mexico", 1), 5201: ("Brasileirão (F)", "Brazil", 1),
           5209: ("Damallsvenskan (F)", "Sweden", 1), 5208: ("Toppserien (F)", "Norway", 1), 5202: ("A-Liga (F, Danemark)", "Denmark", 1)}
CFR = {"Canada": "Canada", "Iceland": "Islande", "Croatia": "Croatie", "Serbia": "Serbie", "Ukraine": "Ukraine", "Bulgaria": "Bulgarie", "Hungary": "Hongrie",
       "Slovakia": "Slovaquie", "Slovenia": "Slovénie", "South Korea": "Corée du Sud", "United Arab Emirates": "Émirats arabes unis", "Egypt": "Égypte",
       "Qatar": "Qatar", "Georgia": "Géorgie", "Kazakhstan": "Kazakhstan", "Albania": "Albanie", "Luxembourg": "Luxembourg", "Switzerland": "Suisse",
       "Belgium": "Belgique", "Austria": "Autriche", "Poland": "Pologne", "France": "France",
       "Latvia": "Lettonie", "Lithuania": "Lituanie", "Estonia": "Estonie", "Armenia": "Arménie", "Azerbaijan": "Azerbaïdjan", "Moldova": "Moldavie",
       "Montenegro": "Monténégro", "Belarus": "Biélorussie", "Iran": "Iran", "Thailand": "Thaïlande", "Vietnam": "Vietnam", "Indonesia": "Indonésie",
       "Malaysia": "Malaisie", "Morocco": "Maroc", "Algeria": "Algérie", "Tunisia": "Tunisie", "Ghana": "Ghana", "Nigeria": "Nigeria", "Kenya": "Kenya",
       "Turkey": "Turquie", "Japan": "Japon", "China": "Chine", "Norway": "Norvège", "Denmark": "Danemark", "Sweden": "Suède",
       "Chile": "Chili", "Peru": "Pérou", "Uruguay": "Uruguay", "Paraguay": "Paraguay", "Bolivia": "Bolivie", "Ecuador": "Équateur", "Venezuela": "Venezuela",
       "Saudi Arabia": "Arabie saoudite", "Jordan": "Jordanie", "Iraq": "Irak", "Syria": "Syrie", "Lebanon": "Liban", "Uzbekistan": "Ouzbékistan", "Bahrain": "Bahreïn",
       "Kuwait": "Koweït", "Oman": "Oman", "Senegal": "Sénégal", "Ivory Coast": "Côte d’Ivoire", "Zambia": "Zambie", "Uganda": "Ouganda", "Ethiopia": "Éthiopie",
       "Costa Rica": "Costa Rica", "Honduras": "Honduras", "Guatemala": "Guatemala", "El Salvador": "Salvador", "Panama": "Panama", "Jamaica": "Jamaïque",
       "Israel": "Israël", "New Zealand": "Nouvelle-Zélande", "Spain": "Espagne", "Mexico": "Mexique", "Brazil": "Brésil"}


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
        for k in range(-back, min(days, 4) + 2):                                          # au-delà de 4 jours : seulement ce qui est déjà en cache
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


def _n(x):
    import re
    import unicodedata
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFD", (x or "").lower()).encode("ascii", "ignore").decode())


def _same(a, b):
    a, b = _n(a), _n(b)
    return bool(a and b and (a == b or (len(min(a, b, key=len)) >= 4 and (a in b or b in a))))


def _rank(it):
    sid = str(it.get("s", ""))
    return 2 if sid.startswith("apif.") else 1 if sid.startswith("tsdb.") else 0


def dedupe(cal, modeled=()):
    """Retire les doublons entre sources : ESPN d'abord, puis TheSportsDB, puis API-Football (même jour, mêmes équipes à l'orthographe près),
    et tout ce qui figure déjà parmi les matchs modélisés (liste de (date, domicile, extérieur))."""
    by_day = {}
    for it in cal:
        by_day.setdefault(it["date"], []).append(it)
    mod = {}
    for d, h, a in modeled:
        mod.setdefault(d, []).append((h, a))
    out = []
    for it in cal:
        r = _rank(it)
        if r:
            if any(_same(it["home"], h) and _same(it["away"], a) for h, a in mod.get(it["date"], [])):
                continue
            if any(_rank(o) < r and _same(it["home"], o["home"]) and _same(it["away"], o["away"]) for o in by_day.get(it["date"], [])):
                continue
        out.append(it)
    return out
