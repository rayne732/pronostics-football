"""Calendrier de championnats absents d'ESPN (Canada…) via TheSportsDB (clé gratuite « 3 »).
L'offre gratuite ne donne qu'une poignée de matchs par requête : on interroge donc chaque jour de la fenêtre, championnat par championnat."""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d={d}&l={l}"
# id TheSportsDB : (nom français, pays, féminin)
LEAGUES = {4820: ("Premier League canadienne", "Canada", 0), 5602: ("Northern Super League (F)", "Canada", 1), 5922: ("Championnat canadien", "Canada", 0)}


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pronostics-football"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def calendar_items(lo, days, back=1):
    """lo : date de Paris du jour. -> lignes compatibles avec espn_hub.calendar_items."""
    from tennis import paris
    out = []
    for lid, (fr, ctry, w) in LEAGUES.items():
        for k in range(-back, days + 2):
            d = lo + timedelta(days=k)
            try:
                try:
                    evs = _get(URL.format(d=f"{d:%Y-%m-%d}", l=lid)).get("events") or []
                except urllib.error.HTTPError as exc:
                    if exc.code != 429:
                        raise
                    time.sleep(15)                                                           # débit dépassé : on attend et on réessaie une fois
                    evs = _get(URL.format(d=f"{d:%Y-%m-%d}", l=lid)).get("events") or []
            except Exception as exc:
                print(f"[avertissement] TheSportsDB {fr} {d} indisponible : {exc}", file=sys.stderr)
                continue
            for e in evs:
                try:
                    ts = datetime.strptime(e["strTimestamp"][:19], "%Y-%m-%dT%H:%M:%S")          # UTC
                except (KeyError, TypeError, ValueError):
                    continue
                loc = paris(ts)
                if not (lo - timedelta(days=back) <= loc.date() <= lo + timedelta(days=days)):
                    continue
                st = (e.get("strStatus") or "NS").upper()
                state = "post" if st in ("FT", "AET", "PEN", "MATCH FINISHED") else "pre" if st in ("NS", "TBD", "") else "in"
                hs, as_ = e.get("intHomeScore"), e.get("intAwayScore")
                out.append(dict(s=f"tsdb.{lid}", lg=e.get("strLeague") or fr, fr=fr, country=ctry, cfr="Canada", date=f"{loc:%Y-%m-%d}", time=f"{loc:%H:%M}",
                                home=e["strHomeTeam"], away=e["strAwayTeam"], p=None, st=state,
                                hs=int(hs) if state != "pre" and hs not in (None, "") else None, as_=int(as_) if state != "pre" and as_ not in (None, "") else None, w=w))
            time.sleep(2.2)                                                                  # l'offre gratuite limite le débit
    seen, uniq = set(), []
    for it in out:
        k = (it["date"], it["home"], it["away"])
        if k not in seen:
            seen.add(k)
            uniq.append(it)
    return uniq
