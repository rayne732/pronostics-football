"""Baseball (MLB) : points marqués par équipe ~ lois binomiales négatives (attaque / défense par équipe, avantage du terrain,
pondération par la date). Pas de match nul : une égalité à la fin des manches est départagée en prolongation (répartie selon la force
des équipes). Données : API officielle de la MLB (statsapi.mlb.com, gratuite)."""
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta

from basket import _get, _iso
from hockey import fit as _fit
from tennis import paris

DATA = "data"
GAMES_FILE = os.path.join(DATA, "baseball_games.json")
API = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=R,F,D,L,W"
SEASONS = (2024, 2025, 2026)
SAFE_MIN, LESS_SAFE_MIN = 0.716, 0.30       # 0,70 + l'optimisme mesuré par le test (annoncé 75,3 %, réel 73,7 %)
L2 = 100.0
MAXR = 26
BACKTEST_FROM = date(2025, 4, 1)


# ------------------------------------------------------------------ données
def _row(g):
    t = g["teams"]
    if g["status"]["abstractGameState"] != "Final" or t["home"].get("score") is None or t["away"].get("score") is None:
        return None
    hs, as_ = int(t["home"]["score"]), int(t["away"]["score"])
    return [str(g["gamePk"]), g["gameDate"][:16], t["home"]["team"]["name"], t["away"]["team"]["name"], hs, as_, 2 if g["gameType"] == "R" else 3, hs, as_]


def _games(url):
    out = []
    for d in _get(url, 120).get("dates", []):
        out += d["games"]
    return out


