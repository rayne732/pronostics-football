"""Suivi de précision : chaque pronostic publié est enregistré, puis comparé au résultat réel.
Deux sources de statistiques :
  - backtest  : pronostics reconstitués semaine par semaine sur des saisons passées (data/backtest.json) ;
  - suivi réel : pronostics réellement affichés sur la page, vérifiés après les matchs (data/tracking.json).
Un enregistrement = [championnat, date, type de marché, proba annoncée, catégorie (0 sûr / 1 moins sûr), validé, gagné]."""
import json
import os
import re
import sys
from datetime import datetime, timedelta

from markets import fit_all
from poisson import load
from blend import lams as blend_lams
from winamax import classify, families

TRACK_FILE = os.environ.get("TRACK_FILE", "data/tracking.json")
BACKTEST_FILE = "data/backtest.json"
EDGES = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01)


def result_of(row):
    """Résultat réel d'une ligne CSV : buts finaux, buts mi-temps, corners (None si absents)."""
    def num(k):
        try:
            return int(float(row[k]))
        except (KeyError, ValueError, TypeError):
            return None
    hh, ha, ch, ca = num("HTHG"), num("HTAG"), num("HC"), num("AC")
    ht_ok, c_ok = hh is not None and ha is not None, ch is not None and ca is not None
    return dict(fh=row["FTHG"], fa=row["FTAG"], hh=hh if ht_ok else None, ha=ha if ht_ok else None,
                ch=ch if c_ok else None, ca=ca if c_ok else None)


def make_picks(models, home, away, ov=None):
    """Pronostics affichés (sûrs puis moins sûrs) avec leur règle de vérification."""
    fams, _ = families(models, home, away, ov)
    safe, less = classify(fams)
    by = {f["name"]: f for f in fams}
    return [dict(market=m, kind=by[m]["kind"], sel=s, p=round(p, 4), tier=tier, validated=v, rule=by[m]["rules"][s])
            for tier, lst in ((0, safe), (1, less)) for m, s, p, v in lst]


def _fallback_rule(market, sel):
    m = re.fullmatch(r"(\d+)-(\d+)", sel)
    if market == "Score exact" and m:
        i, j = int(m.group(1)), int(m.group(2))
        return lambda r: r["fh"] == i and r["fa"] == j
    return None


def _read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, ValueError):
        return None


