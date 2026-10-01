"""Formule 1 : modèle de classement de Plackett-Luce (niveau du pilote + niveau de la voiture, pondérés par la date) ajusté sur les
résultats des Grands Prix depuis 2023 ; après les qualifications, la place sur la grille entre dans le calcul. Les probabilités
(victoire, podium, top 6, top 10, pole, duels) viennent de 20 000 courses simulées. Données : API Jolpica (successeur d'Ergast)."""
import json
import math
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

import numpy as np
from scipy.optimize import minimize

DATA = "data"
FILE = os.path.join(DATA, "f1_races.json")
BASE = "https://api.jolpi.ca/ergast/f1/"
UA = {"User-Agent": "Mozilla/5.0"}
SEASONS = (2023, 2024, 2025, 2026)
HALF_LIFE = 150.0                 # jours : la voiture change vite d'une saison à l'autre
L2 = 0.05
SIMS = 20000
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
BACKTEST_FROM = date(2025, 1, 1)


# ------------------------------------------------------------------ données
def _get(path):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=40) as resp:
                return json.load(resp)["MRData"]
        except Exception:
            time.sleep(2 + attempt * 3)
    raise RuntimeError("Jolpica indisponible : " + path)


def _pages(path):
    out, off = [], 0
    while True:
        d = _get(f"{path}{'&' if '?' in path else '?'}limit=100&offset={off}")
        out.append(d)
        off += 100
        if off >= int(d["total"]):
            return out
        time.sleep(0.4)


def _races(season, kind):
    """kind : « results » ou « qualifying » -> {round: [lignes]}"""
    out = {}
    for d in _pages(f"{season}/{kind}.json"):
        for r in d["RaceTable"]["Races"]:
            key = "Results" if kind == "results" else "QualifyingResults"
            rows = out.setdefault(r["round"], dict(name=r["raceName"], date=r["date"], rows=[]))
            for x in r[key]:
                rows["rows"].append(dict(d=x["Driver"]["driverId"], n=f'{x["Driver"]["givenName"]} {x["Driver"]["familyName"]}', code=x["Driver"].get("code", ""),
                                         c=x["Constructor"]["constructorId"], cn=x["Constructor"]["name"], pos=int(x["position"]),
                                         grid=int(x["grid"]) if kind == "results" and x.get("grid") else None,
                                         ok=x.get("status", "") == "Finished" or x.get("status", "").startswith("+")))
    return out


def load_data(today):
    try:
        with open(FILE, encoding="utf-8") as fh:
            cache = json.load(fh)
    except (OSError, ValueError):
        cache = {}
    seasons = [s for s in SEASONS if str(s) not in cache or s == today.year]
    for s in seasons:
        try:
            cache[str(s)] = dict(results=_races(s, "results"), quali=_races(s, "qualifying"))
        except Exception as exc:
            print(f"[avertissement] F1 {s} : {exc}", file=sys.stderr)
    os.makedirs(DATA, exist_ok=True)
    with open(FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, separators=(",", ":"))
    return cache


def schedule(year):
    d = _get(f"{year}.json?limit=100")
    return d["RaceTable"]["Races"]


# ------------------------------------------------------------------ modèle
def _races_before(cache, asof, kind="results"):
    out = []
    for s in sorted(cache, key=int):
        for rnd, r in cache[s][kind if kind == "results" else "quali"].items():
            if r["date"] < asof.isoformat() and len(r["rows"]) >= 10:
                out.append((date.fromisoformat(r["date"]), r))
    return sorted(out, key=lambda x: x[0])


def fit(cache, asof, kind="results", use_grid=False):
    """Plackett-Luce : utilité = niveau pilote + niveau écurie (- gamma * log(grille) si use_grid)."""
    races = _races_before(cache, asof, kind)
    if len(races) < 8:
        return None
    drivers = sorted({x["d"] for _, r in races for x in r["rows"]})
    cons = sorted({x["c"] for _, r in races for x in r["rows"]})
    di, ci = {d: i for i, d in enumerate(drivers)}, {c: i for i, c in enumerate(cons)}
    nd, nc = len(drivers), len(cons)
    data = []
    for dt, r in races:
        rows = sorted(r["rows"], key=lambda x: x["pos"])
        grid = np.array([(x["grid"] if x.get("grid") else 20) if kind == "results" else 20 for x in rows], float)
        grid = np.where(grid <= 0, 20, grid)
        data.append((np.array([di[x["d"]] for x in rows]), np.array([ci[x["c"]] for x in rows]), np.log(grid), math.exp(-math.log(2) * (asof - dt).days / HALF_LIFE)))

    def nll(p):
        d, c, gam = p[:nd], p[nd:nd + nc], p[nd + nc]
        val, g = 0.0, np.zeros_like(p)
        for di_, ci_, lg, w in data:
            s = d[di_] + c[ci_] - (gam * lg if use_grid else 0.0)
            n = len(s)
            m = s.max()
            e = np.exp(s - m)
            tail = np.cumsum(e[::-1])[::-1]
            lse = np.log(tail) + m
            val += w * (lse - s).sum()
            P = np.triu(e[None, :] / tail[:, None])        # P[k, j] = e_j / sum_{i>=k} e_i pour j >= k
            gs = P.sum(axis=0) - 1.0                        # dérivée de la perte par rapport à s_j
            np.add.at(g, di_, w * gs)
            np.add.at(g, nd + ci_, w * gs)
            if use_grid:
                g[nd + nc] += w * (-(gs * lg)).sum()
        val += L2 * (d @ d + c @ c)
        g[:nd] += 2 * L2 * d
        g[nd:nd + nc] += 2 * L2 * c
        return val, g

    p0 = np.zeros(nd + nc + 1)
    if use_grid:
        p0[-1] = 0.5
    bounds = [(None, None)] * (nd + nc) + [(0, 3) if use_grid else (0, 0)]
    p = minimize(nll, p0, jac=True, method="L-BFGS-B", bounds=bounds).x
    return dict(d={k: float(p[i]) for k, i in di.items()}, c={k: float(p[nd + i]) for k, i in ci.items()}, gam=float(p[-1]))


