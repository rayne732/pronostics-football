"""Hockey sur glace (NHL) : buts du temps réglementaire ~ lois de Poisson (attaque / défense par équipe, avantage de la glace,
pondération par la date), comme le football. Les prolongations et tirs au but ne comptent pas dans les marchés « temps réglementaire »
(match nul possible) ; le « vainqueur » les inclut. Données : ESPN (historique par équipe, calendrier et scores par jour)."""
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta

import numpy as np
from scipy.optimize import minimize

from basket import _get, _iso
from tennis import paris

DATA = "data"
GAMES_FILE = os.path.join(DATA, "hockey_games.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl"
SEASONS = (2024, 2025, 2026)                # année de fin de saison ESPN
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
XI = math.log(2) / 365
L2 = 60.0
MAXG = 13
BACKTEST_FROM = date(2025, 10, 1)
ALIAS = {"Utah Hockey Club": "Utah Mammoth"}


# ------------------------------------------------------------------ données
def _reg(hs, as_, period):
    """Score du temps réglementaire : si le match a fini en prolongation ou aux tirs au but (période > 3), il était nul."""
    if period and period > 3:
        m = min(hs, as_)
        return m, m
    return hs, as_


def _row(e):
    c = e["competitions"][0]
    if not c["status"]["type"]["completed"]:
        return None
    home = next(x for x in c["competitors"] if x["homeAway"] == "home")
    away = next(x for x in c["competitors"] if x["homeAway"] == "away")
    sc = lambda x: int(float(x["score"]["value"] if isinstance(x["score"], dict) else x["score"]))
    hs, as_ = sc(home), sc(away)
    rh, ra = _reg(hs, as_, c["status"].get("period", 3))
    st = e["seasonType"]["type"] if isinstance(e.get("seasonType"), dict) else (e.get("season") or {}).get("type", 2)
    nm = lambda x: ALIAS.get(x["team"]["displayName"], x["team"]["displayName"])
    return [str(e["id"]), e["date"][:16], nm(home), nm(away), rh, ra, st, hs, as_]


def _load():
    try:
        with open(GAMES_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return []


def update(games, today):
    """Historique : saisons complètes au premier lancement (équipe par équipe), puis jour par jour."""
    rows = {g[0]: g for g in games}
    if not rows:
        ids = [t["team"]["id"] for t in _get(ESPN + "/teams", 30)["sports"][0]["leagues"][0]["teams"]]
        for season in SEASONS:
            for tid in ids:
                for stype in (2, 3):
                    try:
                        d = _get(f"{ESPN}/teams/{tid}/schedule?season={season}&seasontype={stype}", 60)
                    except Exception:
                        continue
                    for e in d.get("events", []):
                        r = _row(e)
                        if r:
                            r[6] = stype
                            rows[r[0]] = r
                time.sleep(0.15)
    last = max((g[1][:10] for g in rows.values()), default=None)
    if last:
        day, n = date.fromisoformat(last) + timedelta(days=1), 0
        while day < today and n < 25:
            try:
                d = _get(f"{ESPN}/scoreboard?dates={day:%Y%m%d}", 30)
            except Exception as exc:
                print(f"[avertissement] ESPN NHL {day} : {exc}", file=sys.stderr)
                break
            for e in d.get("events", []):
                r = _row(e)
                if r:
                    rows[r[0]] = r
            day += timedelta(days=1)
            n += 1
    return sorted(rows.values(), key=lambda g: g[1])


# ------------------------------------------------------------------ modèle
def fit(games, asof, l2=None):
    L2_ = L2 if l2 is None else l2
    rows = [g for g in games if g[1][:10] < asof.isoformat()]
    if len(rows) < 200:
        return None
    teams = sorted({g[2] for g in rows} | {g[3] for g in rows})
    ix = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    h = np.array([ix[g[2]] for g in rows])
    a = np.array([ix[g[3]] for g in rows])
    gh = np.array([g[4] for g in rows], float)
    ga = np.array([g[5] for g in rows], float)
    w = np.exp(-XI * np.array([(asof - date.fromisoformat(g[1][:10])).days for g in rows]))

    def nll(p):
        att, dfn, mu, ha = p[:n], p[n:2 * n], p[2 * n], p[2 * n + 1]
        lh = np.exp(mu + ha + att[h] - dfn[a])
        la = np.exp(mu + att[a] - dfn[h])
        ll = w * (gh * np.log(lh) - lh + ga * np.log(la) - la)
        val = -ll.sum() + L2_ * (att @ att + dfn @ dfn)
        rh, ra = w * (gh - lh), w * (ga - la)
        g = np.zeros_like(p)
        np.add.at(g, h, -rh)
        np.add.at(g, a, -ra)
        np.add.at(g, n + a, rh)
        np.add.at(g, n + h, ra)
        g[:n] += 2 * L2_ * att
        g[n:2 * n] += 2 * L2_ * dfn
        g[2 * n] = -(rh.sum() + ra.sum())
        g[2 * n + 1] = -rh.sum()
        return val, g

    p0 = np.zeros(2 * n + 2)
    p0[2 * n] = 1.0
    p = minimize(nll, p0, jac=True, method="L-BFGS-B").x
    return dict(mu=float(p[2 * n]), ha=float(p[2 * n + 1]), att={t: float(p[i]) for t, i in ix.items()}, dfn={t: float(p[n + i]) for t, i in ix.items()})


def lam(M, home, away):
    if home not in M["att"] or away not in M["att"]:
        return None
    return (math.exp(M["mu"] + M["ha"] + M["att"][home] - M["dfn"][away]), math.exp(M["mu"] + M["att"][away] - M["dfn"][home]))


def _pmf(l):
    a, p = [0.0] * MAXG, math.exp(-l)
    a[0] = p
    for k in range(1, MAXG):
        p = p * l / k
        a[k] = p
    return a


def grid(lh, la):
    a, b = _pmf(lh), _pmf(la)
    return [[a[i] * b[j] for j in range(MAXG)] for i in range(MAXG)]


def _s(g, f):
    return sum(g[i][j] for i in range(MAXG) for j in range(MAXG) if f(i, j))


def families(home, away, lh, la):
    """Marchés du temps réglementaire (+ vainqueur prolongations incluses)."""
    g = grid(lh, la)
    ph, pd, pa = _s(g, lambda i, j: i > j), _s(g, lambda i, j: i == j), _s(g, lambda i, j: i < j)
    q = 0.5 * (0.5 + ph / (ph + pa))                      # part du nul gagnée par le domicile en prolongation / tirs au but
    F = [("Résultat (temps réglementaire)", [[home, ph], ["Match nul", pd], [away, pa]], True, False),
         ("Vainqueur (prolongations incluses)", [[home, ph + pd * q], [away, pa + pd * (1 - q)]], True, False),
         ("Double chance", [[home + " ou nul", ph + pd], [away + " ou nul", pa + pd], [home + " ou " + away, ph + pa]], True, False)]
    b = _s(g, lambda i, j: i > 0 and j > 0)
    F.append(("Les deux équipes marquent", [["Oui", b], ["Non", 1 - b]], False, False))
    F.append(("Total buts (plus)", [[f"Plus de {x:.1f}".replace(".", ",") + " buts", _s(g, lambda i, j, x=x: i + j > x)] for x in (2.5, 3.5, 4.5, 5.5, 6.5)], False, False))
    F.append(("Total buts (moins)", [[f"Moins de {x:.1f}".replace(".", ",") + " buts", _s(g, lambda i, j, x=x: i + j < x)] for x in (3.5, 4.5, 5.5, 6.5, 7.5)], False, False))
    for team, idx in ((home, 0), (away, 1)):
        F.append((f"Buts de {team} (plus)", [[f"{team} plus de {x:.1f}".replace(".", ","), _s(g, lambda i, j, x=x, idx=idx: (i, j)[idx] > x)] for x in (0.5, 1.5, 2.5, 3.5)], False, False))
        F.append((f"Buts de {team} (moins)", [[f"{team} moins de {x:.1f}".replace(".", ","), _s(g, lambda i, j, x=x, idx=idx: (i, j)[idx] < x)] for x in (1.5, 2.5, 3.5)], False, False))
    F.append(("Handicap -1,5", [[home + " -1,5", _s(g, lambda i, j: i - j >= 2)], [away + " +1,5", _s(g, lambda i, j: i - j < 2)]], False, False))
    F.append(("Handicap +1,5", [[away + " -1,5", _s(g, lambda i, j: j - i >= 2)], [home + " +1,5", _s(g, lambda i, j: j - i < 2)]], False, False))
    return F, (ph, pd, pa)


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


def won(rec, home, away, hs, as_, final):
    """hs / as_ : buts du temps réglementaire ; final : (domicile, extérieur) avec prolongations / tirs au but."""
    s, m = rec["s"], rec["m"]
    if m.startswith("Résultat"):
        return s == (home if hs > as_ else away if as_ > hs else "Match nul")
    if m.startswith("Vainqueur"):
        return s == (home if final[0] > final[1] else away)
    if m == "Double chance":
        return hs >= as_ if s == home + " ou nul" else as_ >= hs if s == away + " ou nul" else hs != as_
    if m == "Les deux équipes marquent":
        return (hs > 0 and as_ > 0) == (s == "Oui")
    if m.startswith("Total buts"):
        ln = float(s.split(" ")[-2].replace(",", "."))
        return (hs + as_ > ln) if s.startswith("Plus") else (hs + as_ < ln)
    if m.startswith("Buts de"):
        team = m[len("Buts de "):m.rindex(" (")]
        ln = float(s.rsplit(" ", 1)[1].replace(",", "."))
        pts = hs if team == home else as_
        return pts > ln if m.endswith("(plus)") else pts < ln
    team = s[:s.rindex(" ")]
    d = (hs - as_) if team == home else (as_ - hs)
    return d >= 2 if "-1,5" in s else d < 2


# ------------------------------------------------------------------ backtest
def backtest(games):
    rows = [g for g in games if g[1][:10] >= BACKTEST_FROM.isoformat() and g[6] == 2]
    recs, picks, M, month = [], [], None, None
    for g in rows:
        d = date.fromisoformat(g[1][:10])
        if (d.year, d.month) != month:
            M, month = fit(games, d), (d.year, d.month)
        if not M:
            continue
        e = lam(M, g[2], g[3])
        if not e:
            continue
        F, (ph, pd, pa) = families(g[2], g[3], *e)
        q = 0.5 * (0.5 + ph / (ph + pa))
        pw = ph + pd * q
        recs.append((pw, g[7] > g[8]))
        safe, _ = classify(F)
        picks += [(r["p"], won(r, g[2], g[3], g[4], g[5], (g[7], g[8]))) for r in safe]
    if not recs:
        return {}
    n = len(recs)
    out = dict(n=n, acc=sum((p > 0.5) == w for p, w in recs) / n, n_safe=len(picks), said=sum(p for p, _ in picks) / max(len(picks), 1),
               real=sum(w for _, w in picks) / max(len(picks), 1), since=BACKTEST_FROM.isoformat(), until=rows[-1][1][:10])
    bins = []
    for lo, hi in ((0.5, 0.55), (0.55, 0.6), (0.6, 0.7), (0.7, 1.01)):
        sel = [(max(p, 1 - p), (p > 0.5) == w) for p, w in recs if lo <= max(p, 1 - p) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ assemblage
def _window(start, end):
    out, day = [], start
    while day <= end:
        try:
            d = _get(f"{ESPN}/scoreboard?dates={day:%Y%m%d}", 30)
        except Exception as exc:
            print(f"[avertissement] ESPN NHL {day} : {exc}", file=sys.stderr)
            return out
        for e in d.get("events", []):
            c = e["competitions"][0]
            home = next(x for x in c["competitors"] if x["homeAway"] == "home")
            away = next(x for x in c["competitors"] if x["homeAway"] == "away")
            nm = lambda x: ALIAS.get(x["team"]["displayName"], x["team"]["displayName"])
            num = lambda x: int(float(x["score"])) if x.get("score") not in (None, "") else None
            pre = (e.get("season") or {}).get("type") == 1
            out.append(dict(id=str(e["id"]), d=e["date"][:16], home=nm(home), away=nm(away), state=c["status"]["type"]["state"], hs=num(home), as_=num(away),
                            period=c["status"].get("period", 0), pre=pre))
        day += timedelta(days=1)
    return out


def _model_json(M):
    r = lambda d: {k: round(v, 3) for k, v in d.items()}
    return dict(mu=round(M["mu"], 4), ha=round(M["ha"], 4), att=r(M["att"]), dfn=r(M["dfn"]), safe=SAFE_MIN, less=LESS_SAFE_MIN, alias=ALIAS)


def build(now, days=7):
    games = _load()
    today = now.date()
    start, end = today - timedelta(days=1), today + timedelta(days=days)
    try:
        games = update(games, today)
    except Exception as exc:
        print(f"[avertissement] historique NHL : {exc}", file=sys.stderr)
    if not games:
        return {}
    os.makedirs(DATA, exist_ok=True)
    with open(GAMES_FILE, "w", encoding="utf-8") as fh:
        json.dump(games, fh, separators=(",", ":"))
    M = fit(games, start)
    if not M:
        return {}
    bt = backtest(games)
    items = []
    for g in _window(start, end):
        when = paris(_iso(g["d"]))
        if not (start <= when.date() <= end):
            continue
        e = lam(M, g["home"], g["away"])
        known = bool(e) and not g["pre"]
        l1, l2 = e if e else (math.exp(M["mu"]), math.exp(M["mu"]))
        F, (ph, pd, pa) = families(g["home"], g["away"], l1, l2)
        safe, less = classify(F) if known else ([], [])
        it = dict(id=g["id"], date=when.date().isoformat(), time=f"{when:%H:%M}", state=g["state"], home=g["home"], away=g["away"], p=[round(ph, 4), round(pd, 4), round(pa, 4)],
                  lh=round(l1, 2), la=round(l2, 2), known=known, pre=g["pre"], safe=safe, less=less)
        if g["state"] == "post" and g["hs"] is not None and g["as_"] is not None:
            rh, ra = _reg(g["hs"], g["as_"], g["period"])
            q = 0.5 * (0.5 + ph / (ph + pa))
            it.update(hs=g["hs"], as_=g["as_"], ot=g["period"] > 3)
            it["hit"] = ((ph + pd * q > 0.5) == (g["hs"] > g["as_"])) if known else None
            if known:
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, g["home"], g["away"], rh, ra, (g["hs"], g["as_"])), t=t)
                               for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    items.sort(key=lambda x: (x["date"], x["time"]))
    return dict(matches=items, bt=bt, model=_model_json(M), generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s;", len(d.get("matches", [])), "matchs")
    print(json.dumps(d.get("bt"), indent=1))
    for m in d.get("matches", [])[:8]:
        print(m["date"], m["time"], m["home"], "-", m["away"], m["p"], m["state"], m.get("hit"), len(m["safe"]), m["pre"])
