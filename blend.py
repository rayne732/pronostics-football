"""Mélange du modèle et du marché : les buts attendus de chaque équipe sont déduits des cotes (résultat 1X2 + plus/moins de 2,5 buts quand elles existent),
puis mélangés en proportion (W) avec ceux du modèle. Test sur 2 283 matchs de 2025/26 (6 championnats) : la perte logarithmique baisse de 0,012 (1X2),
0,009 (plus/moins 2,5), 0,004 (les deux marquent) et 0,007 (moins de 3,5 buts) avec un poids de 50 %, et davantage encore avec 75-100 %.
Les marchés dérivés (buts par équipe, handicap, score exact…) héritent du mélange puisqu'ils viennent des mêmes buts attendus."""
import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson as sp_poisson

from poisson import score_grid

W = 0.8                    # poids du marché dans le mélange (0 = modèle seul, 1 = marché seul)
MAXG = 10
_G = np.arange(MAXG + 1)


def _probs(lh, la):
    g = np.outer(sp_poisson.pmf(_G, lh), sp_poisson.pmf(_G, la))
    i, j = np.indices(g.shape)
    return np.array([np.tril(g, -1).sum(), np.trace(g), np.triu(g, 1).sum()]), float(g[i + j > 2.5].sum())


def market_view(r):
    """(probabilités 1X2 sans marge, probabilité de plus de 2,5 buts ou None) d'une ligne de calendrier, ou (None, None) sans cotes."""
    def pick(keys):
        for ks in keys:
            try:
                return [float(r[k]) for k in ks]
            except (KeyError, ValueError, TypeError):
                continue
        return None
    o = pick((("AvgH", "AvgD", "AvgA"), ("B365H", "B365D", "B365A")))
    if not o:
        return None, None
    q = (1 / np.array(o)) / (1 / np.array(o)).sum()
    ou = pick((("Avg>2.5", "Avg<2.5"), ("B365>2.5", "B365<2.5")))
    return q, (1 / ou[0]) / (1 / ou[0] + 1 / ou[1]) if ou else None


def lams(models_div, r, w=None):
    """Buts attendus (domicile, extérieur) mélangés modèle + marché pour la ligne r ; None s'il n'y a pas de cotes ou si une équipe est inconnue."""
    w = W if w is None else w
    q, ou = market_view(r)
    if q is None:
        return None
    gm = models_div["goals"]
    if r["HomeTeam"] not in gm["idx"] or r["AwayTeam"] not in gm["idx"]:
        return None
    _, (lh, la) = score_grid(gm, r["HomeTeam"], r["AwayTeam"])

    def f(x):
        p, ov = _probs(*np.exp(x))
        e = float(((p - q) ** 2).sum())
        return e + (ov - ou) ** 2 if ou is not None else e

    res = minimize(f, np.log([lh, la]), method="Nelder-Mead", options=dict(xatol=1e-3, fatol=1e-7, maxiter=200))
    lm = np.exp(res.x)
    out = np.exp((1 - w) * np.log([lh, la]) + w * np.log(lm))
    return float(out[0]), float(out[1])
