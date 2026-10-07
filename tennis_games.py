"""Jeux au tennis : écart de jeux (handicap) et nombre total de jeux, à partir de la probabilité de gagner le match.
Modèle de Markov : chaque joueur a une probabilité de gagner un point sur son service ; jeu -> set (tie-break à 6-6) -> match.
La force relative est réglée pour retrouver exactement la probabilité de victoire donnée ; le niveau moyen de service (`base`) est calé par circuit."""
import math

BASE = {"ATP": 0.64, "WTA": 0.565}            # probabilité moyenne de gagner un point sur son service (calée sur les matchs passés, voir README)


def _game(p):
    """Probabilité de gagner un jeu en gagnant chaque point avec la probabilité p."""
    q = 1 - p
    s = p ** 4 * (1 + 4 * q + 10 * q * q)
    deuce = 20 * p ** 3 * q ** 3 * p * p / (p * p + q * q)
    return s + deuce


def _tiebreak(pa, pb):
    """A gagne le tie-break : A sert en premier ; points au service de A (pa) et de B (1 - pb pour A)."""
    # approximation : probabilité de point moyenne, tie-break en 7 points avec 2 d'écart
    x = (pa + (1 - pb)) / 2
    y = 1 - x
    win = sum(math.comb(6 + k, k) * x ** 7 * y ** k for k in range(6))
    tie = math.comb(12, 6) * (x * y) ** 6
    d = x * x / (x * x + y * y)
    return win + tie * d


def _set_dist(sa, sb, a_first):
    """{(jeux A, jeux B): prob} d'un set ; sa / sb = probabilités de gagner un point au service de A / de B."""
    hold_a, hold_b = _game(sa), _game(sb)
    pa_win_game = lambda a_serves: hold_a if a_serves else 1 - hold_b       # probabilité que A gagne ce jeu
    tb = _tiebreak(sa, sb) if a_first else 1 - _tiebreak(sb, sa)
    cur = {(0, 0): 1.0}
    out = {}
    for n in range(12):                                                      # jeux 0..11 (6-6 atteint au 12e)
        a_serves = (n % 2 == 0) == a_first
        pw = pa_win_game(a_serves)
        nxt = {}
        for (i, j), v in cur.items():
            for (ni, nj, pr) in ((i + 1, j, pw), (i, j + 1, 1 - pw)):
                w = v * pr
                if (ni == 6 and nj <= 4) or (nj == 6 and ni <= 4) or (ni == 7 and nj == 5) or (nj == 7 and ni == 5):
                    out[(ni, nj)] = out.get((ni, nj), 0) + w
                else:
                    nxt[(ni, nj)] = nxt.get((ni, nj), 0) + w
        cur = nxt
    v66 = cur.get((6, 6), 0)
    out[(7, 6)] = out.get((7, 6), 0) + v66 * tb
    out[(6, 7)] = out.get((6, 7), 0) + v66 * (1 - tb)
    return out


def set_dist(sa, sb):
    """Premier serveur tiré au sort (50/50) à chaque set."""
    d1, d2 = _set_dist(sa, sb, True), _set_dist(sa, sb, False)
    return {k: 0.5 * d1.get(k, 0) + 0.5 * d2.get(k, 0) for k in set(d1) | set(d2)}


def match_dist(sa, sb, bo):
    """{(sets A, sets B, écart de jeux): prob}."""
    sd = set_dist(sa, sb)
    need = (bo + 1) // 2
    cur = {(0, 0, 0): 1.0}
    out = {}
    for _ in range(bo):
        nxt = {}
        for (x, y, df), v in cur.items():
            for (i, j), pr in sd.items():
                nx, ny = x + (i > j), y + (j > i)
                k = (nx, ny, df + i - j)
                if nx == need or ny == need:
                    out[k] = out.get(k, 0) + v * pr
                else:
                    nxt[k] = nxt.get(k, 0) + v * pr
        cur = nxt
    return out


TAU = {"ATP": 0.05, "WTA": 0.055}               # forme du jour : écart aléatoire de niveau de service, le même pendant tout le match (rend les matchs plus tranchés)


def _mix(d, base, bo, tau):
    out = {}
    for z, w in ((-tau, 0.25), (0.0, 0.5), (tau, 0.25)):
        for k, v in match_dist(base + d + z, base - d - z, bo).items():
            out[k] = out.get(k, 0) + w * v
    return out


def games_market(p, bo, tour):
    """Distribution jointe {(sets A, sets B, écart de jeux): prob} d'un match où A gagne avec la probabilité p."""
    p = min(max(p, 0.02), 0.98)
    base, tau = BASE.get(tour, 0.6), TAU.get(tour, 0.06)
    lo, hi = -0.25, 0.25
    for _ in range(22):
        d = (lo + hi) / 2
        pa = sum(v for (x, y, _), v in _mix(d, base, bo, tau).items() if x > y)
        lo, hi = (d, hi) if pa < p else (lo, d)
    return _mix((lo + hi) / 2, base, bo, tau)


_CACHE = {}


def diff_dist(p, bo, tour):
    """{écart de jeux (A - B): prob}, avec un cache sur la probabilité arrondie à 0,005."""
    k = (round(p * 200), bo, tour)
    if k not in _CACHE:
        out = {}
        for (_, _, df), v in games_market(k[0] / 200, bo, tour).items():
            out[df] = out.get(df, 0) + v
        _CACHE[k] = out
    return _CACHE[k]


LINES = (1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5)


