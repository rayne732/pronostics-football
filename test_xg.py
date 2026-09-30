"""Les vrais xG (colonnes HxG/AxG, disponibles depuis 2026/27) améliorent-ils le modèle ?
Backtest sur la saison en cours, 6 championnats cumulés, réentraînement chaque semaine.
Cible d'entraînement = alpha * buts + (1 - alpha) * xG (buts quand le xG n'existe pas, pour les saisons passées)."""
import sys
from datetime import datetime, timedelta

import numpy as np

from bot import LEAGUES
from poisson import fit, load, predict

MIN_MATCHES = 400
ALPHAS = (1.0, 0.75, 0.5, 0.25, 0.0)


def main():
    rows = []                                               # (résultat, {alpha: probas}, cotes)
    for div in LEAGUES:
        df = load(div)
        cur = df[-1]["season"]
        test = [r for r in df if r["season"] == cur]
        if not test:
            continue
        weeks = sorted({r["Date"] - timedelta(days=r["Date"].weekday()) for r in test})
        for w in weeks[1:]:                                 # 1re semaine : trop peu de xG pour apprendre
            train = [r for r in df if r["Date"] < w]
            models = {a: fit(train, w, alpha=a, proxy="xg") for a in ALPHAS}
            for r in (r for r in test if w <= r["Date"] < w + timedelta(days=7)):
                if r["HomeTeam"] not in models[1.0]["idx"] or r["AwayTeam"] not in models[1.0]["idx"]:
                    continue
                try:
                    o = np.array([float(r["AvgH"]), float(r["AvgD"]), float(r["AvgA"])])
                    q = (1 / o) / (1 / o).sum()
                except (KeyError, ValueError):
                    q = None
                rows.append(("HDA".index(r["FTR"]), {a: predict(m, r) for a, m in models.items()}, q))
        print(f"{LEAGUES[div]} : {len(rows)} matchs cumulés", file=sys.stderr)

    n = len(rows)
    y = np.array([r[0] for r in rows])
    ll = lambda P: -np.log(P[np.arange(n), y])
    P = {a: np.array([r[1][a] for r in rows]) for a in ALPHAS}
    base = ll(P[1.0])
    print(f"{n} matchs testés (saison en cours, 6 championnats)\n")
    print(f"{'part de buts (reste = xG)':28s}{'log-loss':>9s}{'gain vs buts seuls (± err.std)':>34s}")
    for a in ALPHAS:
        d = base - ll(P[a])
        gain = "" if a == 1.0 else f"{d.mean():+.4f} ± {d.std(ddof=1) / np.sqrt(n):.4f}"
        print(f"{a:>4.0%} buts / {1 - a:>4.0%} xG{'':11s}{ll(P[a]).mean():9.4f}{gain:>34s}")
    qs = [(i, r[2]) for i, r in enumerate(rows) if r[2] is not None]
    if qs:
        Q = np.array([q for _, q in qs]); yy = y[[i for i, _ in qs]]
        print(f"{'Cotes bookmakers':28s}{-np.log(Q[np.arange(len(yy)), yy]).mean():9.4f}")
    if n < MIN_MATCHES:
        print(f"\nPas assez de matchs pour conclure ({n} < {MIN_MATCHES}) : refaire le test plus tard dans la saison.")
    else:
        best = max(ALPHAS[1:], key=lambda a: (base - ll(P[a])).mean())
        d = base - ll(P[best])
        z = d.mean() / (d.std(ddof=1) / np.sqrt(n))
        verdict = "amélioration significative" if z > 2 else "pas d'amélioration démontrée" if z > -2 else "dégradation"
        print(f"\nMeilleur mélange : {best:.0%} buts (z = {z:+.1f}) -> {verdict}.")


if __name__ == "__main__":
    main()
