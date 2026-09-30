"""Modèle Poisson (attaque/défense + avantage domicile) avec facteurs de contexte optionnels, et backtest."""
import csv
import glob
import os
from datetime import datetime

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson

XI = 0.0019       # décroissance par jour (demi-vie ~ 1 an)
L2 = 0.5          # régularisation des forces d'équipe
L2_HOME = 5.0     # régularisation de l'avantage domicile propre à chaque équipe (fort : peu de données)
MAXG = 10
FORM_N = 5        # nombre de matchs pour la forme
DEAD_FROM = 0.7   # part de saison jouée à partir de laquelle un match peut être "sans enjeu"
DEAD_GAP = 6      # points d'écart aux 3 lignes (titre, Europe, maintien) au-delà desquels il n'y a plus d'enjeu


def _stakes(pts, games_played, n_teams):
    """Pour chaque équipe : 1 si plus rien à jouer (loin du titre, de l'Europe et du maintien)."""
    if games_played < DEAD_FROM * 2 * (n_teams - 1):
        return {t: 0 for t in pts}
    order = sorted(pts.values(), reverse=True)
    lines = [order[0], order[min(4, n_teams - 1)], order[n_teams - 4]]      # 1er, 5e, dernier maintenu
    return {t: int(min(abs(p - l) for l in lines) > DEAD_GAP) for t, p in pts.items()}


NEW_FORMAT = {"BRA": ("BRA.csv", 2021)}                   # championnats au format « new » : un seul fichier, toutes saisons (sans tirs ni corners)


def _read_new(div):
    name, first = NEW_FORMAT[div]
    rows = []
    try:
        fh = open(f"data/{name}", encoding="utf-8-sig", newline="")
    except FileNotFoundError:
        return rows
    with fh:
        for r in csv.DictReader(fh):
            if not r.get("HG") or int(r["Season"]) < first:
                continue
            rows.append({"Div": div, "Date": datetime.strptime(r["Date"], "%d/%m/%Y"), "Time": r.get("Time", ""),
                         "HomeTeam": r["Home"], "AwayTeam": r["Away"], "FTHG": int(r["HG"]), "FTAG": int(r["AG"]),
                         "FTR": r["Res"], "season": r["Season"], "shots": None, "xg": None})
    return rows


def load(div="F1"):
    """Liste de dicts triée par date pour un championnat (F1, E0, SP1...), avec features de contexte
    calculées AVANT chaque match."""
    rows = []
    for f in ([] if div in NEW_FORMAT else sorted(glob.glob(f"data/{div}_*.csv"))):
        season = os.path.basename(f).split("_")[1][:4]
        with open(f, encoding="utf-8-sig", newline="") as fh:
            for r in csv.DictReader(fh):
                if not r.get("FTHG"):
                    continue
                r["Date"] = datetime.strptime(r["Date"], "%d/%m/%Y")
                r["FTHG"], r["FTAG"], r["season"] = int(r["FTHG"]), int(r["FTAG"]), season
                try:                                  # tirs : totaux et cadrés (domicile, extérieur)
                    r["shots"] = tuple(float(r[k]) for k in ("HS", "HST", "AS", "AST"))
                except (KeyError, ValueError):
                    r["shots"] = None
                try:                                  # vrais xG (disponibles depuis la saison 2026/27)
                    r["xg"] = (float(r["HxG"]), float(r["AxG"]))
                except (KeyError, ValueError):
                    r["xg"] = None
                rows.append(r)
    if div in NEW_FORMAT:
        rows = _read_new(div)
    rows.sort(key=lambda r: r["Date"])

    state = {}                                    # saison -> {"pts", "played", "last"}
    for r in rows:
        s = state.setdefault(r["season"], dict(pts={}, played={}, last={}))
        h, a = r["HomeTeam"], r["AwayTeam"]
        for t in (h, a):
            s["pts"].setdefault(t, 0); s["last"].setdefault(t, [])
        n_teams, gp = len(s["pts"]), sum(s["played"].values()) / 2 if s["played"] else 0
        # forme : moyenne de points sur les FORM_N derniers matchs (1.35 = moyenne d'une équipe sans historique)
        form = lambda t: np.mean(s["last"][t][-FORM_N:]) if s["last"][t] else 1.35
        r["form"] = form(h) - form(a)
        dead = _stakes(s["pts"], gp, n_teams) if n_teams >= 16 else {h: 0, a: 0}
        r["dead"] = dead[h] - dead[a]
        # mise à jour après le match
        gh, ga = r["FTHG"], r["FTAG"]
        ph, pa = (3, 0) if gh > ga else (0, 3) if gh < ga else (1, 1)
        s["pts"][h] += ph; s["pts"][a] += pa
        s["last"][h].append(ph); s["last"][a].append(pa)
        for t in (h, a):
            s["played"][t] = s["played"].get(t, 0) + 1
    return rows


