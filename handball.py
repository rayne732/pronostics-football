"""Handball : même modèle de points que le rugby (attaque / défense / avantage du terrain par équipe, marges et totaux ~ lois normales,
match nul possible). Données : API-Sports (offre gratuite : saisons 2022 à 2024 pour l'historique, hier / aujourd'hui / demain pour le calendrier).
Les notes des équipes datent donc de juin 2025 : le test mesure ce que vaut un modèle figé un an plus tôt."""
import json
import math
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

from basket import expected, fit, ncdf
from rugby import classify, probs, sf, won
from tennis import paris

DATA = "data"
GAMES_FILE = os.path.join(DATA, "handball_games.json")
CACHE_FILE = os.path.join(DATA, "handball_window.json")
BASE = "https://v1.handball.api-sports.io/"
LEAGUES = {34: "Starligue", 36: "Proligue", 39: "Bundesliga", 103: "Liga ASOBAL", 23: "Håndboldligaen", 113: "Handbollsligan",
           78: "Superliga polonaise", 49: "NB I hongroise", 84: "Andebol 1", 131: "Ligue des champions", 145: "Ligue européenne"}
SEASONS = (2022, 2023, 2024)
LAM = 4.0
PAUSE = 6.6                       # 10 requêtes par minute maximum
MAX_AGE = 3600                    # le calendrier du jour est relu au plus une fois par heure
FINISHED = ("FT", "AET", "AP")
LIVE = ("1H", "HT", "2H", "ET", "BT", "PT", "LIVE")


def _key():
    return os.environ.get("API_FOOTBALL_KEY")


def _call(path):
    req = urllib.request.Request(BASE + path, headers={"x-apisports-key": _key()})
    with urllib.request.urlopen(req, timeout=40) as resp:
        return json.load(resp)


def _row(g):
    sc = g["scores"]
    return [f'H{g["id"]}', g["date"][:16], g["teams"]["home"]["name"], g["teams"]["away"]["name"], sc["home"], sc["away"], 2]


def _history(cache):
    """Matchs terminés des saisons 2022-2024 (une requête par championnat et saison, une seule fois)."""
    for lid in LEAGUES:
        k = str(lid)
        have = {g[1][:4] for g in cache.get(k, [])}
        if cache.get(k) and len(have) >= 2:
            continue
        rows = {g[0]: g for g in cache.get(k, [])}
        for season in SEASONS:
            time.sleep(PAUSE)
            try:
                d = _call(f"games?league={lid}&season={season}")
            except Exception as exc:
                print(f"[avertissement] handball {lid} {season} : {exc}", file=sys.stderr)
                continue
            if d.get("errors") and not isinstance(d["errors"], list):
                print(f"[avertissement] handball {lid} {season} : {d['errors']}", file=sys.stderr)
                if "rateLimit" in json.dumps(d["errors"]):
                    break
                continue
            for g in d.get("response", []):
                if g["status"]["short"] in FINISHED and g["scores"]["home"] is not None and g["scores"]["away"] is not None:
                    r = _row(g)
                    rows[r[0]] = r
        cache[k] = sorted(rows.values(), key=lambda g: g[1])
    return cache


