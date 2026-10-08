"""MMA (UFC) : notes Elo des combattants (K décroissant avec le nombre de combats), fréquences de fin de combat par round selon
l'écart de niveau et le nombre de rounds. Marchés : vainqueur, va à la décision, plus / moins de rounds, méthode de victoire.
Données : scoreboard ESPN (une requête par année pour l'historique, une par jour pour le calendrier)."""
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta

from basket import _get, _iso
from tennis import paris

DATA = "data"
FILE = os.path.join(DATA, "mma_fights.json")
ESPN = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard"
FIRST_YEAR = 2022
K0, KEXP = 70.0, 0.4
SAFE_MIN, LESS_SAFE_MIN = 0.715, 0.30       # 0,70 + l'optimisme mesuré par le test (annoncé 74,8 %, réel 73,3 %)
BACKTEST_FROM = date(2025, 1, 1)
MIN_FIGHTS = 2                  # en dessous, le combattant est « peu connu » : pas de pronostic sûr


# ------------------------------------------------------------------ données
def _flag(c):
    """Drapeau ESPN d'un compétiteur (chemin court « countries/500/usa.png »), None s'il manque."""
    h = ((c.get("athlete") or {}).get("flag") or {}).get("href") or ""
    return h.split("/i/teamlogos/", 1)[1] if "/i/teamlogos/" in h else None


def _fight(ev, c, idx, n):
    """Combat -> [id, date UTC, A, B, vainqueur (0 / 1 / -1 = nul ou sans résultat), round de fin, rounds prévus, décision (0/1), catégorie, événement, ordre]"""
    cs = sorted(c["competitors"], key=lambda x: x.get("order", 0))
    if len(cs) != 2:
        return None
    st = c["status"]
    rounds = (c.get("format") or {}).get("regulation", {}).get("periods", 3)
    win = next((i for i, x in enumerate(cs) if x.get("winner")), -1)
    period, clock = st.get("period", 0), st.get("clock", 0)
    dec = 1 if (period >= rounds and clock >= 299) or any(x.get("linescores") for x in cs) else 0
    return [str(c["id"]), c["date"][:16], cs[0]["athlete"]["displayName"], cs[1]["athlete"]["displayName"], win, period, rounds, dec,
            (c.get("type") or {}).get("abbreviation", ""), ev["name"], idx]


