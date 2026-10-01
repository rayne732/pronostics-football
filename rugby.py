"""Rugby à XV (Top 14, Premiership, URC) : même modèle de points que le basket (attaque / défense / avantage du terrain par équipe,
marges et totaux ~ lois normales) avec le match nul en plus. Données : scoreboard ESPN (résultats depuis 2024 et calendrier)."""
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta

from basket import _get, _iso, expected, fit, ncdf
from tennis import paris

DATA = "data"
GAMES_FILE = os.path.join(DATA, "rugby_games.json")
BASE = "https://site.api.espn.com/apis/site/v2/sports/rugby/{id}/scoreboard"
LEAGUES = {"T14": ("270559", "Top 14"), "PRM": ("267979", "Premiership"), "URC": ("270557", "URC")}
FIRST_YEAR = 2024
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
LAM = 5.0
BACKTEST_FROM = date(2025, 10, 1)


# ------------------------------------------------------------------ données
ALIAS = {"LOU Rugby": "Lyon", "Bordeaux": "Bordeaux Begles"}      # ESPN nomme parfois deux fois la même équipe


def _parse(e):
    c = e["competitions"][0]
    home = next(x for x in c["competitors"] if x["homeAway"] == "home")
    away = next(x for x in c["competitors"] if x["homeAway"] == "away")
    num = lambda x: int(float(x["score"])) if x.get("score") not in (None, "") else None
    nm = lambda x: ALIAS.get(x["team"]["displayName"], x["team"]["displayName"])
    return dict(id=str(e["id"]), d=e["date"][:16], home=nm(home), away=nm(away), state=c["status"]["type"]["state"],
                hs=num(home), as_=num(away), label=((e.get("season") or {}).get("slug") or "").replace("-", " "))


def _load_cache():
    try:
        with open(GAMES_FILE, encoding="utf-8") as fh:
            cache = json.load(fh)
        for rows in cache.values():
            for g in rows:
                g[2], g[3] = ALIAS.get(g[2], g[2]), ALIAS.get(g[3], g[3])
        return cache
    except (OSError, ValueError):
        return {}


def update(cache, today):
    """Historique des matchs terminés : années complètes au premier lancement, puis jour par jour."""
    for lg, (lid, _) in LEAGUES.items():
        games = {g[0]: g for g in cache.get(lg, [])}
        if not games:
            for year in range(FIRST_YEAR, today.year + 1):
                try:
                    d = _get(BASE.format(id=lid) + f"?dates={year}&limit=1000", 90)
                except Exception as exc:
                    print(f"[avertissement] ESPN {lg} {year} : {exc}", file=sys.stderr)
                    continue
                for e in d.get("events", []):
                    r = _parse(e)
                    if r["state"] == "post" and r["hs"] is not None and r["as_"] is not None:
                        games[f'{lg}_{r["id"]}'] = [f'{lg}_{r["id"]}', r["d"], r["home"], r["away"], r["hs"], r["as_"], 2]
                time.sleep(0.3)
        last = max((g[1][:10] for g in games.values()), default=None)
        if last:
            day, n = date.fromisoformat(last) + timedelta(days=1), 0
            while day < today and n < 25:
                try:
                    d = _get(BASE.format(id=lid) + f"?dates={day:%Y%m%d}", 30)
                except Exception as exc:
                    print(f"[avertissement] ESPN {lg} {day} : {exc}", file=sys.stderr)
                    break
                for e in d.get("events", []):
                    r = _parse(e)
                    if r["state"] == "post" and r["hs"] is not None and r["as_"] is not None:
                        games[f'{lg}_{r["id"]}'] = [f'{lg}_{r["id"]}', r["d"], r["home"], r["away"], r["hs"], r["as_"], 2]
                day += timedelta(days=1)
                n += 1
        cache[lg] = sorted(games.values(), key=lambda g: g[1])
    return cache


def window(start, end):
    """Matchs (tous statuts) des jours [start, end] pour les trois championnats."""
    out = []
    for lg, (lid, _) in LEAGUES.items():
        day = start
        while day <= end:
            try:
                d = _get(BASE.format(id=lid) + f"?dates={day:%Y%m%d}", 30)
            except Exception as exc:
                print(f"[avertissement] ESPN {lg} {day} : {exc}", file=sys.stderr)
                break
            for e in d.get("events", []):
                r = _parse(e)
                out.append(dict(lg=lg, **r))
            day += timedelta(days=1)
    return out


