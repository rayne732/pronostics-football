"""Matchs à venir via l'API football-data.org (offre gratuite, clé requise : FOOTBALL_DATA_TOKEN dans .env).
Les noms d'équipes de l'API sont convertis vers ceux des CSV football-data.co.uk (ceux du modèle)."""
import difflib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

COMPETITIONS = {"F1": "FL1", "E0": "PL", "SP1": "PD", "D1": "BL1", "I1": "SA", "E1": "ELC", "BRA": "BSA"}

# noms de l'API (normalisés) -> noms des CSV
ALIASES = {
    "paris saint germain": "Paris SG", "olympique de marseille": "Marseille", "olympique lyonnais": "Lyon",
    "as monaco": "Monaco", "losc lille": "Lille", "ogc nice": "Nice", "stade rennais": "Rennes",
    "rc lens": "Lens", "rc strasbourg alsace": "Strasbourg", "stade brestois 29": "Brest",
    "manchester united": "Man United", "manchester city": "Man City", "tottenham hotspur": "Tottenham",
    "newcastle united": "Newcastle", "wolverhampton wanderers": "Wolves", "nottingham forest": "Nott'm Forest",
    "west ham united": "West Ham", "brighton hove albion": "Brighton", "leeds united": "Leeds",
    "leicester city": "Leicester", "ipswich town": "Ipswich", "sheffield united": "Sheffield United",
    "sheffield wednesday": "Sheffield Weds", "west bromwich albion": "West Brom", "queens park rangers": "QPR",
    "real madrid": "Real Madrid", "club atletico de madrid": "Ath Madrid", "atletico madrid": "Ath Madrid",
    "athletic club": "Ath Bilbao", "real betis balompie": "Betis", "deportivo alaves": "Alaves",
    "rc celta de vigo": "Celta", "rayo vallecano de madrid": "Vallecano", "rcd espanyol de barcelona": "Espanol",
    "rcd mallorca": "Mallorca", "real sociedad de futbol": "Sociedad", "ca osasuna": "Osasuna",
    "bayern munchen": "Bayern Munich", "borussia dortmund": "Dortmund", "bayer 04 leverkusen": "Leverkusen",
    "eintracht frankfurt": "Ein Frankfurt", "borussia monchengladbach": "M'gladbach", "1 fc koln": "FC Koln",
    "1 fsv mainz 05": "Mainz", "1 fc union berlin": "Union Berlin", "1 fc heidenheim 1846": "Heidenheim",
    "sc freiburg": "Freiburg", "tsg 1899 hoffenheim": "Hoffenheim", "vfl wolfsburg": "Wolfsburg",
    "fc st pauli 1910": "St Pauli", "sv werder bremen": "Werder Bremen", "fc augsburg": "Augsburg",
    "fc internazionale milano": "Inter", "ac milan": "Milan", "juventus": "Juventus", "as roma": "Roma",
    "ssc napoli": "Napoli", "ss lazio": "Lazio", "atalanta bc": "Atalanta", "hellas verona": "Verona",
    "botafogo fr": "Botafogo RJ", "ca mineiro": "Atletico-MG", "ca paranaense": "Athletico-PR", "cr flamengo": "Flamengo RJ",
    "cr vasco da gama": "Vasco", "chapecoense af": "Chapecoense-SC", "clube do remo": "Remo", "coritiba fbc": "Coritiba",
    "cruzeiro ec": "Cruzeiro", "ec bahia": "Bahia", "ec vitoria": "Vitoria", "gremio fbpa": "Gremio", "rb bragantino": "Bragantino",
    "sc corinthians paulista": "Corinthians", "sc internacional": "Internacional", "se palmeiras": "Palmeiras",
    "us lecce": "Lecce", "genoa cfc": "Genoa", "bologna fc 1909": "Bologna", "acf fiorentina": "Fiorentina",
}
ESPN_ALIASES = {                                           # noms d'ESPN -> noms des CSV (championnats suivis via ESPN)
    "Pau": "Pau FC", "Real Sociedad II": "Sociedad B", "Sporting Gijón": "Sp Gijon", "RC Celta Fortuna": "Celta B", "OH Leuven": "Oud-Heverlee Leuven",
    "Sporting CP": "Sp Lisbon", "Amed SFK": "Amedspor", "Erzurum BB": "Erzurumspor", "Istanbul Basaksehir": "Buyuksehyr", "Heart of Midlothian": "Hearts",
    "Red Bull New York": "New York Red Bulls", "LAFC": "Los Angeles FC", "LA Galaxy": "Los Angeles Galaxy", "Santos": "Santos Laguna",
    "Pumas UNAM": "UNAM Pumas", "Central Córdoba (Santiago del Estero)": "Central Cordoba", "Independiente Rivadavia": "Ind. Rivadavia",
    "Independiente": "Independiente", "Urawa Red Diamonds": "Urawa Reds", "Hamarkameratene": "HamKam", "F.C. København": "FC Copenhagen",
    "AGF": "Aarhus", "Sønderjyske Fodbold": "Sonderjyske",
}
_DROP = {"fc", "afc", "cf", "sc", "ac", "as", "us", "ss", "rc", "cd", "ud", "sv", "vfl", "vfb", "fsv", "tsg"}


