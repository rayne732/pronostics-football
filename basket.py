"""Basket (NBA + EuroLeague) : points marqués / encaissés par équipe (moindres carrés régularisés, pondérés par la date),
marges et totaux de points ~ lois normales. Calendrier : ESPN (NBA) et API officielle de l'EuroLeague.
Chaque pronostic n'utilise que des matchs antérieurs ; un backtest mesure la calibration."""
import json
import math
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

import numpy as np

DATA = "data"
GAMES_FILE = os.path.join(DATA, "basket_games.json")
MODEL_FILE = os.path.join(DATA, "basket_model.json")
UA = {"User-Agent": "Mozilla/5.0"}
ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
EUR = "https://api-live.euroleague.net/v2/competitions/E/seasons/{s}/games"
NBA_SEASONS = (2024, 2025, 2026)             # année de fin de saison ESPN (2026 = 2025-26)
EUR_SEASONS = ("E2024", "E2025", "E2026")
LEAGUES = {"NBA": "NBA", "EL": "EuroLeague"}
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
XI = math.log(2) / 365           # une saison vieille d'un an compte moitié moins
LAM = {"NBA": 12.0, "EL": 12.0}    # régularisation des forces d'équipe (en points)
BACKTEST_FROM = {"NBA": date(2025, 10, 1), "EL": date(2025, 10, 1)}


def _get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as resp:
        return json.loads(resp.read())


def _iso(s):
    return datetime.strptime(s[:16], "%Y-%m-%dT%H:%M")


# ------------------------------------------------------------------ historique
def _nba_team_ids():
    d = _get(ESPN + "/teams", 30)
    return [t["team"]["id"] for t in d["sports"][0]["leagues"][0]["teams"]]


def _nba_events(events):
    """Matchs terminés d'une liste d'événements ESPN -> [id, date UTC, domicile, extérieur, pts dom, pts ext, type de saison]."""
    out = []
    for e in events:
        c = e["competitions"][0]
        if not c["status"]["type"]["completed"]:
            continue
        home = next(x for x in c["competitors"] if x["homeAway"] == "home")
        away = next(x for x in c["competitors"] if x["homeAway"] == "away")
        sc = lambda x: x["score"]["value"] if isinstance(x["score"], dict) else float(x["score"])
        st = e["seasonType"]["type"] if isinstance(e.get("seasonType"), dict) else (e.get("season") or {}).get("type", 2)
        out.append([e["id"], e["date"][:16], home["team"]["displayName"], away["team"]["displayName"], int(sc(home)), int(sc(away)), st])
    return out