def simulate(M, entries, use_grid, seed=1):
    """entries : [dict(d, c, grid)] -> matrice des places simulées (SIMS x n)."""
    rng = np.random.default_rng(seed)
    s = np.array([M["d"].get(e["d"], 0.0) + M["c"].get(e["c"], 0.0) - (M["gam"] * math.log(e["grid"]) if use_grid and e.get("grid") else 0.0) for e in entries])
    g = rng.gumbel(size=(SIMS, len(entries)))
    order = np.argsort(-(s + g), axis=1)
    pos = np.empty_like(order)
    rows = np.arange(SIMS)[:, None]
    pos[rows, order] = np.arange(1, len(entries) + 1)[None, :]
    return pos


def probs(M, entries, use_grid):
    pos = simulate(M, entries, use_grid)
    return dict(win=(pos == 1).mean(0), pod=(pos <= 3).mean(0), top6=(pos <= 6).mean(0), top10=(pos <= 10).mean(0)), pos


# ------------------------------------------------------------------ backtest
def backtest(cache):
    """Pour chaque course depuis 2025 : modèle ajusté avec les courses précédentes ; probabilités avec la grille réelle (après qualifs)."""
    rows = []
    for s in sorted(cache, key=int):
        for rnd, r in cache[s]["results"].items():
            if date.fromisoformat(r["date"]) >= BACKTEST_FROM and len(r["rows"]) >= 10:
                rows.append((date.fromisoformat(r["date"]), r))
    rows.sort(key=lambda x: x[0])
    obs = {k: [] for k in ("win", "pod", "top6", "top10")}
    top1 = 0
    n_races = 0
    for dt, r in rows:
        M = fit(cache, dt, use_grid=True)
        if not M:
            continue
        entries = [dict(d=x["d"], c=x["c"], grid=x["grid"] or 20) for x in r["rows"]]
        pr, _ = probs(M, entries, True)
        actual = np.array([x["pos"] for x in r["rows"]])
        thr = dict(win=1, pod=3, top6=6, top10=10)
        for k in obs:
            obs[k] += list(zip(pr[k], actual <= thr[k]))
        top1 += int(actual[int(np.argmax(pr["win"]))] == 1)
        n_races += 1
    out = dict(races=n_races, top1=top1 / max(n_races, 1), since=BACKTEST_FROM.isoformat(), markets={})
    for k, lst in obs.items():
        a = np.array([x[0] for x in lst])
        w = np.array([x[1] for x in lst], float)
        bins = []
        for lo, hi in ((0.05, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.85), (0.85, 1.01)):
            m = (a >= lo) & (a < hi)
            if m.sum():
                bins.append(dict(lo=lo, hi=min(hi, 1), n=int(m.sum()), said=float(a[m].mean()), real=float(w[m].mean())))
        sure = a >= SAFE_MIN
        out["markets"][k] = dict(n_safe=int(sure.sum()), said=float(a[sure].mean()) if sure.any() else None, real=float(w[sure].mean()) if sure.any() else None, bins=bins)
    return out


# ------------------------------------------------------------------ assemblage
MARKETS = (("win", "Vainqueur du Grand Prix"), ("pod", "Podium (top 3)"), ("top6", "Top 6"), ("top10", "Top 10 (points)"))


def _entry_list(cache, year):
    """Pilotes engagés : ceux de la dernière course de la saison (ou de la précédente si la saison n'a pas commencé)."""
    for y in (year, year - 1):
        races = cache.get(str(y), {}).get("results", {})
        if races:
            last = races[max(races, key=int)]
            return [dict(d=x["d"], c=x["c"], n=x["n"], code=x["code"], cn=x["cn"]) for x in last["rows"]]
    return []