def _load():
    try:
        with open(GAMES_FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return []


def update(rows, today):
    """Historique : saisons complètes au premier lancement, puis les jours manquants."""
    have = {g[0]: g for g in rows}
    if not have:
        for season in SEASONS:
            for g in _games(f"{API}&season={season}"):
                r = _row(g)
                if r:
                    have[r[0]] = r
    last = max((g[1][:10] for g in have.values()), default=None)
    if last:
        start = date.fromisoformat(last) - timedelta(days=1)
        if (today - start).days > 0:
            for g in _games(f"{API}&startDate={start.isoformat()}&endDate={today.isoformat()}"):
                r = _row(g)
                if r:
                    have[r[0]] = r
    return sorted(have.values(), key=lambda g: g[1])


# ------------------------------------------------------------------ modèle
def fit(games, asof):
    M = _fit(games, asof, l2=L2)
    if not M:
        return None
    # dispersion : variance des points = moyenne + moyenne² / r (binomiale négative)
    num = den = 0.0
    for g in games[-4000:]:
        if g[2] in M["att"] and g[3] in M["att"]:
            lh = math.exp(M["mu"] + M["ha"] + M["att"][g[2]] - M["dfn"][g[3]])
            la = math.exp(M["mu"] + M["att"][g[3]] - M["dfn"][g[2]])
            num += (g[4] - lh) ** 2 - lh + (g[5] - la) ** 2 - la
            den += lh * lh + la * la
    M["alpha"] = max(num / den, 0.02) if den else 0.2
    return M


def lam(M, home, away):
    if home not in M["att"] or away not in M["att"]:
        return None
    return (math.exp(M["mu"] + M["ha"] + M["att"][home] - M["dfn"][away]), math.exp(M["mu"] + M["att"][away] - M["dfn"][home]))


def pmf(mean, alpha):
    r = 1 / alpha
    p = r / (r + mean)
    a = [0.0] * MAXR
    a[0] = p ** r
    for k in range(1, MAXR):
        a[k] = a[k - 1] * (k - 1 + r) / k * (1 - p)
    return a


def _s(g, f):
    return sum(g[i][j] for i in range(MAXR) for j in range(MAXR) if f(i, j))


def families(M, home, away, lh, la):
    a, b = pmf(lh, M["alpha"]), pmf(la, M["alpha"])
    g = [[a[i] * b[j] for j in range(MAXR)] for i in range(MAXR)]
    ph, pt, pa = _s(g, lambda i, j: i > j), _s(g, lambda i, j: i == j), _s(g, lambda i, j: i < j)
    q = ph / (ph + pa)
    F = [("Vainqueur du match", [[home, ph + pt * q], [away, pa + pt * (1 - q)]], True, False)]
    F.append(("Total points (plus)", [[f"Plus de {x:.1f}".replace(".", ",") + " points", _s(g, lambda i, j, x=x: i + j > x)] for x in (5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5)], False, False))
    F.append(("Total points (moins)", [[f"Moins de {x:.1f}".replace(".", ",") + " points", _s(g, lambda i, j, x=x: i + j < x)] for x in (6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5)], False, False))
    for team, idx in ((home, 0), (away, 1)):
        F.append((f"Points de {team} (plus)", [[f"{team} plus de {x:.1f}".replace(".", ","), _s(g, lambda i, j, x=x, idx=idx: (i, j)[idx] > x)] for x in (1.5, 2.5, 3.5, 4.5, 5.5)], False, False))
        F.append((f"Points de {team} (moins)", [[f"{team} moins de {x:.1f}".replace(".", ","), _s(g, lambda i, j, x=x, idx=idx: (i, j)[idx] < x)] for x in (2.5, 3.5, 4.5, 5.5, 6.5)], False, False))
    F.append(("Handicap -1,5", [[home + " -1,5", _s(g, lambda i, j: i - j >= 2)], [away + " +1,5", _s(g, lambda i, j: i - j < 2)]], False, False))
    F.append(("Handicap +1,5", [[away + " -1,5", _s(g, lambda i, j: j - i >= 2)], [home + " +1,5", _s(g, lambda i, j: j - i < 2)]], False, False))
    return F, ph + pt * q


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
    s, m = rec["s"], rec["m"]
    if m == "Vainqueur du match":
        return s == (home if hs > as_ else away)
    if m.startswith("Total points"):
        ln = float(s.split(" ")[-2].replace(",", "."))
        return (hs + as_ > ln) if s.startswith("Plus") else (hs + as_ < ln)
    if m.startswith("Points de"):
        team = m[len("Points de "):m.rindex(" (")]
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
        F, pw = families(M, g[2], g[3], *e)
        recs.append((pw, g[4] > g[5]))
        safe, _ = classify(F)
        picks += [(r["p"], won(r, g[2], g[3], g[4], g[5])) for r in safe]
    if not recs:
        return {}
    n = len(recs)
    out = dict(n=n, ll=sum(-math.log(min(max(p if w else 1 - p, 1e-6), 1 - 1e-6)) for p, w in recs) / n, acc=sum((p > 0.5) == w for p, w in recs) / n, n_safe=len(picks), said=sum(p for p, _ in picks) / max(len(picks), 1),
               real=sum(w for _, w in picks) / max(len(picks), 1), since=BACKTEST_FROM.isoformat(), until=rows[-1][1][:10])
    bins = []
    for lo, hi in ((0.5, 0.55), (0.55, 0.6), (0.6, 0.65), (0.65, 1.01)):
        sel = [(max(p, 1 - p), (p > 0.5) == w) for p, w in recs if lo <= max(p, 1 - p) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ assemblage
def _model_json(M):
    r = lambda d: {k: round(v, 3) for k, v in d.items()}
    return dict(mu=round(M["mu"], 4), ha=round(M["ha"], 4), alpha=round(M["alpha"], 4), att=r(M["att"]), dfn=r(M["dfn"]), safe=SAFE_MIN, less=LESS_SAFE_MIN)


def build(now, days=5):
    games = _load()
    today = now.date()
    start, end = today - timedelta(days=1), today + timedelta(days=days)
    try:
        games = update(games, today)
    except Exception as exc:
        print(f"[avertissement] historique MLB : {exc}", file=sys.stderr)
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
    try:
        window = _games(f"{API}&startDate={(start - timedelta(days=1)).isoformat()}&endDate={(end + timedelta(days=1)).isoformat()}")
    except Exception as exc:
        print(f"[avertissement] calendrier MLB : {exc}", file=sys.stderr)
        window = []
    for g in window:
        when = paris(_iso(g["gameDate"]))
        if not (start <= when.date() <= end):
            continue
        t = g["teams"]
        home, away = t["home"]["team"]["name"], t["away"]["team"]["name"]
        e = lam(M, home, away)
        known = bool(e)
        l1, l2 = e if e else (math.exp(M["mu"]), math.exp(M["mu"]))
        F, pw = families(M, home, away, l1, l2)
        safe, less = classify(F) if known else ([], [])
        ab = g["status"]["abstractGameState"]
        it = dict(id=str(g["gamePk"]), date=when.date().isoformat(), time=f"{when:%H:%M}", state="post" if ab == "Final" else "in" if ab == "Live" else "pre", home=home, away=away,
                  p=round(pw, 4), lh=round(l1, 2), la=round(l2, 2), known=known, label={"R": "Saison régulière", "F": "Wild Card", "D": "Division Series", "L": "Championship Series", "W": "World Series"}.get(g["gameType"], ""),
                  safe=safe, less=less)
        if it["state"] == "post" and t["home"].get("score") is not None:
            hs, as_ = int(t["home"]["score"]), int(t["away"]["score"])
            it.update(hs=hs, as_=as_, hit=((pw > 0.5) == (hs > as_)) if known else None)
            if known:
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, home, away, hs, as_), t=tt) for tt, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    items.sort(key=lambda x: (x["date"], x["time"]))
    return dict(matches=items, bt=bt, model=_model_json(M), generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s;", len(d.get("matches", [])), "matchs; alpha", d.get("model", {}).get("alpha"))
    print(json.dumps(d.get("bt"), indent=1))
    for m in d.get("matches", [])[:10]:
        print(m["date"], m["time"], m["home"], "-", m["away"], m["p"], m["state"], m.get("hit"), len(m["safe"]), m["label"])