def _load_cache():
    try:
        with open(GAMES_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def update_nba(cache, today):
    """Complète l'historique NBA : saisons complètes au premier lancement, puis jour par jour (scoreboard)."""
    games = {g[0]: g for g in cache.get("NBA", [])}
    if not games:
        ids = _nba_team_ids()
        for season in NBA_SEASONS:
            for tid in ids:
                for stype in (2, 3):
                    try:
                        d = _get(f"{ESPN}/teams/{tid}/schedule?season={season}&seasontype={stype}", 60)
                    except Exception:
                        continue
                    for g in _nba_events(d.get("events", [])):
                        g[6] = stype
                        games[g[0]] = g
                time.sleep(0.2)
    last = max((g[1][:10] for g in games.values()), default=None)
    if last:
        day = date.fromisoformat(last) + timedelta(days=1)
        n = 0
        while day < today and n < 25:
            try:
                d = _get(f"{ESPN}/scoreboard?dates={day:%Y%m%d}", 30)
                for g in _nba_events(d.get("events", [])):
                    games[g[0]] = g
            except Exception as exc:
                print(f"[avertissement] ESPN NBA {day} : {exc}", file=sys.stderr)
                break
            day += timedelta(days=1)
            n += 1
    return sorted(games.values(), key=lambda g: g[1])


def _eur_rows(season):
    d = _get(EUR.format(s=season), 60)["data"]
    return d


def update_euro(cache):
    """EuroLeague : les saisons passées viennent du cache, la saison en cours est relue à chaque fois.
    Renvoie (matchs terminés, matchs de la saison en cours [dict])."""
    games = {g[0]: g for g in cache.get("EL", [])}
    current = EUR_SEASONS[-1]
    seasons = [s for s in EUR_SEASONS if s == current or not any(g[0].startswith(s) for g in games.values())]
    season_rows = []
    for s in seasons:
        try:
            rows = _eur_rows(s)
        except Exception as exc:
            print(f"[avertissement] EuroLeague {s} : {exc}", file=sys.stderr)
            continue
        for r in rows:
            gid = f'{s}_{r["gameCode"]}'
            if r.get("played"):
                games[gid] = [gid, r["utcDate"][:16], r["local"]["club"]["name"], r["road"]["club"]["name"], r["local"]["score"], r["road"]["score"], 2]
            if s == current:
                season_rows.append(dict(id=gid, d=r["utcDate"][:16], home=r["local"]["club"]["name"], away=r["road"]["club"]["name"],
                                        played=bool(r.get("played")), hs=r["local"]["score"], as_=r["road"]["score"], round=r.get("round")))
    return sorted(games.values(), key=lambda g: g[1]), season_rows


# ------------------------------------------------------------------ modèle
def fit(games, asof, lam):
    """Points attendus de chaque équipe : mu + avantage du terrain + attaque(équipe) - défense(adversaire)."""
    rows = [g for g in games if g[1][:10] < asof.isoformat()]
    if len(rows) < 30:
        return None
    teams = sorted({g[2] for g in rows} | {g[3] for g in rows})
    ix = {t: i for i, t in enumerate(teams)}
    T, n = len(teams), len(rows)
    X = np.zeros((2 * n + 2 * T, 2 + 2 * T))
    y = np.zeros(2 * n + 2 * T)
    w = np.zeros(2 * n + 2 * T)
    for k, g in enumerate(rows):
        age = (asof - date.fromisoformat(g[1][:10])).days
        wt = math.exp(-XI * age)
        h, a = ix[g[2]], ix[g[3]]
        X[2 * k, 0], X[2 * k, 1], X[2 * k, 2 + h], X[2 * k, 2 + T + a] = 1, 1, 1, -1
        X[2 * k + 1, 0], X[2 * k + 1, 2 + a], X[2 * k + 1, 2 + T + h] = 1, 1, -1
        y[2 * k], y[2 * k + 1] = g[4], g[5]
        w[2 * k], w[2 * k + 1] = wt, wt
    for i in range(2 * T):                                  # ridge sur attaque et défense
        X[2 * n + i, 2 + i] = 1
        w[2 * n + i] = lam
    sw = np.sqrt(w)
    A = X * sw[:, None]
    b = y * sw
    # contraintes de centrage (somme des attaques = somme des défenses = 0) : poids très fort
    C = np.zeros((2, 2 + 2 * T))
    C[0, 2:2 + T] = 1
    C[1, 2 + T:] = 1
    A = np.vstack([A, 1e3 * C])
    b = np.concatenate([b, [0, 0]])
    beta = np.linalg.lstsq(A, b, rcond=None)[0]
    mu, ha = beta[0], beta[1]
    att = {t: beta[2 + i] for t, i in ix.items()}
    dfn = {t: beta[2 + T + i] for t, i in ix.items()}
    res_m, res_t, res_p = [], [], []
    for g in rows[-1500:]:
        lh = mu + ha + att[g[2]] - dfn[g[3]]
        la = mu + att[g[3]] - dfn[g[2]]
        res_m.append((g[4] - g[5]) - (lh - la))
        res_t.append((g[4] + g[5]) - (lh + la))
        res_p += [g[4] - lh, g[5] - la]
    return dict(mu=mu, ha=ha, att=att, dfn=dfn, sdm=float(np.std(res_m)), sdt=float(np.std(res_t)), sdp=float(np.std(res_p)), n=n)


def expected(M, home, away):
    if home not in M["att"] or away not in M["att"]:
        return None
    return (M["mu"] + M["ha"] + M["att"][home] - M["dfn"][away], M["mu"] + M["att"][away] - M["dfn"][home])


def ncdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def sf(x, mean, sd):                                        # P(X > x)
    return 1 - ncdf((x - mean) / sd)


def families(M, home, away, lh, la):
    """Marchés : vainqueur, handicaps, totaux de points, points par équipe. Lignes en .5 autour de la valeur attendue."""
    mm, mt = lh - la, lh + la
    F = [("Vainqueur du match", [[home, sf(0, mm, M["sdm"])], [away, 1 - sf(0, mm, M["sdm"])]], True, False)]
    base = round(mm)
    for team, sgn in ((home, 1), (away, -1)):
        sels = []
        for k in range(-16, 17, 2):                         # l'équipe avec handicap : gagne si marge + ligne > 0
            line = base * sgn + k + 0.5                       # ligne appliquée à l'équipe (ex. -5,5 ou +3,5)
            line = math.floor(line) + 0.5
            p = sf(-line, mm * sgn, M["sdm"])
            sels.append([f"{team} {line:+.1f}".replace(".", ","), p])
        F.append(("Handicap", sels, False, False))
    tot = round(mt)
    lines = [tot + k + 0.5 for k in range(-20, 21, 4)]
    F.append(("Total points (plus)", [[f"Plus de {ln:.1f}".replace(".", ",") + " points", sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    F.append(("Total points (moins)", [[f"Moins de {ln:.1f}".replace(".", ",") + " points", 1 - sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    for team, mean in ((home, lh), (away, la)):
        tl = [round(mean) + k + 0.5 for k in range(-12, 13, 4)]
        F.append((f"Points de {team} (plus)", [[f"{team} plus de {ln:.1f}".replace(".", ",") , sf(ln, mean, M["sdp"])] for ln in tl], False, False))
        F.append((f"Points de {team} (moins)", [[f"{team} moins de {ln:.1f}".replace(".", ","), 1 - sf(ln, mean, M["sdp"])] for ln in tl], False, False))
    return F


def classify(F):
    safe, less = [], []
    for name, sels, validated, lottery in F:
        items = sorted(sels, key=lambda s: -s[1])
        rec = lambda it: dict(m=name, s=it[0], p=round(it[1], 4), v=True, sels=[[s[0], round(s[1], 4)] for s in sels])
        ok = [s for s in items if s[1] >= SAFE_MIN]
        if ok:
            safe.append(rec(min(ok, key=lambda s: s[1])))
        elif items[0][1] >= LESS_SAFE_MIN:
            less.append(rec(items[0]))
    key = lambda r: -r["p"]
    return sorted(safe, key=key), sorted(less, key=key)


def won(rec, home, away, hs, as_):
    """Une sélection est-elle gagnée au vu du score final ?"""
    s, m = rec["s"], rec["m"]
    if m == "Vainqueur du match":
        return s == (home if hs > as_ else away)
    if m == "Handicap":
        team = s.rsplit(" ", 1)[0]
        line = float(s.rsplit(" ", 1)[1].replace(",", "."))
        return (hs - as_ + line > 0) if team == home else (as_ - hs + line > 0)
    ln = float(s.split(" ")[-2 if s.endswith("points") else -1].replace(",", ".")) if m.startswith("Total") else float(s.rsplit(" ", 1)[1].replace(",", "."))
    if m.startswith("Total points"):
        return (hs + as_ > ln) if s.startswith("Plus") else (hs + as_ < ln)
    team = m[len("Points de "):m.rindex(" (")]
    pts = hs if team == home else as_
    return pts > ln if m.endswith("(plus)") else pts < ln


# ------------------------------------------------------------------ backtest
def backtest(games, league):
    """Pronostics rejoués jour après jour (modèle réajusté chaque mois avec les seuls matchs précédents)."""
    start = BACKTEST_FROM[league]
    rows = [g for g in games if g[1][:10] >= start.isoformat() and g[6] == 2]
    if not rows:
        return {}
    recs, picks = [], []
    M, month = None, None
    for g in rows:
        d = date.fromisoformat(g[1][:10])
        if (d.year, d.month) != month:
            M = fit(games, d, LAM[league])
            month = (d.year, d.month)
        if not M:
            continue
        e = expected(M, g[2], g[3])
        if not e:
            continue
        p = sf(0, e[0] - e[1], M["sdm"])
        recs.append((p, g[4] > g[5]))
        safe, less = classify(families(M, g[2], g[3], *e))
        for r in safe:
            picks.append((r["p"], won(r, g[2], g[3], g[4], g[5]), r["m"]))
    if not recs:
        return {}
    n = len(recs)
    out = dict(n=n, ll=sum(-math.log(min(max(p if w else 1 - p, 1e-6), 1 - 1e-6)) for p, w in recs) / n, acc=sum((p > 0.5) == w for p, w in recs) / n, brier=sum((p - w) ** 2 for p, w in recs) / n,
               n_safe=len(picks), said=sum(p for p, _, _ in picks) / max(len(picks), 1), real=sum(w for _, w, _ in picks) / max(len(picks), 1),
               since=start.isoformat(), until=rows[-1][1][:10])
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
        sel = [(max(p, 1 - p), (p > 0.5) == w) for p, w in recs if lo <= max(p, 1 - p) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ assemblage
def _nba_window(start, end):
    """Matchs NBA (tous statuts) des jours [start, end] via le scoreboard ESPN."""
    out, day = [], start
    while day <= end:
        try:
            d = _get(f"{ESPN}/scoreboard?dates={day:%Y%m%d}", 30)
        except Exception as exc:
            print(f"[avertissement] ESPN NBA {day} : {exc}", file=sys.stderr)
            return out
        for e in d.get("events", []):
            c = e["competitions"][0]
            home = next(x for x in c["competitors"] if x["homeAway"] == "home")
            away = next(x for x in c["competitors"] if x["homeAway"] == "away")
            out.append(dict(id=e["id"], d=e["date"][:16], home=home["team"]["displayName"], away=away["team"]["displayName"],
                            state=c["status"]["type"]["state"], hs=int(float(home.get("score") or 0)), as_=int(float(away.get("score") or 0)),
                            pre=(e.get("season") or {}).get("type") == 1, label="Présaison" if (e.get("season") or {}).get("type") == 1 else ""))
        day += timedelta(days=1)
    return out


def _model_json(M):
    r = lambda d: {k: round(v, 2) for k, v in d.items()}
    return dict(mu=round(M["mu"], 3), ha=round(M["ha"], 3), sdm=round(M["sdm"], 2), sdt=round(M["sdt"], 2), sdp=round(M["sdp"], 2),
                att=r(M["att"]), dfn=r(M["dfn"]))


def build(now, days=5):
    """Données basket pour la page : modèles exportés + matchs d'hier à J+days (pronostic avec les données d'avant hier)."""
    from tennis import paris
    cache = _load_cache()
    today = now.date()
    start, end = today - timedelta(days=1), today + timedelta(days=days)
    try:
        cache["NBA"] = update_nba(cache, today)
    except Exception as exc:
        print(f"[avertissement] historique NBA : {exc}", file=sys.stderr)
    el_rows = []
    try:
        cache["EL"], el_rows = update_euro(cache)
    except Exception as exc:
        print(f"[avertissement] historique EuroLeague : {exc}", file=sys.stderr)
    if not cache.get("NBA") and not cache.get("EL"):
        return {}
    os.makedirs(DATA, exist_ok=True)
    with open(GAMES_FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, separators=(",", ":"))
    models, model_js, bt = {}, {}, {}
    for lg in ("NBA", "EL"):
        if not cache.get(lg):
            continue
        M = fit(cache[lg], start, LAM[lg])
        if M:
            models[lg] = M
            model_js[lg] = _model_json(M)
        bt[lg] = backtest(cache[lg], lg)
    raws = []
    if "NBA" in models:
        for g in _nba_window(start, end):
            raws.append(dict(lg="NBA", **g))
    for g in el_rows:
        raws.append(dict(lg="EL", id=g["id"], d=g["d"], home=g["home"], away=g["away"], state="post" if g["played"] else ("in" if g["d"] < f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M}" else "pre"),
                         hs=g["hs"], as_=g["as_"], pre=False, label=f'Journée {g["round"]}'))
    items = []
    for g in raws:
        when = paris(_iso(g["d"]))
        if not (start <= when.date() <= end) or g["lg"] not in models:
            continue
        M = models[g["lg"]]
        e = expected(M, g["home"], g["away"])
        known = bool(e) and not g["pre"]
        lh, la = e if e else (M["mu"], M["mu"])
        F = families(M, g["home"], g["away"], lh, la)
        safe, less = classify(F) if known else ([], [])
        p = sf(0, lh - la, M["sdm"])
        item = dict(id=str(g["id"]), lg=g["lg"], date=when.date().isoformat(), time=f"{when:%H:%M}", state=g["state"], home=g["home"], away=g["away"],
                    p=round(p, 4), lh=round(lh, 1), la=round(la, 1), known=known, pre=g["pre"], label=g["label"], safe=safe, less=less)
        if g["state"] == "post":
            item.update(hs=g["hs"], as_=g["as_"], hit=(p > 0.5) == (g["hs"] > g["as_"]) if known else None)
            if known:
                item["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, g["home"], g["away"], g["hs"], g["as_"]), t=t)
                                 for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(item)
    items.sort(key=lambda x: (x["date"], x["time"], x["lg"]))
    return dict(matches=items, bt=bt, model=dict(m=model_js, safe=SAFE_MIN, less=LESS_SAFE_MIN), generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    t0 = time.time()
    cache = _load_cache()
    today = date.today()
    cache["NBA"] = update_nba(cache, today)
    el, fx = update_euro(cache)
    cache["EL"] = el
    os.makedirs(DATA, exist_ok=True)
    with open(GAMES_FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, separators=(",", ":"))
    print("temps", round(time.time() - t0), "s;", {k: len(v) for k, v in cache.items()}, "calendrier EL", len(fx))
    for lg in ("NBA", "EL"):
        print(lg, json.dumps(backtest(cache[lg], lg), indent=1))
