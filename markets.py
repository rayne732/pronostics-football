"""Tous les marchés (double chance, BTTS, premier but, mi-temps, score exact, totaux, corners...)
déduits du modèle Poisson : buts attendus (lh, la) -> matrice de scores -> probabilités."""
import numpy as np
from scipy.stats import poisson

from poisson import fit, score_grid

GOAL_LINES = (1.5, 2.5, 3.5, 4.5)
CORNER_LINES = (8.5, 9.5, 10.5, 11.5)


def ht_share(train):
    """Part des buts marqués en première mi-temps (~44 %), estimée sur les matchs passés."""
    rows = [r for r in train if r.get("HTHG") not in (None, "") and r.get("HTAG") not in (None, "")]
    ht = sum(int(r["HTHG"]) + int(r["HTAG"]) for r in rows)
    ft = sum(r["FTHG"] + r["FTAG"] for r in rows)
    return ht / ft if ft else 0.44


def fit_all(train, ref_date):
    """Modèle de buts + modèle de corners + part de la 1re mi-temps."""
    has_corners = any(r.get("HC") not in (None, "") for r in train)       # absents pour certains championnats (ex. Brésil)
    has_shots = any(r.get("HS") not in (None, "") for r in train)          # tirs et tirs cadrés : championnats football-data de format « saison » seulement
    has_sot = any(r.get("HST") not in (None, "") for r in train)
    has_cards = any(r.get("HY") not in (None, "") for r in train)           # cartons jaunes et rouges (football-data)
    reds = []
    for r in train:
        try:
            reds.append(float(r["HR"]) + float(r["AR"]))
        except (KeyError, ValueError, TypeError):
            pass
    return dict(goals=fit(train, ref_date), corners=fit(train, ref_date, target=("HC", "AC")) if has_corners else None, ht=ht_share(train),
                shots=fit(train, ref_date, target=("HS", "AS")) if has_shots else None, sot=fit(train, ref_date, target=("HST", "AST")) if has_sot else None,
                cards=fit(train, ref_date, target=("HY", "AY")) if has_cards else None, red=(sum(reds) / len(reds)) if len(reds) > 200 else None)


def _1x2(grid):
    return np.array([np.tril(grid, -1).sum(), np.trace(grid), np.triu(grid, 1).sum()])


def markets(models, home, away):
    grid, (lh, la) = score_grid(models["goals"], home, away)
    n = grid.shape[0]
    tot = np.add.outer(np.arange(n), np.arange(n))
    p = _1x2(grid)
    out = dict(lh=lh, la=la, p1x2=p)

    out["double"] = dict(zip(("1X", "X2", "12"), (p[0] + p[1], p[1] + p[2], p[0] + p[2])))
    out["btts"] = grid[1:, 1:].sum()                                       # les deux équipes marquent
    l = lh + la
    out["first"] = dict(home=lh / l * (1 - np.exp(-l)), away=la / l * (1 - np.exp(-l)), none=np.exp(-l))
    hg = np.outer(poisson.pmf(np.arange(n), models["ht"] * lh), poisson.pmf(np.arange(n), models["ht"] * la))
    out["half"] = _1x2(hg)                                                 # résultat à la mi-temps
    out["scores"] = sorted(((grid[i, j], i, j) for i in range(n) for j in range(n)), reverse=True)[:3]
    out["over"] = {x: grid[tot > x].sum() for x in GOAL_LINES}             # P(total buts > x)
    out["team_over"] = {"home": {x: poisson.sf(x, lh) for x in (0.5, 1.5, 2.5)},
                        "away": {x: poisson.sf(x, la) for x in (0.5, 1.5, 2.5)}}
    _, (ch, ca) = score_grid(models["corners"], home, away)
    out["corners"] = dict(exp=(ch, ca), over={x: poisson.sf(x, ch + ca) for x in CORNER_LINES})
    return out
