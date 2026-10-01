"""Volley-ball : notes Elo par championnat (avantage du terrain compris) ; les probabilités de score en sets viennent du même modèle que le
tennis (match au meilleur des 5 sets). Données : API-Sports volley-ball (offre gratuite : saisons 2022-2024 pour l'historique, hier à demain
pour le calendrier) ; les notes datent donc de la fin de la dernière saison disponible."""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta

from tennis import _won, classify, families, paris

DATA = "data"
FILE = os.path.join(DATA, "volley_games.json")
CACHE_FILE = os.path.join(DATA, "volley_window.json")
BASE = "https://v1.volleyball.api-sports.io/"
SEASONS = (2022, 2023, 2024)
PRIORITY = (63, 65, 97, 113, 120, 25, 24, 66, 89, 252, 253, 248, 251, 246, 247)       # championnats les plus suivis, historiés en premier
H_ADV = 45.0                       # points Elo d'avantage du terrain
K0, KEXP = 60.0, 0.3
PAUSE = 6.6
MAX_AGE = 3600
MAX_HISTORY_CALLS = 30             # requêtes d'historique par exécution (quota gratuit : 100 par jour)
FINISHED = ("FT", "AOT")
LIVE = ("S1", "S2", "S3", "S4", "S5", "LIVE")
MIN_GAMES = 3


def _key():
    return os.environ.get("API_FOOTBALL_KEY")


def _call(path):
    import urllib.request
    req = urllib.request.Request(BASE + path, headers={"x-apisports-key": _key()})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.load(resp)


