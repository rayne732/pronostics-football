"""Catalogue de marchés façon bookmaker (1X2, double chance, BTTS, totaux, mi-temps, HT/FT, score exact,
handicap, corners...) calculés depuis le modèle, puis classés en pronostics "sûrs" / "moins sûrs".
Chaque sélection porte aussi une règle qui dit si le pronostic est gagné, à partir du résultat réel
(res = fh, fa, hh, ha, ch, ca : buts finaux, buts mi-temps, corners ; None si la donnée manque)."""
import numpy as np
from scipy.stats import poisson

from poisson import score_grid

SAFE_MIN = 0.70          # probabilité minimale pour être classé "sûr"
LESS_SAFE_MIN = 0.30     # en dessous, un marché n'est même pas proposé (hors "loterie")
N = 11


def _f(x):
    return f"{x:g}".replace(".", ",")


def _ht(fn):                                              # règle de mi-temps : inconnue si pas de donnée
    return lambda r: None if r["hh"] is None else fn(r)


def _cor(fn):                                             # règle de corners : inconnue si pas de donnée
    return lambda r: None if r["ch"] is None else fn(r)


def _res(d):
    return 0 if d > 0 else 1 if d == 0 else 2             # 0 = domicile, 1 = nul, 2 = extérieur


def families(models, home, away):
    """Liste de marchés : dict(name, kind, sels={sélection: proba}, rules={sélection: règle}, validated, lottery)."""
    grid, (lh, la) = score_grid(models["goals"], home, away)
    idx = np.arange(grid.shape[0])
    D = np.subtract.outer(idx, idx)                       # buts dom - buts ext
    T = np.add.outer(idx, idx)                            # total buts
    HI = np.broadcast_to(idx[:, None], grid.shape)        # buts du domicile
    AI = np.broadcast_to(idx[None, :], grid.shape)        # buts de l'extérieur
    P = lambda mask: float(grid[mask].sum())
    fams = []

    def add(name, items, validated=False, lottery=False, kind=None):
        fams.append(dict(name=name, kind=kind or name, sels={l: p for l, p, _ in items},
                         rules={l: f for l, _, f in items}, validated=validated, lottery=lottery))

    p1, pn, p2 = P(D > 0), P(D == 0), P(D < 0)
    add("Résultat du match", [(home, p1, lambda r: r["fh"] > r["fa"]), ("Match nul", pn, lambda r: r["fh"] == r["fa"]),
                              (away, p2, lambda r: r["fh"] < r["fa"])], validated=True)
    add("Double chance", [(f"{home} ou nul", p1 + pn, lambda r: r["fh"] >= r["fa"]),
                          (f"{away} ou nul", p2 + pn, lambda r: r["fh"] <= r["fa"]),
                          (f"{home} ou {away}", p1 + p2, lambda r: r["fh"] != r["fa"])], validated=True)
    b = P((HI > 0) & (AI > 0))
    add("Les deux équipes marquent", [("Oui", b, lambda r: r["fh"] > 0 and r["fa"] > 0),
                                      ("Non", 1 - b, lambda r: not (r["fh"] > 0 and r["fa"] > 0))])
    add("Total buts (plus)", [(f"Plus de {_f(x)} buts", P(T > x), lambda r, x=x: r["fh"] + r["fa"] > x)
                              for x in (0.5, 1.5, 2.5, 3.5, 4.5)])
    add("Total buts (moins)", [(f"Moins de {_f(x)} buts", P(T < x), lambda r, x=x: r["fh"] + r["fa"] < x)
                               for x in (1.5, 2.5, 3.5, 4.5, 5.5)])
    for team, lam, key in ((home, lh, "fh"), (away, la, "fa")):
        add(f"Buts de {team} (plus)", [(f"{team} plus de {_f(x)}", poisson.sf(x, lam), lambda r, x=x, key=key: r[key] > x)
                                       for x in (0.5, 1.5, 2.5)], kind="Buts d'une équipe (plus)")
        add(f"Buts de {team} (moins)", [(f"{team} moins de {_f(x)}", poisson.cdf(x - 0.5, lam), lambda r, x=x, key=key: r[key] < x)
                                        for x in (1.5, 2.5)], kind="Buts d'une équipe (moins)")
    add("Pair / impair", [("Total pair", P(T % 2 == 0), lambda r: (r["fh"] + r["fa"]) % 2 == 0),
                          ("Total impair", P(T % 2 == 1), lambda r: (r["fh"] + r["fa"]) % 2 == 1)])
    add("Tranche de buts", [("0-1 but", P(T <= 1), lambda r: r["fh"] + r["fa"] <= 1),
                            ("2-3 buts", P((T >= 2) & (T <= 3)), lambda r: 2 <= r["fh"] + r["fa"] <= 3),
                            ("4 buts ou plus", P(T >= 4), lambda r: r["fh"] + r["fa"] >= 4)])
    add("Handicap -1", [(f"{home} gagne par 2+", P(D >= 2), lambda r: r["fh"] - r["fa"] >= 2),
                        ("Écart d'un but pour le dom.", P(D == 1), lambda r: r["fh"] - r["fa"] == 1),
                        (f"{away} (+1)", P(D <= 0), lambda r: r["fh"] - r["fa"] <= 0)])
    add("Victoire sans encaisser", [(f"{home}", P((D > 0) & (AI == 0)), lambda r: r["fh"] > r["fa"] and r["fa"] == 0),
                                    (f"{away}", P((D < 0) & (HI == 0)), lambda r: r["fa"] > r["fh"] and r["fh"] == 0)])

    # mi-temps : buts de la 1re période ~ Poisson(part * lambda), 2e période indépendante
    s = models["ht"]
    g = np.arange(N)
    ht = np.outer(poisson.pmf(g, s * lh), poisson.pmf(g, s * la))
    sh = np.outer(poisson.pmf(g, (1 - s) * lh), poisson.pmf(g, (1 - s) * la))
    Dh = np.subtract.outer(g, g)
    names = (home, "Nul", away)
    ht_res = [float(ht[Dh > 0].sum()), float(ht[Dh == 0].sum()), float(ht[Dh < 0].sum())]
    add("Résultat à la mi-temps", [(names[i], ht_res[i], _ht(lambda r, i=i: _res(r["hh"] - r["ha"]) == i)) for i in range(3)])

    def diff_dist(grid2):                                   # loi de (buts dom - buts ext) : {écart: proba}
        return {d: float(np.trace(grid2, offset=-d)) for d in range(-(N - 1), N)}
    d1, d2 = diff_dist(ht), diff_dist(sh)
    htft = np.zeros((3, 3))                                 # [résultat mi-temps][résultat final]
    for x, px in d1.items():
        for y, py in d2.items():
            htft[_res(x), _res(x + y)] += px * py
    add("Mi-temps / Fin de match",
        [(f"{names[a]} / {names[c]}", float(htft[a, c]),
          _ht(lambda r, a=a, c=c: _res(r["hh"] - r["ha"]) == a and _res(r["fh"] - r["fa"]) == c))
         for a in range(3) for c in range(3)], lottery=True)
    top = sorted(((grid[i, j], i, j) for i in range(N) for j in range(N)), reverse=True)[:3]
    add("Score exact", [(f"{i}-{j}", float(p), lambda r, i=i, j=j: r["fh"] == i and r["fa"] == j) for p, i, j in top], lottery=True)
    l = lh + la
    add("Premier but", [(home, lh / l * (1 - np.exp(-l)), lambda r: None),          # ordre des buts non disponible
                        (away, la / l * (1 - np.exp(-l)), lambda r: None),
                        ("Aucun but", float(np.exp(-l)), lambda r: r["fh"] + r["fa"] == 0)], lottery=True)

    ch = ca = 0.0
    if models.get("corners"):                                # pas de corners pour tous les championnats
        _, (ch, ca) = score_grid(models["corners"], home, away)
        add("Corners (plus)", [(f"Plus de {_f(x)} corners", poisson.sf(x, ch + ca), _cor(lambda r, x=x: r["ch"] + r["ca"] > x))
                               for x in (7.5, 8.5, 9.5, 10.5, 11.5)])
        add("Corners (moins)", [(f"Moins de {_f(x)} corners", poisson.cdf(x, ch + ca), _cor(lambda r, x=x: r["ch"] + r["ca"] < x))
                                for x in (8.5, 9.5, 10.5, 11.5, 12.5)])
    return fams, (lh, la, ch + ca)


