"""Classement de force des équipes pour les championnats qui n'ont que le calendrier (Bulgarie, Algérie, Ukraine…).
Chaque jour, les scores des matchs terminés vus dans le calendrier (ESPN, TheSportsDB, API-Football) sont gardés dans data/strength_log.json.
Quand un championnat a assez de résultats, un modèle de Poisson (attaque / défense / avantage du domicile) en tire une probabilité 1X2 pour ses prochains matchs,
fortement ramenée vers les fréquences réelles du championnat tant que l'historique est court. Ces estimations sont APPROXIMATIVES : jamais utilisées dans le suivi
ni dans les pronostics sûrs, et marquées « ≈ » dans l'interface."""
import json
import os
import sys
from datetime import datetime, timedelta

import numpy as np

import poisson

LOG = "data/strength_log.json"
KEEP_DAYS = 300                    # on garde environ une saison
MIN_LEAGUE = 24                    # résultats minimum dans le championnat avant d'afficher quoi que ce soit
MIN_TEAM = 2                       # matchs minimum de chaque équipe
SHRINK = 40.0                      # poids du modèle = n / (n + SHRINK) : 24 matchs -> 38 %, 120 matchs -> 75 %
poisson.LEAGUE_CFG["CAL"] = (0.0035, 3.0)       # demi-vie courte (forme récente) et régularisation forte (peu de données)


def _read():
    try:
        with open(LOG, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def update(cal, extra=(), now=None):
    """Ajoute au journal les résultats des matchs terminés. cal : éléments du calendrier ; extra : [(ligue, date, domicile, extérieur, buts dom., buts ext.)]."""
    log = _read()
    today = (now or datetime.utcnow()).date()
    lo = f"{today - timedelta(days=KEEP_DAYS):%Y-%m-%d}"
    add = [(c["s"], c["date"], c["home"], c["away"], c["hs"], c["as_"]) for c in cal if c.get("st") == "post" and isinstance(c.get("hs"), int) and isinstance(c.get("as_"), int)]
    add += list(extra)
    n = 0
    for s, d, h, a, hs, as_ in add:
        rows = log.setdefault(s, [])
        if any(r[0] == d and r[1] == h and r[2] == a for r in rows):
            continue
        rows.append([d, h, a, int(hs), int(as_)])
        n += 1
    for s in list(log):
        log[s] = sorted([r for r in log[s] if r[0] >= lo])
        if not log[s]:
            del log[s]
    os.makedirs("data", exist_ok=True)
    with open(LOG, "w", encoding="utf-8") as fh:
        json.dump(log, fh, ensure_ascii=False, separators=(",", ":"))
    return n


def _model(rows, ref):
    train = [dict(Div="CAL", Date=datetime.strptime(r[0], "%Y-%m-%d"), HomeTeam=r[1], AwayTeam=r[2], FTHG=r[3], FTAG=r[4]) for r in rows]
    return poisson.fit(train, ref, alpha=1.0)


def apply(cal, now=None):
    """Renseigne p (1X2), q='approx' et n (nombre de résultats du championnat) sur les matchs à venir sans prédiction dont le championnat a assez de résultats."""
    log = _read()
    ref = datetime.strptime(f"{(now or datetime.utcnow()):%Y-%m-%d}", "%Y-%m-%d")
    leagues = {c["s"] for c in cal if c.get("p") is None and c.get("st") == "pre"}
    done = 0
    for s in leagues:
        rows = log.get(s) or []
        if len(rows) < MIN_LEAGUE:
            continue
        try:
            m = _model(rows, ref)
        except Exception as exc:
            print(f"[avertissement] force des équipes {s} : {exc}", file=sys.stderr)
            continue
        cnt = {}
        for r in rows:
            cnt[r[1]] = cnt.get(r[1], 0) + 1
            cnt[r[2]] = cnt.get(r[2], 0) + 1
        base = np.array([sum(r[3] > r[4] for r in rows), sum(r[3] == r[4] for r in rows), sum(r[3] < r[4] for r in rows)], float)
        base = (base + 1) / (base.sum() + 3)                                 # fréquences observées (lissées)
        w = len(rows) / (len(rows) + SHRINK)
        for c in cal:
            if c["s"] != s or c.get("p") is not None or c.get("st") != "pre":
                continue
            if cnt.get(c["home"], 0) < MIN_TEAM or cnt.get(c["away"], 0) < MIN_TEAM:
                continue
            g, _ = poisson.score_grid(m, c["home"], c["away"])
            ph, pd, pa = float(np.tril(g, -1).sum()), float(np.trace(g)), float(np.triu(g, 1).sum())
            tot = ph + pd + pa
            p = w * np.array([ph, pd, pa]) / tot + (1 - w) * base
            c["p"] = [round(float(x), 4) for x in p / p.sum()]
            c["q"] = "approx"
            c["n"] = len(rows)
            done += 1
    return done
