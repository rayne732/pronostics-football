"""Toutes les compétitions de football du monde d'après ESPN (flux « all » : un appel par jour pour toutes les ligues).
  - calendrier des 5 prochains jours, matchs en cours et terminés (aujourd'hui, hier) avec scores, probabilités déduites des cotes quand ESPN en a ;
  - journal des résultats (data/match_log.json) : chaque match terminé est enregistré avec la probabilité du marché d'avant-match, pour mesurer la fiabilité
    des cotes et des prédictions API-Football sur chaque compétition (et nourrir les modèles quand ils existent) ;
  - résolution des prédictions API-Football (data/ext_log.json) avec les résultats ESPN.
Les championnats déjà modélisés (fixtures.csv, football-data.org, ESPN_SLUGS) ne sont pas dupliqués dans le calendrier."""
import json
import os
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from fixtures_api import ESPN_SLUGS, _espn_odds, _get_json, _local

INDEX_FILE = "data/espn_leagues.json"
LOG_FILE = "data/match_log.json"
EXT_LOG = "data/ext_log.json"
FEED = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates={d}&limit=1000"
CORE = "https://sports.core.api.espn.com/v2/sports/soccer/leagues"
KEEP_DAYS = 60
SKIP_PREFIX = ("usa.ncaa",)                      # football universitaire américain : hors sujet
MODELED = {"eng.1", "eng.2", "esp.1", "ger.1", "ita.1", "fra.1", "bra.1"} | set(ESPN_SLUGS.values())   # déjà suivis avec notre modèle

# pays (préfixe du code ESPN) : (nom anglais comme API-Football, nom français)
COUNTRY = {
    "eng": ("England", "Angleterre"), "esp": ("Spain", "Espagne"), "ger": ("Germany", "Allemagne"), "ita": ("Italy", "Italie"), "fra": ("France", "France"),
    "ned": ("Netherlands", "Pays-Bas"), "bel": ("Belgium", "Belgique"), "por": ("Portugal", "Portugal"), "tur": ("Turkey", "Turquie"), "gre": ("Greece", "Grèce"),
    "sco": ("Scotland", "Écosse"), "wal": ("Wales", "Pays de Galles"), "nir": ("Northern-Ireland", "Irlande du Nord"), "irl": ("Ireland", "Irlande"),
    "usa": ("USA", "États-Unis"), "mex": ("Mexico", "Mexique"), "arg": ("Argentina", "Argentine"), "bra": ("Brazil", "Brésil"), "jpn": ("Japan", "Japon"),
    "kor": ("South-Korea", "Corée du Sud"), "chn": ("China", "Chine"), "aus": ("Australia", "Australie"), "ksa": ("Saudi-Arabia", "Arabie saoudite"),
    "nor": ("Norway", "Norvège"), "swe": ("Sweden", "Suède"), "den": ("Denmark", "Danemark"), "fin": ("Finland", "Finlande"), "pol": ("Poland", "Pologne"),
    "rou": ("Romania", "Roumanie"), "sui": ("Switzerland", "Suisse"), "aut": ("Austria", "Autriche"), "cze": ("Czech-Republic", "Tchéquie"),
    "cro": ("Croatia", "Croatie"), "hun": ("Hungary", "Hongrie"), "srb": ("Serbia", "Serbie"), "bul": ("Bulgaria", "Bulgarie"), "svk": ("Slovakia", "Slovaquie"),
    "rus": ("Russia", "Russie"), "ukr": ("Ukraine", "Ukraine"), "isr": ("Israel", "Israël"), "cyp": ("Cyprus", "Chypre"), "ind": ("India", "Inde"),
    "col": ("Colombia", "Colombie"), "ecu": ("Ecuador", "Équateur"), "chi": ("Chile", "Chili"), "par": ("Paraguay", "Paraguay"), "per": ("Peru", "Pérou"),
    "uru": ("Uruguay", "Uruguay"), "ven": ("Venezuela", "Venezuela"), "bol": ("Bolivia", "Bolivie"), "crc": ("Costa-Rica", "Costa Rica"), "hon": ("Honduras", "Honduras"),
    "gua": ("Guatemala", "Guatemala"), "slv": ("El-Salvador", "Salvador"), "can": ("Canada", "Canada"), "mar": ("Morocco", "Maroc"), "egy": ("Egypt", "Égypte"),
    "rsa": ("South-Africa", "Afrique du Sud"), "tha": ("Thailand", "Thaïlande"), "idn": ("Indonesia", "Indonésie"), "mys": ("Malaysia", "Malaisie"),
}
WORLD = ("World", "Monde")
REGION = {"uefa": ("Europe", "Europe"), "conmebol": ("South-America", "Amérique du Sud"), "concacaf": ("North-America", "Amérique du Nord"),
          "caf": ("Africa", "Afrique"), "afc": ("Asia", "Asie"), "ofc": ("Oceania", "Océanie")}