def _load(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _row(g):
    sc = g["scores"]
    return [f'V{g["id"]}', g["date"][:16], g["teams"]["home"]["name"], g["teams"]["away"]["name"], sc["home"], sc["away"]]


def window(today):
    """Matchs d'hier, d'aujourd'hui et de demain (limite de l'offre gratuite)."""
    c = _load(CACHE_FILE)
    if c.get("day") == today.isoformat() and time.time() - c.get("t", 0) < MAX_AGE:
        return c["games"]
    out = []
    for off in (-1, 0, 1):
        day = today + timedelta(days=off)
        try:
            d = _call(f"games?date={day.isoformat()}")
        except Exception as exc:
            print(f"[avertissement] volley {day} : {exc}", file=sys.stderr)
            return c.get("games", [])
        if d.get("errors") and not isinstance(d["errors"], list):
            print(f"[avertissement] volley {day} : {d['errors']}", file=sys.stderr)
            return c.get("games", [])
        for g in d.get("response", []):
            if "Friendly" in g["league"]["name"]:
                continue
            out.append(dict(lg=g["league"]["id"], ln=g["league"]["name"], cty=g["country"]["name"], id=f'V{g["id"]}', d=g["date"][:16], home=g["teams"]["home"]["name"],
                            away=g["teams"]["away"]["name"], short=g["status"]["short"], hs=g["scores"]["home"], as_=g["scores"]["away"]))
        time.sleep(PAUSE if off < 1 else 0)
    with open(CACHE_FILE, "w", encoding="utf-8") as fh:
        json.dump(dict(day=today.isoformat(), t=time.time(), games=out), fh, ensure_ascii=False)
    return out


def history(cache, wanted):
    """Matchs terminés des saisons 2022-2024 des championnats demandés (un appel par championnat et saison, une seule fois)."""
    done = set(cache.get("_done", []))
    calls = 0
    order = [i for i in PRIORITY if i in wanted] + [i for i in wanted if i not in PRIORITY]
    for lid in order:
        if lid in done:
            continue
        if calls + len(SEASONS) > MAX_HISTORY_CALLS:
            break
        rows = {g[0]: g for g in cache.get(str(lid), [])}
        ok = True
        for season in SEASONS:
            time.sleep(PAUSE)
            calls += 1
            print(f"  historique ligue {lid} saison {season}", file=sys.stderr, flush=True)
            try:
                d = _call(f"games?league={lid}&season={season}")
            except Exception as exc:
                print(f"[avertissement] volley {lid} {season} : {exc}", file=sys.stderr)
                ok = False
                continue
            if d.get("errors") and not isinstance(d["errors"], list):
                ok = False
                if "rateLimit" in json.dumps(d["errors"]) or "request" in json.dumps(d["errors"]).lower():
                    return cache
                continue
            for g in d.get("response", []):
                if g["status"]["short"] in FINISHED and g["scores"]["home"] is not None and g["scores"]["away"] is not None and g["scores"]["home"] != g["scores"]["away"]:
                    r = _row(g)
                    rows[r[0]] = r
        cache[str(lid)] = sorted(rows.values(), key=lambda g: g[1])
        if ok:
            done.add(lid)
    cache["_done"] = sorted(done)
    return cache


# ------------------------------------------------------------------ Elo
class Elo:
    def __init__(self):
        self.r, self.n = {}, {}

    def p(self, h, a):
        return 1 / (1 + 10 ** ((self.r.get(a, 1500.0) - self.r.get(h, 1500.0) - H_ADV) / 400))

    def update(self, h, a, hs, as_):
        p = self.p(h, a)
        res = 1.0 if hs > as_ else 0.0
        for who, sign in ((h, 1), (a, -1)):
            k = K0 / (self.n.get(who, 0) + 5) ** KEXP
            self.r[who] = self.r.get(who, 1500.0) + sign * k * (res - p)
            self.n[who] = self.n.get(who, 0) + 1


def train(rows, before=None):
    e = Elo()
    for g in rows:
        if before and g[1][:10] >= before.isoformat():
            break
        e.update(g[2], g[3], g[4], g[5])
    return e


def backtest(rows):
    """Modèle figé : notes calculées avec les saisons 2022-2023, utilisées sans mise à jour sur la saison 2024-25."""
    cut = date(2024, 8, 1)
    e = train(rows, before=cut)
    test = [g for g in rows if g[1][:10] >= cut.isoformat()]
    recs, picks = [], []
    for g in test:
        if e.n.get(g[2], 0) < MIN_GAMES or e.n.get(g[3], 0) < MIN_GAMES:
            continue
        p = e.p(g[2], g[3])
        recs.append((p, g[4] > g[5]))
        F = families(g[2], g[3], p, 5)
        safe, _ = classify(F)
        raw = dict(names=[g[2], g[3]], win=0 if g[4] > g[5] else 1)
        picks += [(r["p"], _won(r, raw, F, g[4], g[5])) for r in safe]
    if len(recs) < 40:
        return {}
    n = len(recs)
    out = dict(n=n, acc=sum((p > 0.5) == w for p, w in recs) / n, n_safe=len(picks), said=sum(p for p, _ in picks) / max(len(picks), 1),
               real=sum(w for _, w in picks) / max(len(picks), 1))
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
        sel = [(max(p, 1 - p), (p > 0.5) == w) for p, w in recs if lo <= max(p, 1 - p) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


def build(now):
    cache = _load(FILE)
    today = now.date()
    raws = window(today) if _key() else []
    if _key():
        wanted = list(dict.fromkeys(g["lg"] for g in raws))
        cache = history(cache, wanted)
        os.makedirs(DATA, exist_ok=True)
        with open(FILE, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, separators=(",", ":"))
    if not any(k != "_done" and v for k, v in cache.items()):
        return {}
    names = {}
    items = []
    elos = {}
    bt_all = {}
    for g in raws:
        lid = str(g["lg"])
        rows = cache.get(lid)
        if not rows:
            continue
        if lid not in elos:
            elos[lid] = train(rows)
        e = elos[lid]
        names[lid] = g["ln"] + (" · " + g["cty"] if g["cty"] not in ("World", "Europe", "Asia") else "")
        known = e.n.get(g["home"], 0) >= MIN_GAMES and e.n.get(g["away"], 0) >= MIN_GAMES
        p = e.p(g["home"], g["away"])
        if not known:
            p = 0.5 + (p - 0.5) * 0.5
        when = paris(datetime.strptime(g["d"], "%Y-%m-%dT%H:%M"))
        F = families(g["home"], g["away"], p, 5)
        safe, less = classify(F) if known else ([], [])
        state = "post" if g["short"] in FINISHED else "in" if g["short"] in LIVE else "pre"
        it = dict(id=g["id"], lg=lid, date=when.date().isoformat(), time=f"{when:%H:%M}", state=state, home=g["home"], away=g["away"], p=round(p, 4), known=known, safe=safe, less=less)
        if state == "post" and g["hs"] is not None and g["as_"] is not None and g["hs"] != g["as_"]:
            it.update(hs=g["hs"], as_=g["as_"], hit=((p > 0.5) == (g["hs"] > g["as_"])) if known else None)
            if known:
                raw = dict(names=[g["home"], g["away"]], win=0 if g["hs"] > g["as_"] else 1)
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=_won(r, raw, F, g["hs"], g["as_"]), t=t) for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    for lid in elos:
        b = backtest(cache[lid])
        if b:
            bt_all[lid] = b
    items.sort(key=lambda x: (x["date"], x["time"], x["lg"]))
    allg = [g for k, v in cache.items() if k != "_done" for g in v]
    return dict(matches=items, bt=bt_all, names=names, last=max((g[1][:10] for g in allg), default=""), generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    for line in open(".env", encoding="utf-8-sig"):
        if "=" in line:
            k, v = line.strip().split("=", 1)
            os.environ.setdefault(k, v)
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s;", len(d.get("matches", [])), "matchs; dernier match connu", d.get("last"))
    for lid, b in d.get("bt", {}).items():
        print(d["names"].get(lid), {k: round(v, 3) if isinstance(v, float) else v for k, v in b.items() if k != "bins"})
    for m in d.get("matches", [])[:12]:
        print(m["date"], m["time"], d["names"].get(m["lg"]), m["home"], "-", m["away"], m["p"], m["state"], m.get("hit"), len(m["safe"]), m["known"])
