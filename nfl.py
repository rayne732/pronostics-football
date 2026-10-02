"""Football américain (NFL) : points attendus de chaque équipe (attaque / défense / avantage du terrain, moindres carrés régularisés,
matchs récents plus pondérés), marges et totaux de points ~ lois normales. Même moteur que le basket.
Données : scoreboard ESPN (semaine par semaine pour l'historique, jour par jour pour le calendrier)."""
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta

from basket import _get, _iso, classify, expected, fit, sf, won
from tennis import paris

DATA = "data"
GAMES_FILE = os.path.join(DATA, "nfl_games.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
SEASONS = (2023, 2024, 2025, 2026)
LAM = 7.0
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
BACKTEST_FROM = date(2025, 9, 1)


# ------------------------------------------------------------------ données
def _row(e):
    c = e["competitions"][0]
    if not c["status"]["type"]["completed"]:
        return None
    home = next(x for x in c["competitors"] if x["homeAway"] == "home")
    away = next(x for x in c["competitors"] if x["homeAway"] == "away")
    return [str(e["id"]), e["date"][:16], home["team"]["displayName"], away["team"]["displayName"], int(float(home["score"])), int(float(away["score"])),
            (e.get("season") or {}).get("type", 2)]


def _load():
    try:
        with open(GAMES_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return []


def update(rows, today):
    have = {g[0]: g for g in rows}
    if not have:
        for season in SEASONS:
            for stype, weeks in ((2, range(1, 19)), (3, range(1, 6))):
                for wk in weeks:
                    try:
                        d = _get(f"{ESPN}?dates={season}&seasontype={stype}&week={wk}", 40)
                    except Exception:
                        continue
                    for e in d.get("events", []):
                        r = _row(e)
                        if r:
                            have[r[0]] = r
                    time.sleep(0.1)
    last = max((g[1][:10] for g in have.values()), default=None)
    if last:
        day, n = date.fromisoformat(last) + timedelta(days=1), 0
        while day < today and n < 20:
            try:
                d = _get(f"{ESPN}?dates={day:%Y%m%d}", 30)
            except Exception as exc:
                print(f"[avertissement] ESPN NFL {day} : {exc}", file=sys.stderr)
                break
            for e in d.get("events", []):
                r = _row(e)
                if r:
                    have[r[0]] = r
            day += timedelta(days=1)
            n += 1
    return sorted(have.values(), key=lambda g: g[1])


# ------------------------------------------------------------------ marchés
def families(M, home, away, lh, la):
    mm, mt = lh - la, lh + la
    pw = sf(0, mm, M["sdm"])
    F = [("Vainqueur du match", [[home, pw], [away, 1 - pw]], True, False)]
    base = round(mm)
    for team, sgn in ((home, 1), (away, -1)):
        sels = []
        for k in range(-14, 15, 2):
            line = math.floor(base * sgn + k + 0.5) + 0.5
            sels.append([f"{team} {line:+.1f}".replace(".", ","), sf(-line, mm * sgn, M["sdm"])])
        F.append(("Handicap", sels, False, False))
    tot = round(mt)
    lines = [tot + k + 0.5 for k in range(-21, 22, 3)]
    F.append(("Total points (plus)", [[f"Plus de {ln:.1f}".replace(".", ",") + " points", sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    F.append(("Total points (moins)", [[f"Moins de {ln:.1f}".replace(".", ",") + " points", 1 - sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    for team, mean in ((home, lh), (away, la)):
        tl = [round(mean) + k + 0.5 for k in range(-12, 13, 3)]
        F.append((f"Points de {team} (plus)", [[f"{team} plus de {ln:.1f}".replace(".", ","), sf(ln, mean, M["sdp"])] for ln in tl], False, False))
        F.append((f"Points de {team} (moins)", [[f"{team} moins de {ln:.1f}".replace(".", ","), 1 - sf(ln, mean, M["sdp"])] for ln in tl], False, False))
    return F


# ------------------------------------------------------------------ backtest
def backtest(games):
    rows = [g for g in games if g[1][:10] >= BACKTEST_FROM.isoformat() and g[6] == 2]
    recs, picks, M, key = [], [], None, None
    for g in rows:
        d = date.fromisoformat(g[1][:10])
        wk = (d - BACKTEST_FROM).days // 7
        if wk != key:
            M, key = fit(games, d, LAM), wk
        if not M:
            continue
        e = expected(M, g[2], g[3])
        if not e:
            continue
        recs.append((sf(0, e[0] - e[1], M["sdm"]), g[4] > g[5]))
        safe, _ = classify(families(M, g[2], g[3], *e))
        picks += [(r["p"], won(r, g[2], g[3], g[4], g[5])) for r in safe]
    if not recs:
        return {}
    n = len(recs)
    out = dict(n=n, ll=sum(-math.log(min(max(p if w else 1 - p, 1e-6), 1 - 1e-6)) for p, w in recs) / n, acc=sum((p > 0.5) == w for p, w in recs) / n, n_safe=len(picks), said=sum(p for p, _ in picks) / max(len(picks), 1),
               real=sum(w for _, w in picks) / max(len(picks), 1), since=BACKTEST_FROM.isoformat(), until=rows[-1][1][:10])
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
        sel = [(max(p, 1 - p), (p > 0.5) == w) for p, w in recs if lo <= max(p, 1 - p) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ assemblage
def _model_json(M):
    r = lambda d: {k: round(v, 2) for k, v in d.items()}
    return dict(mu=round(M["mu"], 3), ha=round(M["ha"], 3), sdm=round(M["sdm"], 2), sdt=round(M["sdt"], 2), sdp=round(M["sdp"], 2), att=r(M["att"]), dfn=r(M["dfn"]),
                safe=SAFE_MIN, less=LESS_SAFE_MIN)


def _window(start, end):
    out, day = [], start
    while day <= end:
        try:
            d = _get(f"{ESPN}?dates={day:%Y%m%d}", 30)
        except Exception as exc:
            print(f"[avertissement] ESPN NFL {day} : {exc}", file=sys.stderr)
            return out
        for e in d.get("events", []):
            c = e["competitions"][0]
            home = next(x for x in c["competitors"] if x["homeAway"] == "home")
            away = next(x for x in c["competitors"] if x["homeAway"] == "away")
            num = lambda x: int(float(x["score"])) if x.get("score") not in (None, "") else None
            out.append(dict(id=str(e["id"]), d=e["date"][:16], home=home["team"]["displayName"], away=away["team"]["displayName"], state=c["status"]["type"]["state"],
                            hs=num(home), as_=num(away), week=(e.get("week") or {}).get("number")))
        day += timedelta(days=1)
    return out


def build(now, days=5):
    games = _load()
    today = now.date()
    start, end = today - timedelta(days=1), today + timedelta(days=days)
    try:
        games = update(games, today)
    except Exception as exc:
        print(f"[avertissement] historique NFL : {exc}", file=sys.stderr)
    if not games:
        return {}
    os.makedirs(DATA, exist_ok=True)
    with open(GAMES_FILE, "w", encoding="utf-8") as fh:
        json.dump(games, fh, separators=(",", ":"))
    M = fit(games, start, LAM)
    if not M:
        return {}
    bt = backtest(games)
    items, seen = [], set()
    for g in _window(start, end):
        when = paris(_iso(g["d"]))
        if g["id"] in seen or not (start <= when.date() <= end):
            continue
        seen.add(g["id"])
        e = expected(M, g["home"], g["away"])
        known = bool(e)
        lh, la = e if e else (M["mu"], M["mu"])
        safe, less = classify(families(M, g["home"], g["away"], lh, la)) if known else ([], [])
        p = sf(0, lh - la, M["sdm"])
        it = dict(id=g["id"], date=when.date().isoformat(), time=f"{when:%H:%M}", state=g["state"], home=g["home"], away=g["away"], p=round(p, 4), lh=round(lh, 1), la=round(la, 1),
                  known=known, label=f"Semaine {g['week']}" if g["week"] else "", safe=safe, less=less)
        if g["state"] == "post" and g["hs"] is not None and g["as_"] is not None:
            it.update(hs=g["hs"], as_=g["as_"], hit=((p > 0.5) == (g["hs"] > g["as_"])) if known else None)
            if known:
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, g["home"], g["away"], g["hs"], g["as_"]), t=t) for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    items.sort(key=lambda x: (x["date"], x["time"]))
    return dict(matches=items, bt=bt, model=_model_json(M), generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s;", len(d.get("matches", [])), "matchs")
    b = d.get("bt", {})
    print({k: round(v, 3) if isinstance(v, float) else v for k, v in b.items() if k != "bins"}, [(x["lo"], x["n"], round(x["said"], 3), round(x["real"], 3)) for x in b.get("bins", [])])
    for m in d.get("matches", [])[:8]:
        print(m["date"], m["time"], m["home"], "-", m["away"], m["p"], m["lh"], m["la"], m["state"], m.get("hit"), len(m["safe"]), m["label"])