def shot_targets(train, alpha, proxy="shots"):
    """Cible = alpha * buts + (1-alpha) * xG. proxy="shots" : xG approximé = c1*tirs cadrés + c2*tirs non
    cadrés (c1, c2 estimés sur les matchs d'entraînement). proxy="xg" : vrais xG quand ils existent
    (sinon les buts)."""
    gh = np.array([r["FTHG"] for r in train], float); ga = np.array([r["FTAG"] for r in train], float)
    if alpha >= 1:
        return gh, ga
    if proxy == "xg":
        xh = np.array([r["xg"][0] if r["xg"] else g for r, g in zip(train, gh)])
        xa = np.array([r["xg"][1] if r["xg"] else g for r, g in zip(train, ga)])
        return alpha * gh + (1 - alpha) * xh, alpha * ga + (1 - alpha) * xa
    ok = np.array([r["shots"] is not None for r in train])
    S = np.array([r["shots"] if r["shots"] else (0, 0, 0, 0) for r in train], float)
    Xh = np.c_[S[:, 1], S[:, 0] - S[:, 1]]; Xa = np.c_[S[:, 3], S[:, 2] - S[:, 3]]
    c = np.linalg.lstsq(np.r_[Xh[ok], Xa[ok]], np.r_[gh[ok], ga[ok]], rcond=None)[0]
    xh = np.where(ok, Xh @ c, gh); xa = np.where(ok, Xa @ c, ga)
    return alpha * gh + (1 - alpha) * xh, alpha * ga + (1 - alpha) * xa


def fit(train, ref_date, feats=(), home_specific=False, alpha=1.0, target=None, proxy="shots"):
    """target=("HC", "AC") ajuste le même modèle sur une autre statistique (ex. corners) au lieu des buts."""
    if target:
        train = [r for r in train if r.get(target[0]) not in (None, "") and r.get(target[1]) not in (None, "")]
    teams = sorted({r["HomeTeam"] for r in train} | {r["AwayTeam"] for r in train})
    idx = {t: i for i, t in enumerate(teams)}
    n, F = len(teams), len(feats)
    h = np.array([idx[r["HomeTeam"]] for r in train])
    a = np.array([idx[r["AwayTeam"]] for r in train])
    if target:
        gh = np.array([float(r[target[0]]) for r in train]); ga = np.array([float(r[target[1]]) for r in train])
    else:
        gh, ga = shot_targets(train, alpha, proxy)
    X =np.array([[r[f] for f in feats] for r in train], float).reshape(len(train), F)
    w = np.exp(-XI * np.array([(ref_date - r["Date"]).days for r in train]))
    K = 2 * n + 2                                 # début des paramètres "domicile par équipe"

    def nll(p):
        att, dfn, mu, ha = p[:n], p[n:2 * n], p[2 * n], p[2 * n + 1]
        hh, th = p[K:K + n], p[K + n:]
        z = X @ th
        lh = np.exp(mu + ha + hh[h] + att[h] - dfn[a] + z)
        la = np.exp(mu + att[a] - dfn[h] - z)
        ll = w * (gh * np.log(lh) - lh + ga * np.log(la) - la)
        val = -ll.sum() + L2 * (att @ att + dfn @ dfn) + L2_HOME * (hh @ hh)
        rh, ra = w * (gh - lh), w * (ga - la)
        g = np.zeros_like(p)
        np.add.at(g, h, -rh); np.add.at(g, a, -ra)
        np.add.at(g, n + a, rh); np.add.at(g, n + h, ra)
        g[:n] += 2 * L2 * att; g[n:2 * n] += 2 * L2 * dfn
        g[2 * n] = -(rh.sum() + ra.sum()); g[2 * n + 1] = -rh.sum()
        np.add.at(g, K + h, -rh); g[K:K + n] += 2 * L2_HOME * hh
        g[K + n:] = -(X.T @ rh) + X.T @ ra
        return val, g

    p0 = np.zeros(K + n + F); p0[2 * n] = 0.2
    bounds = [(None, None)] * K + [(None, None) if home_specific else (0, 0)] * n + [(None, None)] * F
    p = minimize(nll, p0, jac=True, method="L-BFGS-B", bounds=bounds).x
    return dict(idx=idx, att=p[:n], dfn=p[n:2 * n], mu=p[2 * n], ha=p[2 * n + 1],
                hh=p[K:K + n], theta=p[K + n:], feats=feats)


