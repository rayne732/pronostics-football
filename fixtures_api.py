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

COMPETITIONS = {"F1": "FL1", "E0": "PL", "SP1": "PD", "D1": "BL1", "I1": "SA", "E1": "ELC"}

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
    "us lecce": "Lecce", "genoa cfc": "Genoa", "bologna fc 1909": "Bologna", "acf fiorentina": "Fiorentina",
}
_DROP = {"fc", "afc", "cf", "sc", "ac", "as", "us", "ss", "rc", "cd", "ud", "sv", "vfl", "vfb", "fsv", "tsg"}


def _norm(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


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
