"""Test de rentabilité : parier 1 unité quand (probabilité du modèle x cote) - 1 dépasse un seuil.
Marchés : 1X2 et plus/moins de 2,5 buts. Cotes réelles d'avant-match des fichiers football-data.co.uk
(Bet365, moyenne du marché, meilleure cote). Modèle réentraîné chaque semaine sur le passé uniquement."""
import json
import os
import sys
from datetime import datetime, timedelta

import numpy as np

from bot import LEAGUES
from poisson import fit, load, score_grid

SEASONS = ("2324", "2425", "2526", "2627")
CACHE = "data/value_records.json"
SUMMARY = "data/value_summary.json"
SOURCES = {"Bet365": ("B365H", "B365D", "B365A", "B365>2.5", "B365<2.5"),
           "Moyenne marché": ("AvgH", "AvgD", "AvgA", "Avg>2.5", "Avg<2.5"),
           "Meilleure cote": ("MaxH", "MaxD", "MaxA", "Max>2.5", "Max<2.5")}
THRESHOLDS = (0.0, 0.05, 0.10, 0.20)


def num(row, k):
    try:
        v = float(row[k])
        return v if v > 1 else None
    except (KeyError, ValueError, TypeError):
        return None


def collect():
    recs = []
    for div in LEAGUES:
        df = load(div)
        test = [r for r in df if r["season"] in SEASONS]
        for w in sorted({r["Date"] - timedelta(days=r["Date"].weekday()) for r in test}):
            m = fit([r for r in df if r["Date"] < w], w)
            for r in (r for r in test if w <= r["Date"] < w + timedelta(days=7)):
                if r["HomeTeam"] not in m["idx"] or r["AwayTeam"] not in m["idx"]:
                    continue
                grid, _ = score_grid(m, r["HomeTeam"], r["AwayTeam"])
                n = grid.shape[0]
                tot = np.add.outer(np.arange(n), np.arange(n))
                p = dict(H=float(np.tril(grid, -1).sum()), D=float(np.trace(grid)), A=float(np.triu(grid, 1).sum()),
                         O=float(grid[tot > 2.5].sum()), U=float(grid[tot < 2.5].sum()))
                g = r["FTHG"] + r["FTAG"]
                out = dict(H=r["FTR"] == "H", D=r["FTR"] == "D", A=r["FTR"] == "A", O=g > 2.5, U=g < 2.5)
                odds = {src: dict(zip("HDAOU", (num(r, c) for c in cols))) for src, cols in SOURCES.items()}
                recs.append(dict(div=div, season=r["season"], p=p, out=out, odds=odds))
        print(f"[value] {div} : {len(recs)} matchs", file=sys.stderr, flush=True)
    with open(CACHE, "w", encoding="utf-8") as fh:
        json.dump(recs, fh, separators=(",", ":"))
    return recs


def bets(recs, src, keys, t):
    """Une mise par match et par marché : la sélection au plus grand avantage si >= t. -> liste de retours nets."""
    out = []
    for r in recs:
        cand = [(r["p"][k] * r["odds"][src][k] - 1, k) for k in keys if r["odds"][src][k]]
        if len(cand) < len(keys):
            continue
        edge, k = max(cand)
        if edge >= t:
            out.append((r["odds"][src][k] - 1) if r["out"][k] else -1.0)
    return np.array(out)


def fmt(x):
    if len(x) < 30:
        return f"{len(x):5d} paris (trop peu)"
    roi, se = x.mean(), x.std(ddof=1) / np.sqrt(len(x))
    return f"{len(x):5d} paris | gagnés {np.mean(x > 0):4.0%} | ROI {roi:+6.1%} ± {se:.1%}"


def main():
    recs = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) and "--reuse" in sys.argv else collect()
    print(f"\n{len(recs)} matchs, saisons {', '.join(SEASONS)}, 6 championnats\n")
    for label, keys in (("1X2", "HDA"), ("Plus/Moins 2,5 buts", "OU")):
        print(f"=== {label} : mise 1 unité, ROI = gain net / mise ===")
        for src in SOURCES:
            print(f"-- cotes {src}")
            for t in THRESHOLDS:
                print(f"   avantage >= {t:>4.0%} : {fmt(bets(recs, src, keys, t))}")
        print()
    print("=== Stabilité par saison (1X2 + O/U confondus, cotes Moyenne marché, avantage >= 5 %) ===")
    for s in SEASONS:
        sub = [r for r in recs if r["season"] == s]
        x = np.r_[bets(sub, "Moyenne marché", "HDA", 0.05), bets(sub, "Moyenne marché", "OU", 0.05)]
        print(f"   {s[:2]}/{s[2:]} : {fmt(x)}")
    summary = dict(generated=datetime.now().strftime("%Y-%m-%d"), matches=len(recs), seasons=list(SEASONS), rows=[])
    for label, keys in (("1X2", "HDA"), ("Plus/moins 2,5 buts", "OU")):
        for src in SOURCES:
            for t in THRESHOLDS:
                x = bets(recs, src, keys, t)
                if len(x) >= 30:
                    summary["rows"].append(dict(market=label, source=src, edge=t, n=int(len(x)), roi=float(x.mean()),
                                                se=float(x.std(ddof=1) / np.sqrt(len(x)))))
    with open(SUMMARY, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, separators=(",", ":"))
    allbets = np.r_[bets(recs, "Moyenne marché", "HDA", -9), bets(recs, "Moyenne marché", "OU", -9)]
    print(f"\nRepère : parier sur tous les matchs, sans seuil (sélection au plus grand avantage, cotes moyennes) : {fmt(allbets)}")


if __name__ == "__main__":
    main()