def _write(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------- suivi réel
def record(fixtures, models, today):
    """Enregistre (ou met à jour, tant que le match n'a pas eu lieu) les pronostics des matchs à venir."""
    data = _read(TRACK_FILE) or {"matches": {}}
    start = today.replace(hour=0, minute=0, second=0, microsecond=0)
    for r in fixtures:
        div, home, away = r["Div"], r["HomeTeam"], r["AwayTeam"]
        if r["Date"] < start or div not in models or home not in models[div]["goals"]["idx"] or away not in models[div]["goals"]["idx"]:
            continue
        key = f'{div}|{r["Date"]:%Y-%m-%d}|{home}|{away}'
        if data["matches"].get(key, {}).get("settled"):
            continue
        picks = [{k: v for k, v in p.items() if k != "rule"} for p in make_picks(models[div], home, away, blend_lams(models[div], r))]
        data["matches"][key] = dict(div=div, date=f'{r["Date"]:%Y-%m-%d}', time=r.get("Time", ""), home=home, away=away, picks=picks,
                                    recorded=today.isoformat(timespec="minutes"), settled=False)
    _write(TRACK_FILE, data)


def settle(models, today, rows_by_div):
    """Vérifie les pronostics enregistrés dont le match figure maintenant dans les résultats."""
    data = _read(TRACK_FILE)
    if not data:
        return 0
    done = 0
    for m in data["matches"].values():
        d = datetime.strptime(m["date"], "%Y-%m-%d")
        if m["settled"] or d.date() > today.date() or m["div"] not in models:
            continue
        row = rows_by_div.get(m["div"], {}).get((d, m["home"], m["away"]))
        if row is None:
            continue
        res = result_of(row)
        fams, _ = families(models[m["div"]], m["home"], m["away"])
        by = {f["name"]: f for f in fams}
        for p in m["picks"]:
            rule = by.get(p["market"], {}).get("rules", {}).get(p["sel"]) or _fallback_rule(p["market"], p["sel"])
            hit = rule(res) if rule else None
            p["hit"] = None if hit is None else bool(hit)
        m["settled"], m["result"] = True, f'{res["fh"]}-{res["fa"]}'
        done += 1
    _write(TRACK_FILE, data)
    return done


def live_records():
    data = _read(TRACK_FILE)
    if not data:
        return [], None
    recs, first = [], None
    for m in data["matches"].values():
        if not m["settled"]:
            continue
        first = min(first, m["date"]) if first else m["date"]
        recs += [[m["div"], m["date"], p["kind"], p["p"], p["tier"], int(p["validated"]), int(p["hit"])]
                 for p in m["picks"] if p.get("hit") is not None]
    return recs, first


# ---------------------------------------------------------------- backtest
def run_backtest(leagues, seasons=("2526", "2627")):
    """Rejoue les pronostics semaine par semaine (modèle entraîné uniquement sur le passé)."""
    records = []
    for div in leagues:
        df = load(div)
        test = [r for r in df if r["season"] in seasons]
        weeks = sorted({r["Date"] - timedelta(days=r["Date"].weekday()) for r in test})
        for w in weeks:
            models = fit_all([r for r in df if r["Date"] < w], w)
            for r in (r for r in test if w <= r["Date"] < w + timedelta(days=7)):
                if r["HomeTeam"] not in models["goals"]["idx"] or r["AwayTeam"] not in models["goals"]["idx"]:
                    continue
                res = result_of(r)
                for p in make_picks(models, r["HomeTeam"], r["AwayTeam"]):
                    hit = p["rule"](res)
                    if hit is not None:
                        records.append([div, f'{r["Date"]:%Y-%m-%d}', p["kind"], p["p"], p["tier"], int(p["validated"]), int(hit)])
        print(f"[backtest] {div} terminé : {len(records)} pronostics cumulés", file=sys.stderr, flush=True)
        _write(BACKTEST_FILE, dict(generated=datetime.now().isoformat(timespec="minutes"), seasons=list(seasons), records=records))
    return records


def backtest_records():
    data = _read(BACKTEST_FILE)
    return (data["records"], data["seasons"]) if data else ([], [])


# ---------------------------------------------------------------- statistiques
def _stats(recs):
    n = len(recs)
    return dict(n=n, p=sum(r[3] for r in recs) / n, hit=sum(r[6] for r in recs) / n) if n else dict(n=0, p=0, hit=0)


def summary(recs):
    """Résumé : par catégorie (sûr / moins sûr), par tranche de probabilité et par type de marché."""
    buckets = []
    for lo, hi in zip(EDGES, EDGES[1:]):
        sub = [r for r in recs if lo <= r[3] < hi]
        buckets.append(dict(lo=lo, hi=min(hi, 1.0), **_stats(sub)))
    kinds = {}
    for r in recs:
        kinds.setdefault(r[2], []).append(r)
    kind_rows = sorted(({"kind": k, **_stats(v)} for k, v in kinds.items()), key=lambda x: -x["n"])
    return dict(total=_stats(recs), safe=_stats([r for r in recs if r[4] == 0]), less=_stats([r for r in recs if r[4] == 1]),
                buckets=buckets, kinds=kind_rows)


def monthly(recs, min_n=100):
    """Pronostics « sûrs » regroupés par mois : [(AAAA-MM, nombre, proba annoncée moyenne, part gagnée)]."""
    by = {}
    for r in recs:
        if r[4] == 0:
            by.setdefault(r[1][:7], []).append(r)
    return [(m, len(v), sum(x[3] for x in v) / len(v), sum(x[6] for x in v) / len(v)) for m, v in sorted(by.items()) if len(v) >= min_n]


def recent_results(today, days_back=1):
    """Matchs terminés des `days_back` derniers jours (hier compris) avec le résultat de chaque pronostic."""
    data = _read(TRACK_FILE)
    if not data:
        return []
    lo = f"{today - timedelta(days=days_back):%Y-%m-%d}"
    hi = f"{today - timedelta(days=1):%Y-%m-%d}"
    out = []
    for key, m in data["matches"].items():
        if m["settled"] and lo <= m["date"] <= hi:
            picks = [dict(m=p["market"], s=p["sel"], p=p["p"], t=p["tier"], v=bool(p["validated"]), h=bool(p["hit"]))
                     for p in m["picks"] if p.get("hit") is not None]
            out.append(dict(id=key, div=m["div"], date=m["date"], time=m.get("time", ""), home=m["home"], away=m["away"],
                            res=m.get("result", ""), picks=picks))
    out.sort(key=lambda x: (x["date"], x["time"]))
    return out


def daily_stats(days=120):
    """Par jour de matchs terminés : nombre de matchs, pronostics sûrs (sn) gagnés (sw), moins sûrs (ln) gagnés (lw)."""
    data = _read(TRACK_FILE)
    if not data:
        return []
    by = {}
    for m in data["matches"].values():
        if not m["settled"]:
            continue
        d = by.setdefault(m["date"], dict(date=m["date"], ms=0, sn=0, sw=0, ln=0, lw=0))
        d["ms"] += 1
        for p in m["picks"]:
            if p.get("hit") is None:
                continue
            if p["tier"] == 0:
                d["sn"] += 1
                d["sw"] += int(p["hit"])
            else:
                d["ln"] += 1
                d["lw"] += int(p["hit"])
    return sorted(by.values(), key=lambda x: x["date"])[-days:]


def market_stats(days=45):
    """Pronostics vérifiés par jour et par type de sélection : [date, clé, nombre, gagnés, somme des probabilités annoncées]."""
    data = _read(TRACK_FILE)
    if not data:
        return []
    lo = f"{datetime.now().date() - timedelta(days=days):%Y-%m-%d}"
    agg = {}
    for m in data["matches"].values():
        if not m["settled"] or m["date"] < lo:
            continue
        for p in m["picks"]:
            if p.get("hit") is None or p["p"] < 0.5:
                continue
            sel = p["sel"].replace(m["home"], "").replace(m["away"], "").strip(" -")
            key = f'{p.get("kind") or p["market"]} · {sel}' if sel else (p.get("kind") or p["market"])
            a = agg.setdefault((m["date"], key), [0, 0, 0.0])
            a[0] += 1
            a[1] += int(bool(p["hit"]))
            a[2] += p["p"]
    return [[d, k, v[0], v[1], round(v[2], 3)] for (d, k), v in sorted(agg.items())]


def reliability_data():
    bt, seasons = backtest_records()
    live, since = live_records()
    return dict(bt=summary(bt) if bt else None, seasons=seasons, live=summary(live) if live else None, since=since,
                monthly=monthly(bt), monthly_live=monthly(live, 30), daily=daily_stats(), mk=market_stats(),
                recent=recent_results(datetime.strptime(os.environ["TRACKING_TODAY"], "%Y-%m-%d").date() if os.environ.get("TRACKING_TODAY") else datetime.now().date()))