def build(now):
    today = now.date()
    cache = load_data(today)
    if not cache:
        return {}
    try:
        sched = schedule(today.year)
    except Exception as exc:
        print(f"[avertissement] calendrier F1 : {exc}", file=sys.stderr)
        sched = []
    start = today - timedelta(days=1)
    nxt = next((r for r in sched if date.fromisoformat(r["date"]) >= start), None)
    prev_rows = [(date.fromisoformat(r["date"]), r) for r in cache.get(str(today.year), {}).get("results", {}).values() if r["rows"]]
    prev = max(prev_rows, key=lambda x: x[0])[1] if prev_rows else None
    out = dict(generated=f"{now:%d/%m/%Y à %H:%M}", bt=None, next=None, last=None)
    bt_path = os.path.join(DATA, "f1_backtest.json")
    try:
        with open(bt_path, encoding="utf-8") as fh:
            saved = json.load(fh)
    except (OSError, ValueError):
        saved = {}
    key = f'{today.year}-{len(cache.get(str(today.year), {}).get("results", {}))}'
    if saved.get("key") != key:
        saved = dict(key=key, bt=backtest(cache))
        with open(bt_path, "w", encoding="utf-8") as fh:
            json.dump(saved, fh)
    out["bt"] = saved["bt"]

    if nxt:
        rnd = nxt["round"]
        qd = (cache.get(str(today.year), {}).get("quali", {}) or {}).get(rnd)
        grid = {x["d"]: x["pos"] for x in qd["rows"]} if qd else {}
        done = rnd in cache.get(str(today.year), {}).get("results", {})
        entries = _entry_list(cache, today.year)
        for e in entries:
            e["grid"] = grid.get(e["d"])
        use_grid = bool(grid) and all(e["grid"] for e in entries)
        asof = date.fromisoformat(nxt["date"])
        M = fit(cache, asof, use_grid=use_grid)
        if M and entries and not done:
            pr, pos = probs(M, entries, use_grid)
            drivers = []
            for i, e in enumerate(entries):
                drivers.append(dict(d=e["d"], n=e["n"], code=e["code"], c=e["c"], cn=e["cn"], grid=e.get("grid"),
                                    win=round(float(pr["win"][i]), 4), pod=round(float(pr["pod"][i]), 4), top6=round(float(pr["top6"][i]), 4), top10=round(float(pr["top10"][i]), 4)))
            drivers.sort(key=lambda x: -x["win"])
            duels = []
            by_team = {}
            for i, e in enumerate(entries):
                by_team.setdefault(e["c"], []).append(i)
            for c, idx in by_team.items():
                if len(idx) == 2:
                    a, b = idx
                    p = float((pos[:, a] < pos[:, b]).mean())
                    duels.append(dict(a=entries[a]["n"], b=entries[b]["n"], team=entries[a]["cn"], p=round(p, 4)))
            pole = None
            Mq = fit(cache, asof, kind="quali")
            if Mq and not grid:
                prq, _ = probs(Mq, entries, False)
                pole = sorted([dict(n=e["n"], p=round(float(prq["win"][i]), 4)) for i, e in enumerate(entries)], key=lambda x: -x["p"])[:6]
            sess = {k: nxt[k] for k in ("FirstPractice", "SecondPractice", "ThirdPractice", "Qualifying", "Sprint", "SprintQualifying") if k in nxt}
            out["next"] = dict(round=rnd, name=nxt["raceName"], circuit=nxt["Circuit"]["circuitName"], date=nxt["date"], time=nxt.get("time", ""), sessions=sess,
                               use_grid=use_grid, drivers=drivers, duels=sorted(duels, key=lambda x: -abs(x["p"] - 0.5)), pole=pole)
    if prev:
        # pronostic d'avant course (avec la grille), refait sans connaître le résultat
        d0 = date.fromisoformat(prev["date"])
        M = fit(cache, d0, use_grid=True)
        rows = prev["rows"]
        if M:
            entries = [dict(d=x["d"], c=x["c"], grid=x["grid"] or 20) for x in rows]
            pr, _ = probs(M, entries, True)
            res = []
            for i, x in enumerate(sorted(rows, key=lambda x: x["pos"])):
                j = next(k for k, y in enumerate(rows) if y["d"] == x["d"])
                res.append(dict(n=x["n"], cn=x["cn"], pos=x["pos"], grid=x["grid"], win=round(float(pr["win"][j]), 4), pod=round(float(pr["pod"][j]), 4),
                                top6=round(float(pr["top6"][j]), 4), top10=round(float(pr["top10"][j]), 4)))
            out["last"] = dict(name=prev["name"], date=prev["date"], results=res)
    return out


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s")
    print(json.dumps(d.get("bt"), indent=1)[:2500])
    n = d.get("next")
    if n:
        print(n["name"], n["date"], "grille", n["use_grid"])
        for x in n["drivers"][:8]:
            print(x["n"], x["cn"], x["win"], x["pod"], x["top6"], x["top10"])
        print(n["pole"], n["duels"][:3])
    l = d.get("last")
    if l:
        print(l["name"], [(x["n"], x["pos"], x["win"], x["pod"]) for x in l["results"][:5]])
