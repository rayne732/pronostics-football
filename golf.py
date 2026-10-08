"""Golf (PGA Tour, DP World Tour, LPGA) : niveau de chaque joueur = coups gagnés par tour sur le reste du plateau (moyenne pondérée par la
date, ramenée vers 0 quand on a peu de tours), tours simulés avec un écart-type commun. Les probabilités (victoire, top 5, top 10, top 20,
passe le cut) viennent de 20 000 tournois simulés, à partir du score actuel quand le tournoi est en cours.
Données : scoreboard ESPN (une requête par an et par circuit pour l'historique, puis une par semaine)."""
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta

import numpy as np

from basket import _get

DATA = "data"
FILE = os.path.join(DATA, "golf_rounds.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/golf/{tour}/scoreboard"
TOURS = {"pga": "PGA Tour", "eur": "DP World Tour", "lpga": "LPGA"}
FIRST_YEAR = 2024
HALF_LIFE = 365.0
K0 = 10.0                         # tours « virtuels » à 0 : plus il est grand, plus on ramène un joueur peu vu vers la moyenne
SIMS = 20000
CUT_RANK = 65
SAFE_MIN, LESS_SAFE_MIN = 0.70, 0.30
BACKTEST_FROM = date(2025, 1, 1)
MARKETS = (("win", "Vainqueur du tournoi"), ("top5", "Top 5"), ("top10", "Top 10"), ("top20", "Top 20"), ("cut", "Passe le cut"))


# ------------------------------------------------------------------ données
def _flag(c):
    """Drapeau ESPN d'un compétiteur (chemin court « countries/500/usa.png »), None s'il manque."""
    h = ((c.get("athlete") or {}).get("flag") or {}).get("href") or ""
    return h.split("/i/teamlogos/", 1)[1] if "/i/teamlogos/" in h else None


def _rounds(comp, done=False):
    """Scores (coups) des tours complets d'un joueur. Tournoi en cours : 18 trous saisis ; tournoi terminé : un score de tour plausible suffit
    (certains circuits ne détaillent pas les trous)."""
    out = []
    for ls in sorted(comp.get("linescores") or [], key=lambda x: x.get("period", 0)):
        v = ls.get("value")
        holes = ls.get("linescores") or []
        if v and (len(holes) >= 18 or (done and 50 <= v <= 100 and not holes)):
            out.append(int(v))
        else:
            break
    return out


def _event_row(ev):
    comp = ev["competitions"][0]
    players = []
    for c in comp.get("competitors", []):
        if "athlete" not in c:
            continue
        r = _rounds(c, True)
        if r:
            players.append([c["athlete"]["displayName"]] + r)
    return [str(ev["id"]), ev["name"], ev["date"][:10], players]


def _load():
    try:
        with open(FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def update(cache, today):
    """Historique des tournois terminés : années complètes au premier lancement, puis les semaines manquantes."""
    for tour in TOURS:
        have = {e[0]: e for e in cache.get(tour, [])}
        if not have:
            for y in range(FIRST_YEAR, today.year + 1):
                try:
                    d = _get(ESPN.format(tour=tour) + f"?dates={y}&limit=200", 180)
                except Exception as exc:
                    print(f"[avertissement] ESPN golf {tour} {y} : {exc}", file=sys.stderr)
                    continue
                for ev in d.get("events", []):
                    if (ev.get("status") or {}).get("type", {}).get("completed"):
                        r = _event_row(ev)
                        if r[3]:
                            have[r[0]] = r
        else:
            last = max(date.fromisoformat(e[2]) for e in have.values())
            day = last
            while day <= today:
                try:
                    d = _get(ESPN.format(tour=tour) + f"?dates={day:%Y%m%d}", 60)
                except Exception as exc:
                    print(f"[avertissement] ESPN golf {tour} {day} : {exc}", file=sys.stderr)
                    break
                for ev in d.get("events", []):
                    if (ev.get("status") or {}).get("type", {}).get("completed") and str(ev["id"]) not in have:
                        r = _event_row(ev)
                        if r[3]:
                            have[r[0]] = r
                day += timedelta(days=7)
        cache[tour] = sorted(have.values(), key=lambda e: e[2])
    return cache


# ------------------------------------------------------------------ niveau des joueurs
def skills(events, asof):
    """{joueur: niveau} en coups gagnés par tour ; et écart-type d'un tour. events : tournois (début avant asof)."""
    acc = {}                                              # joueur -> [somme pondérée, poids]
    resid = []
    for _, _, d0, players in events:
        age0 = (asof - date.fromisoformat(d0)).days
        if age0 <= 0:
            continue
        maxr = max(len(p) - 1 for p in players)
        for r in range(1, maxr + 1):
            vals = [p[r] for p in players if len(p) > r]
            if len(vals) < 20:
                continue
            m = sum(vals) / len(vals)
            w = math.exp(-math.log(2) * (age0 - (maxr - r)) / HALF_LIFE)
            for p in players:
                if len(p) > r:
                    a = acc.setdefault(p[0], [0.0, 0.0])
                    a[0] += w * (m - p[r])
                    a[1] += w
    return {k: v[0] / (v[1] + K0) for k, v in acc.items()}, {k: v[1] for k, v in acc.items()}


def round_sd(events, sk):
    res = []
    for _, _, d0, players in events[-60:]:
        maxr = max(len(p) - 1 for p in players)
        for r in range(1, maxr + 1):
            vals = [p[r] for p in players if len(p) > r]
            if len(vals) < 20:
                continue
            m = sum(vals) / len(vals)
            for p in players:
                if len(p) > r and p[0] in sk:
                    res.append(m - p[r] - sk[p[0]])
    return float(np.std(res)) if res else 2.9


# ------------------------------------------------------------------ simulation
def simulate(field, sk, sd, rounds_total=4, seed=7):
    """field : [dict(n, cur (score actuel par rapport au par), k (tours terminés), h (trous du tour en cours), cut (déjà éliminé))] -> probabilités."""
    rng = np.random.default_rng(seed)
    n = len(field)
    cur = np.array([f["cur"] for f in field], float)
    done = np.array([f["k"] + f["h"] / 18 for f in field], float)
    skill = np.array([sk.get(f["n"], 0.0) for f in field])
    cut0 = np.array([f["cut"] for f in field], bool)
    rem1 = np.maximum(0, 2 - done)                          # tours restant jusqu'au cut
    rem2 = np.maximum(0, rounds_total - np.maximum(done, 2))
    def play(frac):
        return -(skill * frac) + rng.normal(size=(SIMS, n)) * sd * np.sqrt(np.maximum(frac, 1e-9)) * (frac > 0)
    t1 = cur[None, :] + play(rem1[None, :])
    t1 = np.where(cut0[None, :], np.inf, t1)
    # le cut se joue sur ceux qui n'ont pas déjà été éliminés ; si le cut est déjà passé (done > 2), on garde les non-éliminés
    known_cut_passed = bool((done > 2).any())
    if known_cut_passed:
        cutmask = cut0[None, :].repeat(SIMS, 0)
    else:
        srt = np.sort(t1, axis=1)
        line = srt[:, min(CUT_RANK, n) - 1][:, None]
        cutmask = t1 > line
    t2 = t1 + play(rem2[None, :])
    t2 = np.where(cutmask, np.inf, t2)
    t2 = t2 + rng.random(size=t2.shape) * 1e-6              # départage au hasard
    pos = np.argsort(np.argsort(t2, axis=1), axis=1) + 1
    alive = ~cutmask
    return dict(win=((pos == 1) & alive).mean(0), top5=((pos <= 5) & alive).mean(0), top10=((pos <= 10) & alive).mean(0), top20=((pos <= 20) & alive).mean(0),
                cut=alive.mean(0))


def _pre_field(players):
    return [dict(n=p[0], cur=0.0, k=0, h=0, cut=False) for p in players]


# ------------------------------------------------------------------ backtest
def backtest(cache):
    obs = {k: [] for k, _ in MARKETS}
    n_events = 0
    for tour in TOURS:
        evs = cache.get(tour, [])
        for i, ev in enumerate(evs):
            d0 = date.fromisoformat(ev[2])
            if d0 < BACKTEST_FROM or len(ev[3]) < 40:
                continue
            sk, _ = skills([e for e in evs[:i]], d0)
            sd = round_sd(evs[max(0, i - 60):i], sk) if i else 2.9
            field = _pre_field(ev[3])
            pr = simulate(field, sk, sd, seed=i)
            # classement final réel : total des tours ; les éliminés (2 tours) derrière
            totals = {p[0]: (sum(p[1:]), len(p) - 1) for p in ev[3]}
            full = [k for k in totals if totals[k][1] >= 4]
            order = sorted(full, key=lambda k: totals[k][0])
            rank = {k: j + 1 for j, k in enumerate(order)}
            for idx, p in enumerate(ev[3]):
                name = p[0]
                made = totals[name][1] >= 3
                r = rank.get(name, 999)
                obs["win"].append((pr["win"][idx], r == 1))
                obs["top5"].append((pr["top5"][idx], r <= 5))
                obs["top10"].append((pr["top10"][idx], r <= 10))
                obs["top20"].append((pr["top20"][idx], r <= 20))
                obs["cut"].append((pr["cut"][idx], made))
            n_events += 1
    out = dict(events=n_events, since=BACKTEST_FROM.isoformat(), markets={})
    for k, lst in obs.items():
        a = np.array([x[0] for x in lst])
        w = np.array([x[1] for x in lst], float)
        bins = []
        for lo, hi in ((0.02, 0.1), (0.1, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 1.01)):
            m = (a >= lo) & (a < hi)
            if m.sum() >= 10:
                bins.append(dict(lo=lo, hi=min(hi, 1), n=int(m.sum()), said=float(a[m].mean()), real=float(w[m].mean())))
        sure = a >= SAFE_MIN
        out["markets"][k] = dict(n_safe=int(sure.sum()), said=float(a[sure].mean()) if sure.any() else None, real=float(w[sure].mean()) if sure.any() else None, bins=bins)
    return out


# ------------------------------------------------------------------ assemblage
def _score(s):
    s = (s or "E").strip()
    if s in ("E", "-", ""):
        return 0.0
    try:
        return float(s.replace("+", ""))
    except ValueError:
        return 0.0


def _current(ev):
    """Tournoi en cours ou à venir -> (nom, état, période, liste de joueurs avec score actuel)."""
    comp = ev["competitions"][0]
    state = ev["status"]["type"]["state"]
    period = (comp.get("status") or {}).get("period", 0)
    players = []
    for c in comp.get("competitors", []):
        if "athlete" not in c:
            continue
        lines = sorted(c.get("linescores") or [], key=lambda x: x.get("period", 0))
        k = h = 0
        for ls in lines:
            holes = ls.get("linescores") or []
            if len(holes) >= 18:
                k += 1
            elif holes:
                h = len(holes)
        players.append(dict(n=c["athlete"]["displayName"], cur=_score(c.get("score")), k=k, h=h, cut=False, pos=c.get("order", 999), fl=_flag(c)))
    if state != "pre" and period >= 3:
        for p in players:
            if p["k"] <= 2 and p["h"] == 0 and period >= 3 and p["k"] < period - 1:
                p["cut"] = True
    return ev["name"], state, period, players


def build(now):
    today = now.date()
    cache = _load()
    try:
        cache = update(cache, today)
    except Exception as exc:
        print(f"[avertissement] historique golf : {exc}", file=sys.stderr)
    if not any(cache.get(t) for t in TOURS):
        return {}
    os.makedirs(DATA, exist_ok=True)
    with open(FILE, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, separators=(",", ":"))
    bt_path = os.path.join(DATA, "golf_backtest.json")
    try:
        with open(bt_path, encoding="utf-8") as fh:
            saved = json.load(fh)
    except (OSError, ValueError):
        saved = {}
    key = "|".join(str(len(cache.get(t, []))) for t in TOURS)
    if saved.get("key") != key:
        saved = dict(key=key, bt=backtest(cache))
        with open(bt_path, "w", encoding="utf-8") as fh:
            json.dump(saved, fh)
    out = dict(generated=f"{now:%d/%m/%Y à %H:%M}", bt=saved["bt"], events=[], last=[])
    for tour, label in TOURS.items():
        evs = cache.get(tour, [])
        sk, _ = skills(evs, today)
        sd = round_sd(evs, sk) if evs else 2.9
        try:
            d = _get(ESPN.format(tour=tour), 60)
        except Exception as exc:
            print(f"[avertissement] ESPN golf {tour} : {exc}", file=sys.stderr)
            continue
        for ev in d.get("events", []):
            if (ev.get("status") or {}).get("type", {}).get("completed") or "status" not in ev:
                continue
            name, state, period, players = _current(ev)
            if len(players) < 20:
                continue
            pr = simulate(players, sk, sd)
            rows = []
            for i, p in enumerate(players):
                rows.append(dict(n=p["n"], cur=p["cur"], k=p["k"], h=p["h"], out=p["cut"], fl=p.get("fl"), known=p["n"] in sk,
                                 **{m: round(float(pr[m][i]), 4) for m, _ in MARKETS}))
            rows.sort(key=lambda r: -r["win"])
            out["events"].append(dict(tour=label, id=str(ev["id"]), name=name, state=state, round=period, start=ev["date"][:10], end=(ev.get("endDate") or ev["date"])[:10],
                                      cut_known=any(r["out"] for r in rows), players=rows, n=len(rows)))
        # dernier tournoi terminé : notre pronostic d'avant tournoi
        if evs:
            i = len(evs) - 1
            ev = evs[i]
            d0 = date.fromisoformat(ev[2])
            sk0, _ = skills(evs[:i], d0)
            sd0 = round_sd(evs[max(0, i - 60):i], sk0) if i else 2.9
            pr0 = simulate(_pre_field(ev[3]), sk0, sd0)
            totals = {p[0]: (sum(p[1:]), len(p) - 1) for p in ev[3]}
            full = sorted([k for k in totals if totals[k][1] >= 4], key=lambda k: totals[k][0])
            res = []
            idx = {p[0]: j for j, p in enumerate(ev[3])}
            for r, name in enumerate(full[:10]):
                j = idx[name]
                res.append(dict(pos=r + 1, n=name, win=round(float(pr0["win"][j]), 4), top10=round(float(pr0["top10"][j]), 4)))
            top10_pred = sorted(range(len(ev[3])), key=lambda j: -pr0["top10"][j])[:10]
            hits = len({ev[3][j][0] for j in top10_pred} & set(full[:10]))
            if res:
                out["last"].append(dict(tour=label, name=ev[1], date=ev[2], results=res, top10_hits=hits))
    return out


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s")
    bt = d.get("bt", {})
    print("tournois testés", bt.get("events"))
    for k, v in (bt.get("markets") or {}).items():
        print(k, v["n_safe"], v["said"] and round(v["said"], 3), v["real"] and round(v["real"], 3), [(b["lo"], b["n"], round(b["said"], 3), round(b["real"], 3)) for b in v["bins"]])
    for e in d.get("events", []):
        print(e["tour"], e["name"], e["state"], "tour", e["round"], e["n"], "joueurs")
        for p in e["players"][:5]:
            print("   ", p["n"], p["cur"], p["win"], p["top5"], p["top10"], p["top20"], p["cut"])
    for l in d.get("last", []):
        print("dernier", l["tour"], l["name"], l["date"], l["top10_hits"], l["results"][:2])
