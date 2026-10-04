"""Catalogue de marchés façon bookmaker (1X2, double chance, BTTS, totaux, mi-temps, HT/FT, score exact,
handicap, corners...) calculés depuis le modèle, puis classés en pronostics "sûrs" / "moins sûrs".
Chaque sélection porte aussi une règle qui dit si le pronostic est gagné, à partir du résultat réel
(res = fh, fa, hh, ha, ch, ca : buts finaux, buts mi-temps, corners ; None si la donnée manque)."""
import numpy as np
from scipy.stats import poisson

from poisson import grid_from_lams, score_grid

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


def families(models, home, away, ov=None):
    """Liste de marchés : dict(name, kind, sels={sélection: proba}, rules={sélection: règle}, validated, lottery)."""
    grid, (lh, la) = score_grid(models["goals"], home, away)
    if ov:                                                # buts attendus mélangés avec le marché (blend.py)
        lh, la = ov
        grid = grid_from_lams(lh, la)
    idx = np.arange(grid.shape[0])
    D = np.subtract.outer(idx, idx)                       # buts dom - buts ext
    T = np.add.outer(idx, idx)                            # total buts
    HI = np.broadcast_to(idx[:, None], grid.shape)        # buts du domicile
    AI = np.broadcast_to(idx[None, :], grid.shape)        # buts de l'extérieur
    P = lambda mask: float(grid[mask].sum())
    fams = []

    def add(name, items, validated=False, lottery=False, kind=None, extra=False):
        # extra : marché redondant (handicaps, écarts, combinaisons) affiché dans la fiche match mais hors du décompte des pronostics sûrs / suivis
        fams.append(dict(name=name, kind=kind or name, sels={l: p for l, p, _ in items},
                         rules={l: f for l, _, f in items}, validated=validated, lottery=lottery, extra=extra))

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
                                       for x in (0.5, 1.5, 2.5, 3.5)], kind="Buts d'une équipe (plus)")
        add(f"Buts de {team} (moins)", [(f"{team} moins de {_f(x)}", poisson.cdf(x - 0.5, lam), lambda r, x=x, key=key: r[key] < x)
                                        for x in (1.5, 2.5, 3.5)], kind="Buts d'une équipe (moins)")
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

    # --- marchés supplémentaires façon bookmaker : écart de buts, handicaps, remboursé si nul, multichance, combinaisons (MyMatch)
    for team, sgn in ((home, 1), (away, -1)):
        for k in (2, 3):
            pk = P(sgn * D >= k)
            add(f"{team} gagne par au moins {k} buts",
                [("Oui", pk, lambda r, k=k, sgn=sgn: sgn * (r["fh"] - r["fa"]) >= k), ("Non", 1 - pk, lambda r, k=k, sgn=sgn: sgn * (r["fh"] - r["fa"]) < k)],
                kind="Écart de buts (oui/non)", extra=True)
    sg = lambda x: ("+" if x >= 0 else "-") + _f(abs(x))
    for hc in (-2.5, -1.5, -0.5, 0.5, 1.5, 2.5):
        ph = P(D + hc > 0)
        add(f"Handicap {sg(hc)}", [(f"{home} ({sg(hc)})", ph, lambda r, hc=hc: r["fh"] - r["fa"] + hc > 0),
                                  (f"{away} ({sg(-hc)})", 1 - ph, lambda r, hc=hc: r["fh"] - r["fa"] + hc < 0)], kind="Handicap (demi-buts)", extra=True)
    if p1 + p2 > 0:
        add("Vainqueur (remboursé si match nul)",
            [(home, p1 / (p1 + p2), lambda r: None if r["fh"] == r["fa"] else r["fh"] > r["fa"]),
             (away, p2 / (p1 + p2), lambda r: None if r["fh"] == r["fa"] else r["fh"] < r["fa"])])
    groups = [(f"{home} : 1-0, 2-0 ou 3-0", [(1, 0), (2, 0), (3, 0)]), (f"{home} : 2-1, 3-1 ou 3-2", [(2, 1), (3, 1), (3, 2)]),
              (f"{away} : 0-1, 0-2 ou 0-3", [(0, 1), (0, 2), (0, 3)]), (f"{away} : 1-2, 1-3 ou 2-3", [(1, 2), (1, 3), (2, 3)]),
              ("Nul : 0-0, 1-1 ou 2-2", [(0, 0), (1, 1), (2, 2)])]
    add("Score exact multichance", [(lab, float(sum(grid[i, j] for i, j in cs)), lambda r, cs=cs: (r["fh"], r["fa"]) in cs) for lab, cs in groups], lottery=True)
    resopts = [(f"{home} gagne", D > 0, lambda r: r["fh"] > r["fa"]), (f"{away} gagne", D < 0, lambda r: r["fh"] < r["fa"]),
               (f"{home} ou nul", D >= 0, lambda r: r["fh"] >= r["fa"]), (f"{away} ou nul", D <= 0, lambda r: r["fh"] <= r["fa"]),
               (f"{home} ou {away}", D != 0, lambda r: r["fh"] != r["fa"])]
    goalopts = [("plus de 0,5 buts", T > 0.5, lambda r: r["fh"] + r["fa"] > 0.5), ("plus de 1,5 buts", T > 1.5, lambda r: r["fh"] + r["fa"] > 1.5),
                ("plus de 2,5 buts", T > 2.5, lambda r: r["fh"] + r["fa"] > 2.5), ("moins de 2,5 buts", T < 2.5, lambda r: r["fh"] + r["fa"] < 2.5),
                ("moins de 3,5 buts", T < 3.5, lambda r: r["fh"] + r["fa"] < 3.5), ("les deux équipes marquent", (HI > 0) & (AI > 0), lambda r: r["fh"] > 0 and r["fa"] > 0),
                ("les deux équipes ne marquent pas toutes deux", ~((HI > 0) & (AI > 0)), lambda r: not (r["fh"] > 0 and r["fa"] > 0))]
    add("Combiné résultat + buts (MyMatch)",
        [(f"{rl} + {gl}", P(rm & gm), (lambda r, rf=rf, gf=gf: rf(r) and gf(r))) for rl, rm, rf in resopts for gl, gm, gf in goalopts], kind="Combiné MyMatch", extra=True)

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

    add("Dernier but", [(home, lh / l * (1 - np.exp(-l)), lambda r: None),
                        (away, la / l * (1 - np.exp(-l)), lambda r: None),
                        ("Aucun but", float(np.exp(-l)), lambda r: r["fh"] + r["fa"] == 0)], lottery=True)


    # --- marchés buts / mi-temps supplémentaires (tous « extra » : affichés dans la fiche match, hors décompte des pronostics sûrs)
    S = lambda k: "s" if k > 1 else ""

    def ex(name, items, kind=None):
        add(name, items, kind=kind, extra=True)
    TT = lambda r: r["fh"] + r["fa"]
    ex("Nombre exact de buts", [(f"{k} but{S(k)}", P(T == k), lambda r, k=k: TT(r) == k) for k in range(9)] + [("9 buts ou plus", P(T >= 9), lambda r: TT(r) >= 9)])
    ex("Nombre de buts (intervalle)", [("0-1 but", P(T <= 1), lambda r: TT(r) <= 1), ("2-3 buts", P((T >= 2) & (T <= 3)), lambda r: 2 <= TT(r) <= 3),
                                       ("4-6 buts", P((T >= 4) & (T <= 6)), lambda r: 4 <= TT(r) <= 6), ("7 buts ou plus", P(T >= 7), lambda r: TT(r) >= 7)])
    for team, M_, key in ((home, HI, "fh"), (away, AI, "fa")):
        ex(f"Nombre exact de buts de {team}", [(f"{k} but{S(k)}", P(M_ == k), lambda r, k=k, key=key: r[key] == k) for k in range(3)] + [("3 buts ou plus", P(M_ >= 3), lambda r, key=key: r[key] >= 3)],
           kind="Nombre exact de buts d'une équipe")
        ex(f"Intervalle de buts de {team}", [("0 but", P(M_ == 0), lambda r, key=key: r[key] == 0), ("1-2 buts", P((M_ >= 1) & (M_ <= 2)), lambda r, key=key: 1 <= r[key] <= 2),
                                             ("1-3 buts", P((M_ >= 1) & (M_ <= 3)), lambda r, key=key: 1 <= r[key] <= 3), ("2-3 buts", P((M_ >= 2) & (M_ <= 3)), lambda r, key=key: 2 <= r[key] <= 3),
                                             ("4 buts ou plus", P(M_ >= 4), lambda r, key=key: r[key] >= 4)], kind="Intervalle de buts d'une équipe")
    mv = []
    for team, sgn in ((home, 1), (away, -1)):
        mv += [(f"{team} gagne par exactement 1 but", P(sgn * D == 1), lambda r, sgn=sgn: sgn * (r["fh"] - r["fa"]) == 1),
               (f"{team} gagne par exactement 2 buts", P(sgn * D == 2), lambda r, sgn=sgn: sgn * (r["fh"] - r["fa"]) == 2),
               (f"{team} gagne par au moins 3 buts", P(sgn * D >= 3), lambda r, sgn=sgn: sgn * (r["fh"] - r["fa"]) >= 3)]
    mv.append(("Match nul", pn, lambda r: r["fh"] == r["fa"]))
    ex("Marge de victoire", mv)
    rs3 = [(home, D > 0, lambda r: r["fh"] > r["fa"]), ("Match nul", D == 0, lambda r: r["fh"] == r["fa"]), (away, D < 0, lambda r: r["fh"] < r["fa"])]
    gl6 = [("plus de 1,5", T > 1.5, lambda r: TT(r) > 1.5), ("moins de 1,5", T < 1.5, lambda r: TT(r) < 1.5), ("plus de 2,5", T > 2.5, lambda r: TT(r) > 2.5),
           ("moins de 2,5", T < 2.5, lambda r: TT(r) < 2.5), ("plus de 3,5", T > 3.5, lambda r: TT(r) > 3.5), ("moins de 3,5", T < 3.5, lambda r: TT(r) < 3.5)]
    ex("Résultat et nombre de buts", [(f"{rn} et {gn}", P(rm & gm), lambda r, rf=rf, gf=gf: rf(r) and gf(r)) for rn, rm, rf in rs3 for gn, gm, gf in gl6])
    btm = (HI > 0) & (AI > 0)
    ex("Résultat et les deux équipes marquent", [(f"{rn} et {bn}", P(rm & bm), lambda r, rf=rf, bf=bf: rf(r) and bf(r)) for rn, rm, rf in rs3
                                                   for bn, bm, bf in (("oui", btm, lambda r: r["fh"] > 0 and r["fa"] > 0), ("non", ~btm, lambda r: not (r["fh"] > 0 and r["fa"] > 0)))])
    rh = np.divide(HI, T, out=np.zeros(grid.shape), where=T > 0)             # P(1er but du domicile | score final) : les buts d'un même score sont échangeables
    ra = np.divide(AI, T, out=np.zeros(grid.shape), where=T > 0)

    def first_rule(is_home, res_ok):                                         # connu seulement si une seule équipe a marqué (ou si le résultat est déjà perdu)
        def f(r):
            if not res_ok(r) or r["fh"] + r["fa"] == 0:
                return False
            if r["fa"] == 0:
                return is_home
            if r["fh"] == 0:
                return not is_home
            return None
        return f
    fr = []
    for fname, ratio, is_home in ((home, rh, True), (away, ra, False)):
        for rn, rm, rf in rs3:
            lab = f"{fname} marque en premier et " + ("match nul" if rn == "Match nul" else f"{rn} gagne")
            fr.append((lab, float((grid * ratio)[rm].sum()), first_rule(is_home, rf)))
    ex("Équipe qui marque le 1er but et résultat", fr)
    ex("Quelle équipe va marquer ?", [("Aucune équipe", P(T == 0), lambda r: TT(r) == 0), (f"Seulement {home}", P((HI > 0) & (AI == 0)), lambda r: r["fh"] > 0 and r["fa"] == 0),
                                      (f"Seulement {away}", P((AI > 0) & (HI == 0)), lambda r: r["fa"] > 0 and r["fh"] == 0), ("Les deux équipes", P(btm), lambda r: r["fh"] > 0 and r["fa"] > 0)])
    for team, own, opp, key, okey in ((home, HI, AI, "fh", "fa"), (away, AI, HI, "fa", "fh")):
        cs = P(opp == 0)
        ex(f"{team} garde sa cage inviolée", [("Oui", cs, lambda r, okey=okey: r[okey] == 0), ("Non", 1 - cs, lambda r, okey=okey: r[okey] > 0)], kind="Cage inviolée (oui/non)")
        wn = P((own > opp) & (opp == 0))
        ex(f"{team} gagne sans concéder de but", [("Oui", wn, lambda r, key=key, okey=okey: r[key] > r[okey] and r[okey] == 0),
                                                  ("Non", 1 - wn, lambda r, key=key, okey=okey: not (r[key] > r[okey] and r[okey] == 0))], kind="Gagne sans concéder (oui/non)")

    # mi-temps (1re période indépendante de la 2e)
    sh_w = lambda r, sgn: sgn * ((r["fh"] - r["hh"]) - (r["fa"] - r["ha"])) > 0              # a gagné la 2e mi-temps
    h_w = lambda r, sgn: sgn * (r["hh"] - r["ha"]) > 0                                         # a gagné la 1re
    for team, sgn, lam_t, key, hkey in ((home, 1, lh, "fh", "hh"), (away, -1, la, "fa", "ha")):
        w1 = float(ht[Dh * sgn > 0].sum())
        w2 = float(sh[Dh * sgn > 0].sum())
        ex(f"{team} gagne une des mi-temps", [("Oui", 1 - (1 - w1) * (1 - w2), _ht(lambda r, sgn=sgn: h_w(r, sgn) or sh_w(r, sgn))),
                                              ("Non", (1 - w1) * (1 - w2), _ht(lambda r, sgn=sgn: not (h_w(r, sgn) or sh_w(r, sgn))))], kind="Gagne une mi-temps (oui/non)")
        ex(f"{team} gagne les deux mi-temps", [("Oui", w1 * w2, _ht(lambda r, sgn=sgn: h_w(r, sgn) and sh_w(r, sgn))),
                                               ("Non", 1 - w1 * w2, _ht(lambda r, sgn=sgn: not (h_w(r, sgn) and sh_w(r, sgn))))], kind="Gagne les deux mi-temps (oui/non)")
        sc2 = (1 - np.exp(-s * lam_t)) * (1 - np.exp(-(1 - s) * lam_t))
        ex(f"{team} marque dans les deux mi-temps", [("Oui", float(sc2), _ht(lambda r, key=key, hkey=hkey: r[hkey] > 0 and r[key] - r[hkey] > 0)),
                                                     ("Non", float(1 - sc2), _ht(lambda r, key=key, hkey=hkey: not (r[hkey] > 0 and r[key] - r[hkey] > 0)))], kind="Marque dans les deux mi-temps (oui/non)")
    m2 = np.outer(poisson.pmf(g, s * l), poisson.pmf(g, (1 - s) * l))
    ex("Mi-temps avec le plus de buts", [("1re mi-temps", float(m2[Dh > 0].sum()), _ht(lambda r: r["hh"] + r["ha"] > (r["fh"] + r["fa"]) - (r["hh"] + r["ha"]))),
                                         ("Égalité", float(np.trace(m2)), _ht(lambda r: r["hh"] + r["ha"] == (r["fh"] + r["fa"]) - (r["hh"] + r["ha"]))),
                                         ("2de mi-temps", float(m2[Dh < 0].sum()), _ht(lambda r: r["hh"] + r["ha"] < (r["fh"] + r["fa"]) - (r["hh"] + r["ha"])))])
    Th = np.add.outer(g, g)
    HIh = np.broadcast_to(g[:, None], ht.shape)
    AIh = np.broadcast_to(g[None, :], ht.shape)
    PH = lambda mask: float(ht[mask].sum())
    TH = lambda r: r["hh"] + r["ha"]
    ex("Mi-temps - Double chance", [(f"{home} ou nul", PH(Dh >= 0), _ht(lambda r: r["hh"] >= r["ha"])), (f"{away} ou nul", PH(Dh <= 0), _ht(lambda r: r["hh"] <= r["ha"])),
                                    (f"{home} ou {away}", PH(Dh != 0), _ht(lambda r: r["hh"] != r["ha"]))])
    bh = (HIh > 0) & (AIh > 0)
    ex("Mi-temps - Les 2 équipes marquent", [("Oui", PH(bh), _ht(lambda r: r["hh"] > 0 and r["ha"] > 0)), ("Non", 1 - PH(bh), _ht(lambda r: not (r["hh"] > 0 and r["ha"] > 0)))])
    ex("Mi-temps - Nombre de buts", [(f"Plus de {_f(x)} buts", PH(Th > x), _ht(lambda r, x=x: TH(r) > x)) for x in (0.5, 1.5, 2.5)] +
       [(f"Moins de {_f(x)} buts", PH(Th < x), _ht(lambda r, x=x: TH(r) < x)) for x in (0.5, 1.5, 2.5)])
    for team, M_, hkey in ((home, HIh, "hh"), (away, AIh, "ha")):
        ex(f"Mi-temps - Nombre de buts de {team}", [(f"{team} plus de {_f(x)}", PH(M_ > x), _ht(lambda r, x=x, hkey=hkey: r[hkey] > x)) for x in (0.5, 1.5)] +
           [(f"{team} moins de {_f(x)}", PH(M_ < x), _ht(lambda r, x=x, hkey=hkey: r[hkey] < x)) for x in (0.5, 1.5)], kind="Mi-temps - Buts d'une équipe")
    ex("Mi-temps - Nombre exact de buts", [(f"{k} but{S(k)}", PH(Th == k), _ht(lambda r, k=k: TH(r) == k)) for k in range(3)] + [("3 buts ou plus", PH(Th >= 3), _ht(lambda r: TH(r) >= 3))])
    ex("Mi-temps - Nombre de buts (intervalle)", [("0 but", PH(Th == 0), _ht(lambda r: TH(r) == 0)), ("1-2 buts", PH((Th >= 1) & (Th <= 2)), _ht(lambda r: 1 <= TH(r) <= 2)),
                                                  ("1-3 buts", PH((Th >= 1) & (Th <= 3)), _ht(lambda r: 1 <= TH(r) <= 3)), ("2-3 buts", PH((Th >= 2) & (Th <= 3)), _ht(lambda r: 2 <= TH(r) <= 3)),
                                                  ("4 buts ou plus", PH(Th >= 4), _ht(lambda r: TH(r) >= 4))])
    cells = [(1, 0), (0, 0), (0, 1), (2, 0), (1, 1), (0, 2), (2, 1), (2, 2), (1, 2)]
    ex("Mi-temps - Score exact", [(f"{i}-{j}", float(ht[i, j]), _ht(lambda r, i=i, j=j: r["hh"] == i and r["ha"] == j)) for i, j in cells] +
       [("Autre", 1 - sum(float(ht[i, j]) for i, j in cells), _ht(lambda r: (r["hh"], r["ha"]) not in cells))])
    hw, ha_ = PH(Dh > 0), PH(Dh < 0)
    if hw + ha_ > 0:
        ex("Mi-temps - Vainqueur (remboursé si match nul)", [(home, hw / (hw + ha_), _ht(lambda r: None if r["hh"] == r["ha"] else r["hh"] > r["ha"])),
                                                               (away, ha_ / (hw + ha_), _ht(lambda r: None if r["hh"] == r["ha"] else r["hh"] < r["ha"]))])
    for team, M_, hkey, okey in ((home, AIh, "hh", "ha"), (away, HIh, "ha", "hh")):
        c0 = PH(M_ == 0)
        ex(f"Mi-temps - {team} garde sa cage inviolée ?", [("Oui", c0, _ht(lambda r, okey=okey: r[okey] == 0)), ("Non", 1 - c0, _ht(lambda r, okey=okey: r[okey] > 0))], kind="Mi-temps - Cage inviolée")
    hr3 = [(home, Dh > 0, lambda r: r["hh"] > r["ha"]), ("Match nul", Dh == 0, lambda r: r["hh"] == r["ha"]), (away, Dh < 0, lambda r: r["hh"] < r["ha"])]
    hg4 = [("moins de 0,5", Th < 0.5, lambda r: TH(r) < 0.5), ("plus de 0,5", Th > 0.5, lambda r: TH(r) > 0.5), ("moins de 1,5", Th < 1.5, lambda r: TH(r) < 1.5), ("plus de 1,5", Th > 1.5, lambda r: TH(r) > 1.5)]
    ex("Mi-temps - Résultat et nombre de buts", [(f"{rn} et {gn}", PH(rm & gm), _ht(lambda r, rf=rf, gf=gf: rf(r) and gf(r))) for rn, rm, rf in hr3 for gn, gm, gf in hg4])
    hdc = [(f"{home} ou nul", Dh >= 0, lambda r: r["hh"] >= r["ha"]), (f"{away} ou nul", Dh <= 0, lambda r: r["hh"] <= r["ha"]), (f"{home} ou {away}", Dh != 0, lambda r: r["hh"] != r["ha"])]
    ex("Mi-temps - Double chance et les deux équipes marquent",
       [(f"{dn} et {bn}", PH(dm & bm), _ht(lambda r, df=df, bf=bf: df(r) and bf(r))) for dn, dm, df in hdc
        for bn, bm, bf in (("oui", bh, lambda r: r["hh"] > 0 and r["ha"] > 0), ("non", ~bh, lambda r: not (r["hh"] > 0 and r["ha"] > 0)))])

    # minute du 1er but : buts répartis uniformément dans chaque mi-temps (part s en 1re période) ; non vérifiables après coup (minutes de buts absentes des données)
    def lam_cum(t):
        return s * l * min(t, 45) / 45 + (1 - s) * l * max(t - 45, 0) / 45

    def minute_rule(r):
        return False if r["fh"] + r["fa"] == 0 else None
    for name, bounds in (("Minute du 1er but (10 min)", [(a, a + 10) for a in range(0, 90, 10)]), ("Minute du 1er but (15 min)", [(a, a + 15) for a in range(0, 90, 15)])):
        ex(name, [(f"{a + 1}-{b}", float(np.exp(-lam_cum(a)) - np.exp(-lam_cum(b))), minute_rule) for a, b in bounds] + [("Aucun but", float(np.exp(-l)), lambda r: r["fh"] + r["fa"] == 0)])


    # --- tirs et tirs cadrés (championnats qui ont ces statistiques) : loi binomiale négative (sur-dispersion, alpha = 0,04 réglé sur 25 000 lignes), équipes indépendantes
    from math import floor
    from scipy.stats import nbinom
    KS = np.arange(80)
    rr_ = 1 / 0.04
    for mkey, kh, ka, fam, unit, resname in (("shots", "sh", "sa", "Nombre de tirs", "tirs", "Tirs - Résultat"), ("sot", "th", "ta", "Nombre de tirs cadrés", "tirs cadrés", "Tirs cadrés - Résultat")):
        if not models.get(mkey):
            continue
        _, (mh, ma) = score_grid(models[mkey], home, away)
        ph_, pa_ = nbinom.pmf(KS, rr_, rr_ / (rr_ + mh)), nbinom.pmf(KS, rr_, rr_ / (rr_ + ma))
        ptot = np.convolve(ph_, pa_)[:80]
        rs = lambda fn, kh=kh: (lambda r: None if r[kh] is None else fn(r))
        c0 = floor(mh + ma) + 0.5
        ln = [c0 + d for d in (-3, -2, -1, 0, 1, 2, 3)]
        ex(fam, [(f"Plus de {_f(x)} {unit}", float(ptot[KS > x].sum()), rs(lambda r, x=x, kh=kh, ka=ka: r[kh] + r[ka] > x)) for x in ln] +
           [(f"Moins de {_f(x)} {unit}", float(ptot[KS < x].sum()), rs(lambda r, x=x, kh=kh, ka=ka: r[kh] + r[ka] < x)) for x in ln])
        for team, mu, pm, key in ((home, mh, ph_, kh), (away, ma, pa_, ka)):
            c1 = floor(mu) + 0.5
            lt = [c1 + d for d in (-2, -1, 0, 1, 2)]
            ex(f"{fam} de {team}", [(f"{team} plus de {_f(x)}", float(pm[KS > x].sum()), rs(lambda r, x=x, key=key: r[key] > x)) for x in lt] +
               [(f"{team} moins de {_f(x)}", float(pm[KS < x].sum()), rs(lambda r, x=x, key=key: r[key] < x)) for x in lt], kind=f"{fam} d'une équipe")
        pg = float(sum(ph_[i] * pa_[:i].sum() for i in range(80)))
        pe = float((ph_ * pa_).sum())
        ex(resname, [(home, pg, rs(lambda r, kh=kh, ka=ka: r[kh] > r[ka])), ("Égalité", pe, rs(lambda r, kh=kh, ka=ka: r[kh] == r[ka])),
                     (away, max(0.0, 1 - pg - pe), rs(lambda r, kh=kh, ka=ka: r[kh] < r[ka]))])

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
        if f.get("extra"):
            continue
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