def _load():
    try:
        with open(FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return []


def update(rows, today):
    have = {g[0]: g for g in rows}
    years = range(FIRST_YEAR, today.year + 1) if not have else (today.year,)
    for y in years:
        try:
            d = _get(f"{ESPN}?dates={y}&limit=500", 90)
        except Exception as exc:
            print(f"[avertissement] ESPN UFC {y} : {exc}", file=sys.stderr)
            continue
        for ev in d.get("events", []):
            comps = ev.get("competitions", [])
            for i, c in enumerate(comps):
                if c["status"]["type"]["completed"]:
                    r = _fight(ev, c, i, len(comps))
                    if r and r[4] >= 0:
                        have[r[0]] = r
    return sorted(have.values(), key=lambda g: g[1])


# ------------------------------------------------------------------ modèle
class Elo:
    def __init__(self):
        self.r, self.n = {}, {}

    def p(self, a, b):
        return 1 / (1 + 10 ** ((self.r.get(b, 1500.0) - self.r.get(a, 1500.0)) / 400))

    def update(self, w, l):
        p = self.p(w, l)
        for who, sign in ((w, 1), (l, -1)):
            k = K0 / (self.n.get(who, 0) + 3) ** KEXP
            self.r[who] = self.r.get(who, 1500.0) + sign * k * (1 - p)
            self.n[who] = self.n.get(who, 0) + 1


def train(fights, before=None, collect=False):
    e, recs = Elo(), []
    for g in fights:
        if before and g[1][:10] >= before.isoformat():
            break
        if collect and g[1][:10] >= BACKTEST_FROM.isoformat():
            recs.append((g, e.p(g[2], g[3]), e.n.get(g[2], 0) >= MIN_FIGHTS and e.n.get(g[3], 0) >= MIN_FIGHTS))
        if g[4] in (0, 1):
            w, l = (g[2], g[3]) if g[4] == 0 else (g[3], g[2])
            e.update(w, l)
    return (e, recs) if collect else e


def closeness(p):
    c = abs(p - 0.5)
    return 0 if c < 0.1 else 1 if c < 0.22 else 2


def rate_table(fights, before=None):
    """Fréquences d'arrêt par round, pour chaque (rounds prévus, écart de niveau) ; lissées vers la fréquence globale du même format."""
    e = Elo()
    cnt = {}
    for g in fights:
        if before and g[1][:10] >= before.isoformat():
            break
        if g[4] in (0, 1):
            p = e.p(g[2], g[3])
            key = (g[6], closeness(p))
            cell = cnt.setdefault(key, [0] * 7)           # R1..R5 (arrêts), décision, total
            cell[6] += 1
            if g[7]:
                cell[5] += 1
            else:
                cell[min(max(g[5], 1), 5) - 1] += 1
            w, l = (g[2], g[3]) if g[4] == 0 else (g[3], g[2])
            e.update(w, l)
    out = {}
    for rounds in (3, 5):
        tot = [0] * 7
        for (r, c), cell in cnt.items():
            if r == rounds:
                tot = [a + b for a, b in zip(tot, cell)]
        base = [(tot[i] + 1) / (tot[6] + 6) for i in range(6)]
        for c in range(3):
            cell = cnt.get((rounds, c), [0] * 7)
            out[f"{rounds}|{c}"] = [round((cell[i] + 12 * base[i]) / (cell[6] + 12), 4) for i in range(6)]
    return out


def outcome_probs(rates, rounds, p):
    r = rates[f"{5 if rounds >= 5 else 3}|{closeness(p)}"]
    return r                                              # [R1, R2, R3, R4, R5, décision]


def families(a, b, p, rounds, rates):
    r = rates[f"{5 if rounds >= 5 else 3}|{closeness(p)}"]
    # un combat de 3 rounds n'a pas de R4 / R5
    if rounds < 5:
        r = r[:3] + [0.0, 0.0] + [r[5]]
        s = sum(r)
        r = [x / s for x in r]
    dec = r[5]
    F = [("Vainqueur du combat", [[a, p], [b, 1 - p]], True, False),
         ("Le combat va à la décision", [["Oui", dec], ["Non", 1 - dec]], False, False),
         ("Plus / moins de 1,5 round", [["Plus de 1,5 round", 1 - r[0]], ["Moins de 1,5 round", r[0]]], False, False)]
    if rounds >= 3:
        F.append(("Plus / moins de 2,5 rounds", [["Plus de 2,5 rounds", 1 - r[0] - r[1]], ["Moins de 2,5 rounds", r[0] + r[1]]], False, False))
    F.append(("Méthode de victoire", [[a + " par décision", p * dec], [a + " par arrêt", p * (1 - dec)], [b + " par décision", (1 - p) * dec], [b + " par arrêt", (1 - p) * (1 - dec)]], False, True))
    return F


def classify(F):
    safe, less = [], []
    for name, sels, validated, lottery in F:
        items = sorted(sels, key=lambda s: -s[1])
        rec = lambda it: dict(m=name, s=it[0], p=round(it[1], 4), v=True, sels=[[s[0], round(s[1], 4)] for s in sels])
        if lottery:
            less.append(rec(items[0]))
            continue
        ok = [s for s in items if s[1] >= SAFE_MIN]
        if ok:
            safe.append(rec(min(ok, key=lambda s: s[1])))
        elif items[0][1] >= LESS_SAFE_MIN:
            less.append(rec(items[0]))
    key = lambda r: -r["p"]
    return sorted(safe, key=key), sorted(less, key=key)


def won(rec, a, b, win, period, dec):
    """win : 0 / 1 ; period : round de fin ; dec : décision (1) ou arrêt (0)."""
    s, m = rec["s"], rec["m"]
    if m == "Vainqueur du combat":
        return s == (a if win == 0 else b)
    if m == "Le combat va à la décision":
        return (s == "Oui") == bool(dec)
    if m.startswith("Plus / moins de 1,5"):
        over = bool(dec) or period > 1
        return over if s.startswith("Plus") else not over
    if m.startswith("Plus / moins de 2,5"):
        over = bool(dec) or period > 2
        return over if s.startswith("Plus") else not over
    who = a if win == 0 else b
    return s == f"{who} par " + ("décision" if dec else "arrêt")


# ------------------------------------------------------------------ backtest
def backtest(fights):
    rows = [g for g in fights if g[1][:10] >= BACKTEST_FROM.isoformat()]
    if not rows:
        return {}
    e = train(fights, before=BACKTEST_FROM)
    rates = rate_table(fights, before=BACKTEST_FROM)
    recs, picks, last_month = [], [], None
    for g in rows:
        d = date.fromisoformat(g[1][:10])
        if (d.year, d.month) != last_month:
            last_month = (d.year, d.month)
            rates = rate_table(fights, before=d)
        known = e.n.get(g[2], 0) >= MIN_FIGHTS and e.n.get(g[3], 0) >= MIN_FIGHTS
        p = e.p(g[2], g[3])
        if known and g[4] in (0, 1):
            recs.append((p, g[4] == 0))
            safe, _ = classify(families(g[2], g[3], p, g[6], rates))
            picks += [(r["p"], won(r, g[2], g[3], g[4], g[5], g[7])) for r in safe]
        if g[4] in (0, 1):
            w, l = (g[2], g[3]) if g[4] == 0 else (g[3], g[2])
            e.update(w, l)
    if not recs:
        return {}
    n = len(recs)
    out = dict(n=n, acc=sum((p > 0.5) == w for p, w in recs) / n, n_safe=len(picks), said=sum(p for p, _ in picks) / max(len(picks), 1),
               real=sum(w for _, w in picks) / max(len(picks), 1), since=BACKTEST_FROM.isoformat(), until=rows[-1][1][:10])
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
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
            d = _get(f"{ESPN}?dates={day:%Y%m%d}", 30)
        except Exception as exc:
            print(f"[avertissement] ESPN UFC {day} : {exc}", file=sys.stderr)
            return out
        for ev in d.get("events", []):
            comps = ev.get("competitions", [])
            for i, c in enumerate(comps):
                cs = sorted(c.get("competitors", []), key=lambda x: x.get("order", 0))
                if len(cs) != 2 or any("athlete" not in x for x in cs):
                    continue
                rec = lambda x: ((x.get("records") or [{}])[0].get("summary") or "")
                if "TBA" in cs[0]["athlete"]["displayName"].upper() + cs[1]["athlete"]["displayName"].upper():
                    continue
                out.append(dict(id=str(c["id"]), d=c["date"][:16], a=cs[0]["athlete"]["displayName"], b=cs[1]["athlete"]["displayName"], state=c["status"]["type"]["state"],
                                win=next((k for k, x in enumerate(cs) if x.get("winner")), -1), period=c["status"].get("period", 0), clock=c["status"].get("clock", 0),
                                rounds=(c.get("format") or {}).get("regulation", {}).get("periods", 3), dec=any(x.get("linescores") for x in cs), cls=(c.get("type") or {}).get("abbreviation", ""),
                                ev=ev["name"], ord=i, n=len(comps), ra=rec(cs[0]), rb=rec(cs[1]), fa=_flag(cs[0]), fb=_flag(cs[1])))
        day += timedelta(days=1)
    return out


def _rec_rating(s):
    try:
        w, l = [int(x) for x in s.split("-")[:2]]
    except (ValueError, AttributeError):
        return 1500.0
    return 1500 + 250 * (w - l) / (w + l + 4)


def build(now, days=5):
    fights = _load()
    today = now.date()
    start, end = today - timedelta(days=1), today + timedelta(days=days)
    try:
        fights = update(fights, today)
    except Exception as exc:
        print(f"[avertissement] historique UFC : {exc}", file=sys.stderr)
    if not fights:
        return {}
    os.makedirs(DATA, exist_ok=True)
    with open(FILE, "w", encoding="utf-8") as fh:
        json.dump(fights, fh, separators=(",", ":"))
    e = train(fights, before=start)
    rates = rate_table(fights, before=start)
    bt = backtest(fights)
    items = []
    for g in _window(start, end):
        when = paris(_iso(g["d"]))
        if not (start <= when.date() <= end):
            continue
        known = e.n.get(g["a"], 0) >= MIN_FIGHTS and e.n.get(g["b"], 0) >= MIN_FIGHTS
        ra = e.r.get(g["a"]) if g["a"] in e.r else _rec_rating(g["ra"])
        rb = e.r.get(g["b"]) if g["b"] in e.r else _rec_rating(g["rb"])
        p = 1 / (1 + 10 ** ((rb - ra) / 400))
        if not known:
            p = 0.5 + (p - 0.5) * 0.5
        F = families(g["a"], g["b"], p, g["rounds"], rates)
        safe, less = classify(F) if known else ([], [])
        it = dict(id=g["id"], date=when.date().isoformat(), time=f"{when:%H:%M}", state=g["state"], home=g["a"], away=g["b"], hl=g.get("fa"), al=g.get("fb"), p=round(p, 4), known=known,
                  label=f'{g["cls"]} · {"carte principale" if g["ord"] >= g["n"] - 5 else "préliminaires"} · {g["rounds"]} rounds' if g["cls"] else "", ev=g["ev"], ord=g["ord"],
                  rounds=g["rounds"], rec=[g["ra"], g["rb"]], safe=safe, less=less)
        if g["state"] == "post" and g["win"] >= 0:
            dec = 1 if (g["period"] >= g["rounds"] and g["clock"] >= 299) or g["dec"] else 0
            who = g["a"] if g["win"] == 0 else g["b"]
            it["res"] = f'{who} · ' + ("décision" if dec else f'arrêt, round {g["period"]}')
            it["hit"] = ((p > 0.5) == (g["win"] == 0)) if known else None
            if known:
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, g["a"], g["b"], g["win"], g["period"], dec), t=t) for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    items.sort(key=lambda x: (x["date"], x["ev"], -x["ord"]))
    model = dict(r={k: round(v, 1) for k, v in e.r.items() if e.n.get(k, 0) >= 1}, n={k: v for k, v in e.n.items() if v >= 1}, rates=rates, safe=SAFE_MIN, less=LESS_SAFE_MIN, min=MIN_FIGHTS)
    return dict(matches=items, bt=bt, model=model, generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s;", len(d.get("matches", [])), "combats")
    b = d.get("bt", {})
    print({k: round(v, 3) if isinstance(v, float) else v for k, v in b.items() if k != "bins"}, [(x["lo"], x["n"], round(x["said"], 3), round(x["real"], 3)) for x in b.get("bins", [])])
    for m in d.get("matches", [])[:14]:
        print(m["date"], m["home"], "-", m["away"], m["p"], m["known"], m["label"], len(m["safe"]), m.get("hit"))