# noms français des compétitions les plus suivies (le reste garde le nom ESPN sans l'adjectif de nationalité)
FR_NAME = {
    "fifa.friendly": "Matchs amicaux", "fifa.friendly.w": "Matchs amicaux (F)", "fifa.friendly_u21": "Amicaux U21", "club.friendly": "Amicaux de clubs",
    "uefa.nations": "Ligue des Nations", "concacaf.nations.league": "Ligue des Nations CONCACAF", "uefa.champions": "Ligue des Champions", "uefa.europa": "Ligue Europa",
    "uefa.europa.conf": "Ligue Conférence", "uefa.champions_qual": "Ligue des Champions (qualifications)", "uefa.wchampions": "Ligue des Champions (F)",
    "fifa.worldq.uefa": "Coupe du Monde (qualifs Europe)", "fifa.wworldq.uefa": "Coupe du Monde féminine (qualifs Europe)", "uefa.euro_u21_qual": "Euro U21 (qualifications)",
    "conmebol.libertadores": "Copa Libertadores", "conmebol.sudamericana": "Copa Sudamericana", "concacaf.champions": "Ligue des champions CONCACAF",
    "afc.champions": "Ligue des champions d'Asie", "fifa.world": "Coupe du Monde", "fifa.wwc": "Coupe du Monde féminine", "eng.fa": "FA Cup", "eng.league_cup": "EFL Cup",
    "ger.dfb_pokal": "Coupe d'Allemagne", "esp.copa_del_rey": "Coupe du Roi", "ita.coppa_italia": "Coupe d'Italie", "fra.coupe_de_france": "Coupe de France",
    "sco.cis": "Coupe de la Ligue d'Écosse", "bra.copa_do_brazil": "Coupe du Brésil", "bra.2": "Série B", "ksa.1": "Saudi Pro League", "aus.1": "A-League",
    "ecu.1": "LigaPro", "col.1": "Primera A", "fra.w.1": "Première Ligue (F)", "eng.w.1": "Women's Super League", "esp.w.1": "Liga F", "usa.nwsl": "NWSL",
    "ned.2": "Eerste Divisie", "eng.3": "League One", "eng.4": "League Two", "eng.5": "National League", "eng.trophy": "EFL Trophy", "sco.2": "Championship (Écosse)",
    "rus.1": "Premier League russe", "chn.1": "Super League chinoise", "ind.1": "Indian Super League", "aut.1": "Bundesliga autrichienne", "mex.2": "Liga de Expansión",
}
_ADJ = re.compile(r"^(English|Spanish|German|Italian|French|Dutch|Belgian|Portuguese|Turkish|Greek|Scottish|Welsh|Northern Irish|Irish|American|Mexican|Argentine|Argentinian|Brazilian|"
                  r"Japanese|Korean|Chinese|Australian|Saudi|Norwegian|Swedish|Danish|Finnish|Polish|Romanian|Swiss|Austrian|Czech|Croatian|Hungarian|Serbian|Bulgarian|Slovak|"
                  r"Russian|Ukrainian|Colombian|Ecuadorian|Chilean|Paraguayan|Peruvian|Uruguayan|Venezuelan|Bolivian|Costa Rican|Honduran|Guatemalan|Salvadoran|Canadian|Moroccan|"
                  r"Egyptian|South African|Thai|Indian)\s+")