def handicap_sels(a, b, p, bo, tour):
    """Sélections « Écart de jeux » : [(libellé, probabilité)] pour les deux joueurs, signes et lignes."""
    D = diff_dist(p, bo, tour)
    P = lambda f: sum(v for df, v in D.items() if f(df))
    out = []
    for h in LINES:
        t = f"{h:g}".replace(".", ",")
        out += [(f"{a} -{t} jeux", P(lambda d: d > h)), (f"{b} +{t} jeux", P(lambda d: d < h)),
                (f"{b} -{t} jeux", P(lambda d: d < -h)), (f"{a} +{t} jeux", P(lambda d: d > -h))]
    return out


# ---------------------------------------------------------------- jeux de chaque joueur, premier break, résultat après 6 jeux
def _full_dist(sa, sb, bo):
    """{(jeux A, jeux B): prob} sur tout le match (les scores de sets sont rassemblés)."""
    sd = set_dist(sa, sb)
    need = (bo + 1) // 2
    cur = {(0, 0, 0, 0): 1.0}
    out = {}
    for _ in range(bo):
        nxt = {}
        for (x, y, ga, gb), v in cur.items():
            for (i, j), pr in sd.items():
                nx, ny = x + (i > j), y + (j > i)
                k = (nx, ny, ga + i, gb + j)
                if nx == need or ny == need:
                    out[(k[2], k[3])] = out.get((k[2], k[3]), 0) + v * pr
                else:
                    nxt[k] = nxt.get(k, 0) + v * pr
        cur = nxt
    return out


def _first_break(sa, sb):
    """(P(A fait le premier break), P(B ...)) : jeux au service en alternance, premier serveur tiré au sort ; on conditionne sur l'existence d'un break."""
    ba, bb = 1 - _game(sa), 1 - _game(sb)            # B break sur le service de A (ba) ; A break sur le service de B (bb)
    den = 1 - (1 - ba) * (1 - bb)
    a_first_serves_a = (1 - ba) * bb / den           # A sert d'abord
    a_first_serves_b = bb / den                      # B sert d'abord
    pa = 0.5 * a_first_serves_a + 0.5 * a_first_serves_b
    return pa, 1 - pa


def _after6(sa, sb):
    """(A devant, égalité, B devant) après 6 jeux du premier set."""
    hold_a, hold_b = _game(sa), _game(sb)
    res = [0.0, 0.0, 0.0]
    for a_first in (True, False):
        cur = {0: 1.0}                                # écart de jeux
        for n in range(6):
            a_serves = (n % 2 == 0) == a_first
            pw = hold_a if a_serves else 1 - hold_b
            nxt = {}
            for d, v in cur.items():
                nxt[d + 1] = nxt.get(d + 1, 0) + v * pw
                nxt[d - 1] = nxt.get(d - 1, 0) + v * (1 - pw)
            cur = nxt
        for d, v in cur.items():
            res[0 if d > 0 else 1 if d == 0 else 2] += 0.5 * v
    return tuple(res)


_EX = {}


def extras(p, bo, tour):
    """Tout ce qui vient du modèle de jeux pour une probabilité p : écart, jeux de chaque joueur, premier break, résultat après 6 jeux."""
    k = (round(p * 200), bo, tour)
    if k in _EX:
        return _EX[k]
    pp = min(max(k[0] / 200, 0.02), 0.98)
    base, tau = BASE.get(tour, 0.6), TAU.get(tour, 0.06)
    lo, hi = -0.25, 0.25
    for _ in range(22):
        d = (lo + hi) / 2
        pa = sum(v for (x, y, _), v in _mix(d, base, bo, tau).items() if x > y)
        lo, hi = (d, hi) if pa < pp else (lo, d)
    d = (lo + hi) / 2
    ga, gb, diff = {}, {}, {}
    fb, six = [0.0, 0.0], [0.0, 0.0, 0.0]
    for z, w in ((-tau, 0.25), (0.0, 0.5), (tau, 0.25)):
        sa, sb = base + d + z, base - d - z
        for (i, j), v in _full_dist(sa, sb, bo).items():
            ga[i] = ga.get(i, 0) + w * v
            gb[j] = gb.get(j, 0) + w * v
            diff[i - j] = diff.get(i - j, 0) + w * v
        f = _first_break(sa, sb)
        fb = [fb[0] + w * f[0], fb[1] + w * f[1]]
        a6 = _after6(sa, sb)
        six = [six[m] + w * a6[m] for m in range(3)]
    _EX[k] = dict(diff=diff, ga=ga, gb=gb, fb=tuple(fb), six=tuple(six))
    return _EX[k]


def extra_families(a, b, p, bo, tour):
    """Familles de marchés (nom, [(sélection, prob)]) issues du modèle de jeux."""
    E = extras(p, bo, tour)
    out = []
    out.append(("Écart de jeux", handicap_sels(a, b, p, bo, tour)))
    out.append(("Premier joueur à réaliser un break", [(a, E["fb"][0]), (b, E["fb"][1])]))
    out.append(("Résultat après 6 jeux", [(a, E["six"][0]), ("Match nul", E["six"][1]), (b, E["six"][2])]))
    for who, G in ((a, E["ga"]), (b, E["gb"])):
        mean = sum(g * v for g, v in G.items())
        c = math.floor(mean) + 0.5
        lines = [c + k for k in range(-4, 5) if c + k > 1]
        sels = []
        for ln in lines:
            t = f"{ln:g}".replace(".", ",")
            over = sum(v for g, v in G.items() if g > ln)
            sels += [(f"Plus de {t} jeux", over), (f"Moins de {t} jeux", 1 - over)]
        out.append((f"Nombre de jeux de {who}", sels))
    return out