# ------------------------------------------------------------------ marchés
def probs(M, lh, la):
    """(P domicile, P nul, P extérieur) : la marge est une loi normale, le nul = écart de moins d'un demi-point."""
    mm = lh - la
    sd = M["sdm"]
    pd = ncdf((0.5 - mm) / sd) - ncdf((-0.5 - mm) / sd)
    ph = 1 - ncdf((0.5 - mm) / sd)
    return ph, pd, 1 - ph - pd


def sf(x, mean, sd):
    return 1 - ncdf((x - mean) / sd)


def families(M, home, away, lh, la):
    mm, mt = lh - la, lh + la
    ph, pd, pa = probs(M, lh, la)
    F = [("Résultat du match", [[home, ph], ["Match nul", pd], [away, pa]], True, False),
         ("Double chance", [[home + " ou nul", ph + pd], [away + " ou nul", pa + pd], [home + " ou " + away, ph + pa]], True, False)]
    base = round(mm)
    for team, sgn in ((home, 1), (away, -1)):
        sels = []
        for k in range(-24, 25, 3):
            line = math.floor(base * sgn + k + 0.5) + 0.5
            sels.append([f"{team} {line:+.1f}".replace(".", ","), sf(-line, mm * sgn, M["sdm"])])
        F.append(("Handicap", sels, False, False))
    tot = round(mt)
    lines = [tot + k + 0.5 for k in range(-24, 25, 6)]
    F.append(("Total points (plus)", [[f"Plus de {ln:.1f}".replace(".", ",") + " points", sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    F.append(("Total points (moins)", [[f"Moins de {ln:.1f}".replace(".", ",") + " points", 1 - sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    for team, mean in ((home, lh), (away, la)):
        tl = [round(mean) + k + 0.5 for k in range(-15, 16, 5)]
        F.append((f"Points de {team} (plus)", [[f"{team} plus de {ln:.1f}".replace(".", ","), sf(ln, mean, M["sdp"])] for ln in tl], False, False))
        F.append((f"Points de {team} (moins)", [[f"{team} moins de {ln:.1f}".replace(".", ","), 1 - sf(ln, mean, M["sdp"])] for ln in tl], False, False))
    return F


def classify(F):
    safe, less = [], []
    for name, sels, validated, lottery in F:
        items = sorted(sels, key=lambda s: -s[1])
        rec = lambda it: dict(m=name, s=it[0], p=round(it[1], 4), v=True, sels=[[s[0], round(s[1], 4)] for s in sels])
        ok = [s for s in items if s[1] >= SAFE_MIN]
        if ok:
            safe.append(rec(min(ok, key=lambda s: s[1])))
        elif items[0][1] >= LESS_SAFE_MIN:
            less.append(rec(items[0]))
    key = lambda r: -r["p"]
    return sorted(safe, key=key), sorted(less, key=key)


def won(rec, home, away, hs, as_):
    s, m = rec["s"], rec["m"]
    if m == "Résultat du match":
        return s == (home if hs > as_ else away if as_ > hs else "Match nul")
    if m == "Double chance":
        if s == home + " ou nul":
            return hs >= as_
        if s == away + " ou nul":
            return as_ >= hs
        return hs != as_
    if m == "Handicap":
        team, line = s.rsplit(" ", 1)
        line = float(line.replace(",", "."))
        return (hs - as_ + line > 0) if team == home else (as_ - hs + line > 0)
    if m.startswith("Total points"):
        ln = float(s.split(" ")[-2].replace(",", "."))
        return (hs + as_ > ln) if s.startswith("Plus") else (hs + as_ < ln)
    ln = float(s.rsplit(" ", 1)[1].replace(",", "."))
    team = m[len("Points de "):m.rindex(" (")]
    pts = hs if team == home else as_
    return pts > ln if m.endswith("(plus)") else pts < ln


# ------------------------------------------------------------------ backtest
def backtest(games, lg):
    rows = [g for g in games if g[1][:10] >= BACKTEST_FROM.isoformat()]
    recs, picks, M, month = [], [], None, None
    for g in rows:
        d = date.fromisoformat(g[1][:10])
        if (d.year, d.month) != month:
            M, month = fit(games, d, LAM), (d.year, d.month)
        if not M:
            continue
        e = expected(M, g[2], g[3])
        if not e:
            continue
        ph, pd, pa = probs(M, *e)
        recs.append((ph, pd, pa, g[4], g[5]))
        safe, _ = classify(families(M, g[2], g[3], *e))
        picks += [(r["p"], won(r, g[2], g[3], g[4], g[5])) for r in safe]
    if not recs:
        return {}
    n = len(recs)
    dec = [r for r in recs if r[3] != r[4]]
    out = dict(n=n, acc=sum((r[0] > r[2]) == (r[3] > r[4]) for r in dec) / max(len(dec), 1), n_safe=len(picks),
               said=sum(p for p, _ in picks) / max(len(picks), 1), real=sum(w for _, w in picks) / max(len(picks), 1),
               since=BACKTEST_FROM.isoformat(), until=rows[-1][1][:10])
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
        sel = [(max(r[0], r[2]), (r[0] > r[2]) == (r[3] > r[4])) for r in dec if lo <= max(r[0], r[2]) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ assemblage
def _model_json(M):
    r = lambda d: {k: round(v, 2) for k, v in d.items()}
    return dict(mu=round(M["mu"], 3), ha=round(M["ha"], 3), sdm=round(M["sdm"], 2), sdt=round(M["sdt"], 2), sdp=round(M["sdp"], 2), att=r(M["att"]), dfn=r(M["dfn"]))


def build(now, days=7):
    cache = _load_cache()
    today = now.date()
    start, end = today - timedelta(days=1), today + timedelta(days=days)
    try:
        cache = update(cache, today)
    except Exception as exc:
        print(f"[avertissement] historique rugby : {exc}", file=sys.stderr)
    if not any(cache.get(lg) for lg in LEAGUES):
        return {}
    os.makedirs(DATA, exist_ok=True)
    with open(GAMES_FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, separators=(",", ":"))
    models, model_js, bt = {}, {}, {}
    for lg in LEAGUES:
        if cache.get(lg):
            M = fit(cache[lg], start, LAM)
            if M:
                models[lg], model_js[lg] = M, _model_json(M)
            bt[lg] = backtest(cache[lg], lg)
    items = []
    for g in window(start, end):
        when = paris(_iso(g["d"]))
        if g["lg"] not in models or not (start <= when.date() <= end):
            continue
        M = models[g["lg"]]
        e = expected(M, g["home"], g["away"])
        known = bool(e)
        lh, la = e if e else (M["mu"], M["mu"])
        ph, pd, pa = probs(M, lh, la)
        safe, less = classify(families(M, g["home"], g["away"], lh, la)) if known else ([], [])
        it = dict(id=g["id"], lg=g["lg"], date=when.date().isoformat(), time=f"{when:%H:%M}", state=g["state"], home=g["home"], away=g["away"],
                  p=[round(ph, 4), round(pd, 4), round(pa, 4)], lh=round(lh, 1), la=round(la, 1), known=known, safe=safe, less=less)
        if g["state"] == "post" and g["hs"] is not None:
            it.update(hs=g["hs"], as_=g["as_"])
            fav = 0 if ph >= pa else 2
            it["hit"] = (g["hs"] > g["as_"] and fav == 0) or (g["as_"] > g["hs"] and fav == 2) if known else None
            if known:
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, g["home"], g["away"], g["hs"], g["as_"]), t=t)
                               for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    items.sort(key=lambda x: (x["date"], x["time"], x["lg"]))
    return dict(matches=items, bt=bt, model=dict(m=model_js, safe=SAFE_MIN, less=LESS_SAFE_MIN), generated=f"{now:%d/%m/%Y à %H:%M}",
                names={k: v[1] for k, v in LEAGUES.items()}, ids={k: v[0] for k, v in LEAGUES.items()}, alias=ALIAS)


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s", len(d.get("matches", [])), "matchs")
    print(json.dumps(d.get("bt"), indent=1)[:1500])
    for m in d.get("matches", [])[:8]:
        print(m["date"], m["time"], m["lg"], m["home"], "-", m["away"], m["p"], m["lh"], m["la"], m["state"], m.get("hit"), len(m["safe"]))