def _read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _write(path, data):
    os.makedirs("data", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


def _norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


# ---------------------------------------------------------------- index des ligues
def league_index(now_ts):
    """{identifiant de ligue ESPN: {slug, name, gender}} (mis à jour une fois par semaine)."""
    cache = _read(INDEX_FILE)
    if cache and now_ts - cache.get("ts", 0) < 7 * 86400:
        return cache["m"]
    try:
        slugs = [i["$ref"].split("/leagues/")[1].split("?")[0] for i in _get_json(CORE + "?limit=1000")["items"]]
    except Exception as exc:
        print(f"[avertissement] liste des ligues ESPN indisponible : {exc}", file=sys.stderr)
        return (cache or {}).get("m", {})

    def one(slug):
        try:
            d = _get_json(f"{CORE}/{slug}", 40)
            return str(d["id"]), dict(slug=slug, name=d.get("name") or slug, gender=d.get("gender", "MALE"))
        except Exception:
            return None
    with ThreadPoolExecutor(8) as ex:
        found = [x for x in ex.map(one, slugs) if x]
    idx = dict(found)
    if len(idx) > 100:
        _write(INDEX_FILE, dict(ts=now_ts, m=idx))
        return idx
    return (cache or {}).get("m", idx)


def describe(slug, name):
    """(nom français, nom anglais du pays pour le regroupement, nom français du pays)."""
    pre = slug.split(".")[0]
    if pre in COUNTRY:
        ctry = COUNTRY[pre]
    elif pre in REGION:
        ctry = REGION[pre]
    else:
        ctry = WORLD
    if slug.startswith(("fifa.", "club.")) or pre in ("global",):
        ctry = WORLD
    short = _ADJ.sub("", name)
    fr = FR_NAME.get(slug) or (short if len(short.split()) >= 2 or short.lower() not in ("cup", "league") else name)
    return fr, ctry[0], ctry[1]


# ---------------------------------------------------------------- flux global
def _event(e, lg_idx):
    lid = e["uid"].split("~")[1][2:]
    lg = lg_idx.get(lid)
    if not lg or lg["slug"].startswith(SKIP_PREFIX):
        return None
    comp = e["competitions"][0]
    team = {c["homeAway"]: c for c in comp["competitors"]}
    if "home" not in team or "away" not in team:
        return None
    try:
        when = _local(e["date"].replace("Z", ":00Z") if e["date"].count(":") == 1 else e["date"])
    except ValueError:
        return None
    st = e["status"]["type"]["state"]                         # pre / in / post
    detail = e["status"]["type"].get("name", "")
    odds = _espn_odds(comp)
    p = None
    if odds:
        q = [1 / odds["B365H"], 1 / odds["B365D"], 1 / odds["B365A"]]
        s = sum(q)
        p = [round(x / s, 3) for x in q]
    sc = lambda c: int(c["score"]) if st != "pre" and str(c.get("score", "")).isdigit() else None
    return dict(id=e["id"], slug=lg["slug"], lname=lg["name"], gender=lg["gender"], date=f"{when:%Y-%m-%d}", time=f"{when:%H:%M}", st=st,
                home=team["home"]["team"].get("displayName", ""), away=team["away"]["team"].get("displayName", ""), hs=sc(team["home"]), as_=sc(team["away"]),
                p=p, o=odds, neutral=bool(comp.get("neutralSite")), final=(detail == "STATUS_FULL_TIME" or detail.startswith("STATUS_FINAL")))


def fetch_events(now, days, back=3):
    """Événements de toutes les compétitions entre (aujourd'hui - back) et (aujourd'hui + days), dates de Paris."""
    from tennis import paris
    ts = now.timestamp()
    lo = paris(datetime.fromtimestamp(ts, timezone.utc).replace(tzinfo=None)).date()
    idx = league_index(ts)
    if not idx:
        return [], lo
    out, seen = [], set()
    # ESPN classe les matchs par jour de la côte Est des États-Unis : on demande un jour de plus avant la fenêtre
    days_list = [lo - timedelta(days=back + 1) + timedelta(days=i) for i in range(back + days + 3)]

    def one(d):
        try:
            return _get_json(FEED.format(d=f"{d:%Y%m%d}"), 60).get("events", [])
        except Exception as exc:
            print(f"[avertissement] flux ESPN {d} indisponible : {exc}", file=sys.stderr)
            return []
    with ThreadPoolExecutor(6) as ex:
        for evs in ex.map(one, days_list):
            for e in evs:
                if e["id"] in seen:
                    continue
                seen.add(e["id"])
                try:
                    it = _event(e, idx)
                except (KeyError, TypeError, ValueError):
                    it = None
                if it and lo - timedelta(days=back) <= datetime.strptime(it["date"], "%Y-%m-%d").date() <= lo + timedelta(days=days):
                    out.append(it)
    out.sort(key=lambda x: (x["date"], x["time"], x["slug"]))
    return out, lo


# ---------------------------------------------------------------- journal des résultats
def update_logs(events, ext, lo):
    """Enregistre les matchs terminés (avec la probabilité du marché d'avant-match) et résout les prédictions API-Football. Renvoie les statistiques de fiabilité."""
    log = (_read(LOG_FILE) or {}).get("m", {})
    for it in events:
        k = it["id"]
        rec = log.get(k) or [it["slug"], it["date"], it["home"], it["away"], None, None, None, None]
        if it["p"] and it["st"] == "pre":
            rec[6] = it["p"]                                  # dernière probabilité du marché connue avant le coup d'envoi
        if it["st"] == "post" and it["hs"] is not None and it["as_"] is not None:
            rec[4], rec[5] = it["hs"], it["as_"]
        if it["st"] == "pre" and not rec[6]:
            rec[6] = None
        log[k] = rec
    cut = f"{lo - timedelta(days=KEEP_DAYS):%Y-%m-%d}"
    log = {k: v for k, v in log.items() if v[1] >= cut}
    _write(LOG_FILE, dict(m=log))
    # prédictions API-Football : on les enregistre (jour même) puis on les relie au résultat ESPN (même date, une équipe en commun)
    el = (_read(EXT_LOG) or {}).get("m", {})
    for e in ext or []:
        el.setdefault(f"af{e['id']}", dict(d=e["date"], lg=e["lg"], c=e["country"], h=e["home"], a=e["away"], p=e["p"], r=None))
    done = [(v[1], _norm(v[2]), _norm(v[3]), v[4], v[5]) for v in log.values() if v[4] is not None]
    for k, v in el.items():
        if v["r"] is None:
            for d, h, a, hs, as_ in done:
                nh, na = _norm(v["h"]), _norm(v["a"])
                if d == v["d"] and ((h in nh or nh in h) and (a in na or na in a)):
                    v["r"] = [hs, as_]
                    break
    el = {k: v for k, v in el.items() if v["d"] >= cut}
    _write(EXT_LOG, dict(m=el))
    return reliability(log, el)


def _hit(p, hs, as_):
    """1 si le favori (parmi 1 / N / 2) d'une prédiction p s'est réalisé."""
    res = 0 if hs > as_ else 1 if hs == as_ else 2
    return int(max(range(3), key=lambda i: p[i]) == res)


def reliability(log, el):
    """Lignes [groupe, nombre de matchs, probabilité moyenne du favori, part de favoris justes] pour les cotes (par type de compétition) et pour API-Football."""
    from collections import defaultdict
    groups = defaultdict(lambda: [0, 0.0, 0])
    for slug, d, h, a, hs, as_, p, _ in log.values():
        if hs is None or not p:
            continue
        pre = slug.split(".")[0]
        g = "Sélections et compétitions internationales" if slug.startswith(("fifa.", "uefa.", "concacaf.", "conmebol.", "caf.", "afc.", "global.", "club.")) else "Championnats et coupes"
        if slug in MODELED:
            continue
        for key in (g, "Toutes (cotes ESPN)"):
            r = groups[key]
            r[0] += 1
            r[1] += max(p)
            r[2] += _hit(p, hs, as_)
    rows = [[k, v[0], round(v[1] / v[0], 3), round(v[2] / v[0], 3)] for k, v in groups.items() if v[0] >= 5]
    api = [0, 0.0, 0]
    both = [0, 0.0, 0, 0.0, 0]                               # matchs avec cotes ET prédiction API-Football : n, API proba, API justes, marché proba, marché justes
    mk_by_match = {(v[1], _norm(v[2]), _norm(v[3])): (v[6], v[4], v[5]) for v in log.values() if v[6] and v[4] is not None}
    for v in el.values():
        if v["r"] is None or not v["p"] or sum(v["p"]) <= 0:
            continue
        api[0] += 1
        api[1] += max(v["p"])
        api[2] += _hit(v["p"], *v["r"])
        for (d, h, a), (mp, hs, as_) in mk_by_match.items():
            nh, na = _norm(v["h"]), _norm(v["a"])
            if d == v["d"] and (h in nh or nh in h) and (a in na or na in a):
                both[0] += 1
                both[1] += max(v["p"])
                both[2] += _hit(v["p"], hs, as_)
                both[3] += max(mp)
                both[4] += _hit(mp, hs, as_)
                break
    if api[0] >= 5:
        rows.append(["Prédictions API-Football", api[0], round(api[1] / api[0], 3), round(api[2] / api[0], 3)])
    if both[0] >= 5:
        rows.append(["API-Football (matchs avec cotes)", both[0], round(both[1] / both[0], 3), round(both[2] / both[0], 3)])
        rows.append(["Cotes ESPN (mêmes matchs)", both[0], round(both[3] / both[0], 3), round(both[4] / both[0], 3)])
    return rows


# ---------------------------------------------------------------- pour la page
def calendar_items(events, lo, days, exclude=()):
    """Éléments du calendrier (hors championnats déjà modélisés) pour la page : lignes compactes."""
    out = []
    hi = lo + timedelta(days=days)
    for it in events:
        if it["slug"] in MODELED or it["slug"] in exclude:
            continue
        d = datetime.strptime(it["date"], "%Y-%m-%d").date()
        if d < lo - timedelta(days=1) or d > hi:
            continue
        fr, ctry, cfr = describe(it["slug"], it["lname"])
        out.append(dict(s=it["slug"], lg=it["lname"], fr=fr, country=ctry, cfr=cfr, date=it["date"], time=it["time"], home=it["home"], away=it["away"],
                        p=it["p"], st=it["st"], hs=it["hs"], as_=it["as_"], w=int(it["gender"] == "FEMALE")))
    return out