def _load(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def window(today):
    """Matchs d'hier, d'aujourd'hui et de demain (limite de l'offre gratuite), championnats suivis seulement."""
    c = _load(CACHE_FILE)
    if c.get("day") == today.isoformat() and time.time() - c.get("t", 0) < MAX_AGE:
        return c["games"]
    out = []
    for off in (-1, 0, 1):
        day = today + timedelta(days=off)
        try:
            d = _call(f"games?date={day.isoformat()}")
        except Exception as exc:
            print(f"[avertissement] handball {day} : {exc}", file=sys.stderr)
            return c.get("games", [])
        if d.get("errors") and not isinstance(d["errors"], list):
            print(f"[avertissement] handball {day} : {d['errors']}", file=sys.stderr)
            return c.get("games", [])
        for g in d.get("response", []):
            if g["league"]["id"] in LEAGUES:
                out.append(dict(lg=g["league"]["id"], id=f'H{g["id"]}', d=g["date"][:16], home=g["teams"]["home"]["name"], away=g["teams"]["away"]["name"],
                                hl=g["teams"]["home"].get("logo"), al=g["teams"]["away"].get("logo"), short=g["status"]["short"], hs=g["scores"]["home"], as_=g["scores"]["away"]))
        time.sleep(PAUSE if off < 1 else 0)
    with open(CACHE_FILE, "w", encoding="utf-8") as fh:
        json.dump(dict(day=today.isoformat(), t=time.time(), games=out), fh, ensure_ascii=False)
    return out


# ------------------------------------------------------------------ marchés
def families(M, home, away, lh, la):
    mm, mt = lh - la, lh + la
    ph, pd, pa = probs(M, lh, la)
    F = [("Résultat du match", [[home, ph], ["Match nul", pd], [away, pa]], True, False),
         ("Double chance", [[home + " ou nul", ph + pd], [away + " ou nul", pa + pd], [home + " ou " + away, ph + pa]], True, False)]
    base = round(mm)
    for team, sgn in ((home, 1), (away, -1)):
        sels = []
        for k in range(-8, 9, 1):
            line = math.floor(base * sgn + k + 0.5) + 0.5
            sels.append([f"{team} {line:+.1f}".replace(".", ","), sf(-line, mm * sgn, M["sdm"])])
        F.append(("Handicap", sels, False, False))
    tot = round(mt)
    lines = [tot + k + 0.5 for k in range(-10, 11, 2)]
    F.append(("Total points (plus)", [[f"Plus de {ln:.1f}".replace(".", ",") + " points", sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    F.append(("Total points (moins)", [[f"Moins de {ln:.1f}".replace(".", ",") + " points", 1 - sf(ln, mt, M["sdt"])] for ln in lines], False, False))
    for team, mean in ((home, lh), (away, la)):
        tl = [round(mean) + k + 0.5 for k in range(-6, 7, 2)]
        F.append((f"Points de {team} (plus)", [[f"{team} plus de {ln:.1f}".replace(".", ","), sf(ln, mean, M["sdp"])] for ln in tl], False, False))
        F.append((f"Points de {team} (moins)", [[f"{team} moins de {ln:.1f}".replace(".", ","), 1 - sf(ln, mean, M["sdp"])] for ln in tl], False, False))
    return F


# ------------------------------------------------------------------ test : modèle figé un an plus tôt
def backtest(games):
    """Modèle ajusté avec les saisons 2022-2023 seulement, puis utilisé sans mise à jour sur toute la saison 2024-25 :
    c'est la situation actuelle (notes arrêtées en juin 2025, matchs de la saison 2026-27)."""
    cut = date(2024, 8, 1)
    M = fit(games, cut, LAM)
    rows = [g for g in games if g[1][:10] >= cut.isoformat()]
    if not M or not rows:
        return {}
    recs, picks = [], []
    for g in rows:
        e = expected(M, g[2], g[3])
        if not e:
            continue
        ph, pd, pa = probs(M, *e)
        recs.append((ph, pd, pa, g[4], g[5]))
        safe, _ = classify(families(M, g[2], g[3], *e))
        picks += [(r["p"], won(r, g[2], g[3], g[4], g[5])) for r in safe]
    if len(recs) < 30:
        return {}
    dec = [r for r in recs if r[3] != r[4]]
    out = dict(n=len(recs), acc=sum((r[0] > r[2]) == (r[3] > r[4]) for r in dec) / max(len(dec), 1), n_safe=len(picks),
               said=sum(p for p, _ in picks) / max(len(picks), 1), real=sum(w for _, w in picks) / max(len(picks), 1))
    bins = []
    for lo, hi in ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01)):
        sel = [(max(r[0], r[2]), (r[0] > r[2]) == (r[3] > r[4])) for r in dec if lo <= max(r[0], r[2]) < hi]
        if sel:
            bins.append(dict(lo=lo, hi=min(hi, 1), n=len(sel), said=sum(s for s, _ in sel) / len(sel), real=sum(w for _, w in sel) / len(sel)))
    out["bins"] = bins
    return out


# ------------------------------------------------------------------ assemblage
def build(now, days=1):
    cache = _load(GAMES_FILE)
    if _key():
        cache = _history(cache)
        os.makedirs(DATA, exist_ok=True)
        with open(GAMES_FILE, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, separators=(",", ":"))
    if not any(cache.values()):
        return {}
    today = now.date()
    raws = window(today) if _key() else []
    models = {}
    for lid in LEAGUES:
        rows = cache.get(str(lid), [])
        M = fit(rows, today, LAM) if rows else None
        if M:
            models[lid] = M
    all_games = [g for rows in cache.values() for g in rows]
    bt_all = {}
    for lid in LEAGUES:
        b = backtest(cache.get(str(lid), []))
        if b:
            bt_all[str(lid)] = b
    items = []
    for g in raws:
        when = paris(datetime.strptime(g["d"], "%Y-%m-%dT%H:%M"))
        M = models.get(g["lg"])
        if not M:
            continue
        e = expected(M, g["home"], g["away"])
        known = bool(e)
        lh, la = e if e else (M["mu"], M["mu"])
        ph, pd, pa = probs(M, lh, la)
        safe, less = classify(families(M, g["home"], g["away"], lh, la)) if known else ([], [])
        state = "post" if g["short"] in FINISHED else "in" if g["short"] in LIVE else "pre"
        it = dict(id=g["id"], lg=g["lg"], date=when.date().isoformat(), time=f"{when:%H:%M}", state=state, home=g["home"], away=g["away"], hl=g.get("hl"), al=g.get("al"),
                  p=[round(ph, 4), round(pd, 4), round(pa, 4)], lh=round(lh, 1), la=round(la, 1), known=known, safe=safe, less=less)
        if state == "post" and g["hs"] is not None and g["as_"] is not None:
            it.update(hs=g["hs"], as_=g["as_"])
            fav = 0 if ph >= pa else 2
            it["hit"] = ((g["hs"] > g["as_"] and fav == 0) or (g["as_"] > g["hs"] and fav == 2)) if known else None
            if known:
                it["picks"] = [dict(m=r["m"], s=r["s"], p=r["p"], h=won(r, g["home"], g["away"], g["hs"], g["as_"]), t=t)
                               for t, lst in ((0, safe), (1, less)) for r in lst]
        items.append(it)
    items.sort(key=lambda x: (x["date"], x["time"], x["lg"]))
    last = max((g[1][:10] for g in all_games), default="")
    return dict(matches=items, bt=bt_all, names={str(k): v for k, v in LEAGUES.items()}, last=last, generated=f"{now:%d/%m/%Y à %H:%M}")


if __name__ == "__main__":
    for line in open(".env", encoding="utf-8-sig"):
        if "=" in line:
            k, v = line.strip().split("=", 1)
            os.environ.setdefault(k, v)
    t0 = time.time()
    d = build(datetime.now())
    print("temps", round(time.time() - t0), "s;", len(d.get("matches", [])), "matchs; dernier match connu", d.get("last"))
    for lid, b in d.get("bt", {}).items():
        print(LEAGUES[int(lid)], {k: round(v, 3) if isinstance(v, float) else v for k, v in b.items() if k != "bins"})
    for m in d.get("matches", [])[:10]:
        print(m["date"], m["time"], LEAGUES[m["lg"]], m["home"], "-", m["away"], m["p"], m["state"], m.get("hit"), len(m["safe"]))