def classify(fams):
    """-> (sûrs, moins_sûrs). Chaque élément : (marché, sélection, proba, validé)."""
    safe, less = [], []
    for f in fams:
        items = sorted(f["sels"].items(), key=lambda kv: -kv[1])
        if f["lottery"]:
            less.append((f["name"], items[0][0], items[0][1], f["validated"]))
            continue
        ok = [kv for kv in items if kv[1] >= SAFE_MIN]
        if ok:                                            # la sélection la plus "payante" encore sûre
            sel, p = min(ok, key=lambda kv: kv[1])
            safe.append((f["name"], sel, p, f["validated"]))
        elif items[0][1] >= LESS_SAFE_MIN:
            less.append((f["name"], items[0][0], items[0][1], f["validated"]))
    safe.sort(key=lambda t: -t[2]); less.sort(key=lambda t: -t[2])
    return safe, less


def format_match(models, home, away, market=None):
    fams, (lh, la, corners) = families(models, home, away)
    safe, less = classify(fams)
    line = lambda t: f"  {t[0]} : {t[1]} - {t[2]:.0%} (cote juste {1 / t[2]:.2f})" + ("" if t[3] else " ⚠")
    out = [f"{home} - {away}", f"  Buts attendus {lh:.2f} - {la:.2f}" + (f" | corners ~{corners:.1f}" if corners else "")]
    if market is not None:
        out.append(f"  Bookmaker (1X2, sans marge) : dom {market[0]:.0%} / nul {market[1]:.0%} / ext {market[2]:.0%}")
    out.append(f"\n  SÛRS (probabilité ≥ {SAFE_MIN:.0%})")
    out += [line(t) for t in safe] or ["  Aucun pronostic n'atteint ce seuil."]
    out.append("\n  MOINS SÛRS")
    out += [line(t) for t in less]
    unknown = [t for t in (home, away) if t not in models["goals"]["idx"]]
    if unknown:
        out.append(f"\n  /!\\ Pas d'historique pour {', '.join(unknown)} : force moyenne supposée, estimation peu fiable.")
    return "\n".join(out)