def score_grid(m, home, away, z=0.0):
    """Matrice P(buts dom = i, buts ext = j) et buts attendus. Équipe inconnue -> force moyenne (0)."""
    i, j = m["idx"].get(home), m["idx"].get(away)
    v = lambda arr, k: arr[k] if k is not None else 0.0
    lh = np.exp(m["mu"] + m["ha"] + v(m["hh"], i) + v(m["att"], i) - v(m["dfn"], j) + z)
    la = np.exp(m["mu"] + v(m["att"], j) - v(m["dfn"], i) - z)
    g = np.arange(MAXG + 1)
    return np.outer(poisson.pmf(g, lh), poisson.pmf(g, la)), (lh, la)


def predict(m, r):
    """(P_dom, P_nul, P_ext) pour un match r (dict avec HomeTeam, AwayTeam et les features)."""
    z = sum(t * r[f] for t, f in zip(m["theta"], m["feats"]))
    grid, _ = score_grid(m, r["HomeTeam"], r["AwayTeam"], z)
    return np.array([np.tril(grid, -1).sum(), np.trace(grid), np.triu(grid, 1).sum()])


CONFIGS = [                                   # (nom, features, domicile par équipe, alpha)
    ("Base (buts seuls)", (), False, 1.0),
    ("75% buts / 25% tirs", (), False, 0.75),
    ("50% buts / 50% tirs", (), False, 0.5),
    ("25% buts / 75% tirs", (), False, 0.25),
    ("Tirs seuls (xG proxy)", (), False, 0.0),
]


def backtest(season_start=datetime(2025, 7, 1), season_end=datetime(2026, 7, 1), min_train=200):
    df = load()
    dates = sorted({r["Date"] for r in df if season_start <= r["Date"] < season_end})
    y, P, Q, last_theta = [], {c[0]: [] for c in CONFIGS}, [], {}
    for d in dates:
        train = [r for r in df if r["Date"] < d]
        if len(train) < min_train:
            continue
        models = {name: fit(train, d, feats, hs, al) for name, feats, hs, al in CONFIGS}
        for name, m in models.items():
            last_theta[name] = dict(zip(m["feats"], m["theta"]))
        for r in (r for r in df if r["Date"] == d):
            if r["HomeTeam"] not in models["Base (buts seuls)"]["idx"] or r["AwayTeam"] not in models["Base (buts seuls)"]["idx"]:
                continue
            for name, m in models.items():
                P[name].append(predict(m, r))
            o = np.array([float(r["AvgH"]), float(r["AvgD"]), float(r["AvgA"])])
            Q.append((1 / o) / (1 / o).sum())
            y.append("HDA".index(r["FTR"]))
    y = np.array(y); Q = np.array(Q); P = {k: np.array(v) for k, v in P.items()}
    ll = lambda X: -np.log(X[np.arange(len(y)), y])
    brier = lambda X: ((X - np.eye(3)[y]) ** 2).sum(1).mean()
    acc = lambda X: (X.argmax(1) == y).mean()
    base_ll = ll(P["Base (buts seuls)"])
    print(f"{len(y)} matchs testés (saison {season_start.year}/{season_end.year - 2000}, réentraîné avant chaque journée)\n")
    print(f"{'':26s}{'log-loss':>9s}{'Brier':>8s}{'accuracy':>10s}{'gain vs base (± err.std)':>28s}")
    for name, X in list(P.items()) + [("Cotes bookmakers", Q)]:
        d = base_ll - ll(X)
        gain = "" if name == "Base (buts seuls)" else f"{d.mean():+.4f} ± {d.std(ddof=1) / np.sqrt(len(y)):.4f}"
        print(f"{name:26s}{ll(X).mean():9.4f}{brier(X):8.4f}{acc(X):10.1%}{gain:>28s}")

if __name__ == "__main__":
    backtest()
    print("\n" + "=" * 60 + "\n")
    backtest(datetime(2024, 7, 1), datetime(2025, 7, 1))
