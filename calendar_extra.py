"""Calendrier des 5 prochains jours des compétitions que notre modèle ne couvre pas (sélections nationales, coupes d'Europe et nationales, Arabie saoudite,
Australie, Équateur, Colombie, Série B brésilienne…) via ESPN : équipes, heure et, quand ESPN les a, les probabilités déduites des cotes (sans marge).
Pas de pronostic de notre part : seulement l'affiche et le marché. Les noms de compétition reprennent ceux d'API-Football pour fusionner avec « Autres matchs »."""
import sys
from datetime import datetime, timedelta, timezone

from fixtures_api import ESPN_URL, _espn_odds, _get_json, _local

# slug ESPN -> (nom API-Football, pays API-Football, nom français)
COMPETITIONS = {
    "fifa.friendly": ("Friendlies", "World", "Matchs amicaux"),
    "fifa.friendly.w": ("Friendlies Women", "World", "Matchs amicaux (F)"),
    "uefa.nations": ("UEFA Nations League", "World", "Ligue des Nations"),
    "concacaf.nations.league": ("CONCACAF Nations League", "World", "Ligue des Nations CONCACAF"),
    "uefa.champions": ("UEFA Champions League", "World", "Ligue des Champions"),
    "uefa.europa": ("UEFA Europa League", "World", "Ligue Europa"),
    "uefa.europa.conf": ("UEFA Europa Conference League", "World", "Ligue Conférence"),
    "uefa.champions_qual": ("UEFA Champions League Qualifying", "World", "Ligue des Champions (qualifications)"),
    "uefa.wchampions": ("UEFA Champions League Women", "World", "Ligue des Champions (F)"),
    "fifa.worldq.uefa": ("World Cup - Qualification Europe", "World", "Coupe du Monde (qualifs Europe)"),
    "uefa.euro_u21_qual": ("UEFA U21 Championship - Qualification", "World", "Euro U21 (qualifications)"),
    "conmebol.libertadores": ("CONMEBOL Libertadores", "World", "Copa Libertadores"),
    "conmebol.sudamericana": ("CONMEBOL Sudamericana", "World", "Copa Sudamericana"),
    "concacaf.champions": ("CONCACAF Champions Cup", "World", "Ligue des champions CONCACAF"),
    "afc.champions": ("AFC Champions League Elite", "World", "Ligue des champions d'Asie"),
    "eng.fa": ("FA Cup", "England", "FA Cup"),
    "eng.league_cup": ("League Cup", "England", "EFL Cup"),
    "ger.dfb_pokal": ("DFB Pokal", "Germany", "Coupe d'Allemagne"),
    "esp.copa_del_rey": ("Copa del Rey", "Spain", "Coupe du Roi"),
    "ita.coppa_italia": ("Coppa Italia", "Italy", "Coupe d'Italie"),
    "fra.coupe_de_france": ("Coupe de France", "France", "Coupe de France"),
    "sco.cis": ("League Cup", "Scotland", "Coupe de la Ligue d'Écosse"),
    "bra.copa_do_brazil": ("Copa Do Brasil", "Brazil", "Coupe du Brésil"),
    "bra.2": ("Serie B", "Brazil", "Série B (Brésil)"),
    "ksa.1": ("Pro League", "Saudi-Arabia", "Saudi Pro League"),
    "aus.1": ("A-League", "Australia", "A-League"),
    "ecu.1": ("Liga Pro", "Ecuador", "LigaPro (Équateur)"),
    "col.1": ("Primera A", "Colombia", "Primera A (Colombie)"),
}


def _probs(comp):
    o = _espn_odds(comp)
    if not o:
        return None
    q = [1 / o["B365H"], 1 / o["B365D"], 1 / o["B365A"]]
    s = sum(q)
    return [round(x / s, 3) for x in q]


def fetch(today, days):
    """Matchs à venir (date de Paris entre aujourd'hui et aujourd'hui + days) : liste de dicts lg, country, fr, date, time, home, away, p (ou None)."""
    from tennis import paris
    lo = paris(datetime.fromtimestamp(today.timestamp(), timezone.utc).replace(tzinfo=None)).date()
    hi = lo + timedelta(days=days)
    out = []
    for slug, (lg, country, fr) in COMPETITIONS.items():
        events = []
        for year in sorted({lo.year, hi.year}):
            try:
                events += _get_json(ESPN_URL.format(slug=slug, year=year)).get("events", [])
            except Exception as exc:
                print(f"[avertissement] calendrier ESPN {slug} indisponible : {exc}", file=sys.stderr)
        for e in events:
            if e["status"]["type"]["name"] != "STATUS_SCHEDULED":
                continue
            try:
                when = _local(e["date"].replace("Z", ":00Z") if e["date"].count(":") == 1 else e["date"])
            except ValueError:
                continue
            if not (lo <= when.date() <= hi):
                continue
            comp = e["competitions"][0]
            team = {c["homeAway"]: c["team"] for c in comp["competitors"]}
            out.append(dict(lg=lg, country=country, fr=fr, date=f"{when:%Y-%m-%d}", time=f"{when:%H:%M}",
                            home=team["home"].get("displayName", ""), away=team["away"].get("displayName", ""), p=_probs(comp)))
    out.sort(key=lambda x: (x["date"], x["time"], x["lg"]))
    return out