def _norm(name):
    s = unicodedata.normalize("NFKD", name).replace("ø", "o").replace("Ø", "O").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


ALIASES.update({_norm(k): v for k, v in ESPN_ALIASES.items()})


def to_csv_name(api_name, known):
    """Nom de l'API -> nom du CSV. Renvoie (nom, trouvé)."""
    n = _norm(api_name)
    core = " ".join(w for w in n.split() if w not in _DROP and not re.fullmatch(r"\d{4}", w))
    for key in (n, core):
        if key in ALIASES and ALIASES[key] in known:
            return ALIASES[key], True
    by_norm = {_norm(k): k for k in known}
    for key in (n, core):
        if key in by_norm:
            return by_norm[key], True
    for k_norm, k in by_norm.items():                      # l'un contient l'autre ("Stuttgart" / "VfB Stuttgart")
        if core and (core == k_norm or core.endswith(" " + k_norm) or k_norm.endswith(" " + core) or k_norm in core.split()):
            return k, True
    close = difflib.get_close_matches(core or n, list(by_norm), n=1, cutoff=0.75)
    return (by_norm[close[0]], True) if close else (api_name, False)


def _local(utc_str):
    d = datetime.strptime(utc_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    try:
        from zoneinfo import ZoneInfo
        return d.astimezone(ZoneInfo("Europe/Paris")).replace(tzinfo=None)
    except Exception:                                      # pas de base de fuseaux : heure d'été approximative
        return (d + timedelta(hours=2)).replace(tzinfo=None)


def fetch_fixtures(token, today, days, teams_by_div):
    """Lignes compatibles avec upcoming() : Div, Date, Time, HomeTeam, AwayTeam."""
    out, start = [], today.date()
    for div, comp in COMPETITIONS.items():
        q = urllib.parse.urlencode({"status": "SCHEDULED,TIMED", "dateFrom": start.isoformat(),
                                    "dateTo": (start + timedelta(days=days + 1)).isoformat()})
        req = urllib.request.Request(f"https://api.football-data.org/v4/competitions/{comp}/matches?{q}",
                                     headers={"X-Auth-Token": token})
        matches = None
        for attempt in range(3):                           # l'API renvoie parfois 429/500 si on va trop vite
            time.sleep(1.5 if attempt == 0 else 20)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    matches = json.load(resp).get("matches", [])
                break
            except Exception as exc:
                err = exc
        if matches is None:
            print(f"[avertissement] calendrier {comp} indisponible : {err}", file=sys.stderr)
            continue
        for m in matches:
            when = _local(m["utcDate"])
            if not (today.date() <= when.date() <= (today + timedelta(days=days)).date()):
                continue
            home, ok_h = to_csv_name(m["homeTeam"].get("name") or "", teams_by_div.get(div, set()))
            away, ok_a = to_csv_name(m["awayTeam"].get("name") or "", teams_by_div.get(div, set()))
            if not (ok_h and ok_a):
                print(f"[avertissement] équipe non reconnue : {m['homeTeam'].get('name')} / {m['awayTeam'].get('name')}", file=sys.stderr)
            out.append(dict(Div=div, Date=datetime(when.year, when.month, when.day), Time=f"{when:%H:%M}", HomeTeam=home, AwayTeam=away))
    return out


# ---------------------------------------------------------------- ESPN : championnats absents de l'offre gratuite de football-data.org
ESPN_SLUGS = {"F2": "fra.2", "D2": "ger.2", "I2": "ita.2", "SP2": "esp.2", "N1": "ned.1", "B1": "bel.1", "P1": "por.1", "T1": "tur.1", "G1": "gre.1",
              "SC0": "sco.1", "USA": "usa.1", "MEX": "mex.1", "ARG": "arg.1", "JPN": "jpn.1", "NOR": "nor.1", "SWE": "swe.1", "DNK": "den.1",
              "ROU": "rou.1", "SWZ": "sui.1", "FIN": "fin.1", "IRL": "irl.1"}
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates={year}&limit=1000"


def _dec(american):
    """Cote américaine (« +150 », « -180 ») -> cote décimale, ou None."""
    try:
        v = float(str(american).replace("+", ""))
    except (TypeError, ValueError):
        return None
    return round(1 + v / 100, 3) if v > 0 else round(1 + 100 / -v, 3) if v < 0 else None


def _espn_odds(comp):
    """Cotes 1X2 et plus/moins 2,5 de la première ligne de cotes ESPN, sous les noms de colonnes de football-data (B365...). {} si absentes."""
    try:
        o = (comp.get("odds") or [None])[0]
        if not o:
            return {}
        ml = o["moneyline"]
        h, d, a = (_dec(ml[k]["close"]["odds"]) for k in ("home", "draw", "away"))
        if not (h and d and a):
            return {}
        out = {"B365H": h, "B365D": d, "B365A": a}
        tot = o.get("total") or {}
        if o.get("overUnder") == 2.5:
            ov, un = _dec(tot["over"]["close"]["odds"]), _dec(tot["under"]["close"]["odds"])
            if ov and un:
                out.update({"B365>2.5": ov, "B365<2.5": un})
        return out
    except (KeyError, TypeError, IndexError):
        return {}


def _get_json(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            import gzip
            raw = gzip.decompress(raw)
    return json.loads(raw)


def fetch_espn(today, days, teams_by_div):
    """Matchs à venir des championnats suivis via ESPN (1 requête par championnat et par année civile de la fenêtre). Lignes compatibles avec upcoming()."""
    out, lo, hi = [], today.date(), (today + timedelta(days=days)).date()
    for div, slug in ESPN_SLUGS.items():
        if div not in teams_by_div:
            continue
        events = []
        for year in sorted({lo.year, hi.year}):
            try:
                events += _get_json(ESPN_URL.format(slug=slug, year=year)).get("events", [])
            except Exception as exc:
                print(f"[avertissement] calendrier ESPN {slug} indisponible : {exc}", file=sys.stderr)
        for e in events:
            try:
                when = _local(e["date"].replace("Z", ":00Z") if e["date"].count(":") == 1 else e["date"])
            except ValueError:
                continue
            if not (lo <= when.date() <= hi):
                continue
            if e["status"]["type"]["name"] != "STATUS_SCHEDULED" and when.date() != lo:       # les matchs du jour déjà commencés restent affichés (historique CSV : pas de fuite du résultat)
                continue
            comp = e["competitions"][0]
            team = {c["homeAway"]: c["team"] for c in comp["competitors"]}
            home, ok_h = to_csv_name(team["home"].get("displayName") or "", teams_by_div[div])
            away, ok_a = to_csv_name(team["away"].get("displayName") or "", teams_by_div[div])
            if not (ok_h and ok_a):
                print(f"[avertissement] équipe non reconnue ({div}) : {team['home'].get('displayName')} / {team['away'].get('displayName')}", file=sys.stderr)
            out.append(dict(Div=div, Date=datetime(when.year, when.month, when.day), Time=f"{when:%H:%M}", HomeTeam=home, AwayTeam=away, **_espn_odds(comp)))
    return out


# championnats sans calendrier ESPN : on reprend les matchs du jour (API-Football) et on y applique notre modèle
EXT_LEAGUES = {("Poland", "Ekstraklasa"): "POL", ("Romania", "Liga I"): "ROU", ("Switzerland", "Super League"): "SWZ",
               ("Finland", "Veikkausliiga"): "FIN", ("Ireland", "Premier Division"): "IRL"}


def fixtures_from_ext(ext, today, days, teams_by_div):
    out = []
    for e in ext or []:
        div = EXT_LEAGUES.get((e.get("country"), e.get("lg")))
        if not div or div not in teams_by_div:
            continue
        d = datetime.strptime(e["date"], "%Y-%m-%d")
        if not (today.date() <= d.date() <= (today + timedelta(days=days)).date()):
            continue
        home, ok_h = to_csv_name(e["home"], teams_by_div[div])
        away, ok_a = to_csv_name(e["away"], teams_by_div[div])
        if not (ok_h and ok_a):
            print(f"[avertissement] équipe non reconnue ({div}) : {e['home']} / {e['away']}", file=sys.stderr)
        out.append(dict(Div=div, Date=d, Time=e["time"], HomeTeam=home, AwayTeam=away))
    return out
