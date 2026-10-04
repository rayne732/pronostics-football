"""Modèles maison pour les compétitions suivies via ESPN (divisions inférieures, football féminin, Amérique latine, Arabie saoudite, sélections nationales…).
Même modèle Poisson que pour les championnats football-data, entraîné sur l'historique ESPN (3 saisons) qui grandit chaque jour avec les résultats du flux mondial.
  - data/espn_hist.json : historique par compétition [date de Paris, domicile, extérieur, buts dom., buts ext.] ;
  - data/espn_models.json : évaluation glissante (12 mois, refit mensuel) de chaque compétition : meilleur réglage et gain contre la simple fréquence des résultats.
    Une compétition n'est modélisée que si le gain dépasse GAIN_MIN ; sinon elle reste en calendrier (affiche + cotes).
Identifiants : « x:<code ESPN> » (ex. x:eng.3), « x:INT » (sélections hommes) et « x:INTW » (sélections femmes, toutes compétitions réunies)."""
import json
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import poisson as sp

import poisson
from fixtures_api import ESPN_URL, _get_json, _local
from espn_hub import MODELED, SKIP_PREFIX, describe

HIST_FILE = "data/espn_hist.json"
EVAL_FILE = "data/espn_models.json"
HIST_YEARS = 4                      # année en cours + 3 précédentes
REFRESH_DAYS = 7                    # historique complet re-téléchargé chaque semaine (corrections ESPN)
EVAL_DAYS = 14
EVAL_PER_RUN = 14                   # nombre maximal de compétitions évaluées par exécution (borne le temps de calcul)
GAIN_MIN = 0.012                    # gain minimal de perte logarithmique 1X2 contre la fréquence des résultats
MIN_MATCHES = 250
POOLS = {
    "INT": ("fifa.friendly", "uefa.nations", "concacaf.nations.league", "caf.nations_qual", "fifa.worldq.uefa", "fifa.worldq.conmebol", "fifa.worldq.concacaf",
            "fifa.worldq.afc", "fifa.worldq.caf", "uefa.euroq", "fifa.world", "uefa.euro", "conmebol.america", "caf.nations", "afc.asian.cup", "concacaf.gold"),
    "INTW": ("fifa.friendly.w", "fifa.wworldq.uefa", "fifa.wwc", "uefa.weuro", "uefa.w.nations"),
}
POOL_NAME = {"INT": ("Sélections nationales", "Monde", "🌍"), "INTW": ("Sélections nationales (F)", "Monde", "🌍")}
SLUG_POOL = {s: p for p, ss in POOLS.items() for s in ss}
FLAGS = {"eng": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "esp": "🇪🇸", "ger": "🇩🇪", "ita": "🇮🇹", "fra": "🇫🇷", "ned": "🇳🇱", "bel": "🇧🇪", "por": "🇵🇹", "tur": "🇹🇷", "gre": "🇬🇷", "sco": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
         "wal": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "nir": "🇬🇧", "irl": "🇮🇪", "usa": "🇺🇸", "mex": "🇲🇽", "arg": "🇦🇷", "bra": "🇧🇷", "jpn": "🇯🇵", "kor": "🇰🇷", "chn": "🇨🇳", "aus": "🇦🇺",
         "ksa": "🇸🇦", "nor": "🇳🇴", "swe": "🇸🇪", "den": "🇩🇰", "fin": "🇫🇮", "pol": "🇵🇱", "rou": "🇷🇴", "sui": "🇨🇭", "aut": "🇦🇹", "cze": "🇨🇿", "cro": "🇭🇷",
         "hun": "🇭🇺", "srb": "🇷🇸", "bul": "🇧🇬", "svk": "🇸🇰", "rus": "🇷🇺", "ukr": "🇺🇦", "isr": "🇮🇱", "cyp": "🇨🇾", "ind": "🇮🇳", "col": "🇨🇴", "ecu": "🇪🇨",
         "chi": "🇨🇱", "par": "🇵🇾", "per": "🇵🇪", "uru": "🇺🇾", "ven": "🇻🇪", "bol": "🇧🇴", "crc": "🇨🇷", "hon": "🇭🇳", "gua": "🇬🇹", "slv": "🇸🇻", "can": "🇨🇦",
         "mar": "🇲🇦", "egy": "🇪🇬", "rsa": "🇿🇦", "tha": "🇹🇭", "idn": "🇮🇩", "mys": "🇲🇾"}
CFGS = {"def": (0.0019, 0.5), "slow": (0.0010, 2.0), "slow6": (0.0010, 6.0), "fast6": (0.0035, 6.0)}
POOL_CFGS = {"def": (0.0019, 0.5), "slow": (0.0010, 2.0), "slowest": (0.0007, 1.0)}      # sélections : peu de matchs par équipe, mémoire longue


def _read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _write(path, data):
    os.makedirs("data", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))


def div_of(slug):
    return "x:" + SLUG_POOL.get(slug, slug)


# ---------------------------------------------------------------- historique
def _fetch_slug(slug, years):
    rows = []
    for year in years:
        try:
            d = _get_json(ESPN_URL.format(slug=slug, year=year), 90)
        except Exception:
            continue
        for e in d.get("events", []):
            try:
                if e["status"]["type"]["state"] != "post":
                    continue
                c = e["competitions"][0]
                t = {x["homeAway"]: x for x in c["competitors"]}
                hs, as_ = t["home"].get("score"), t["away"].get("score")
                if not (str(hs).isdigit() and str(as_).isdigit()):
                    continue
                when = _local(e["date"].replace("Z", ":00Z") if e["date"].count(":") == 1 else e["date"])
                rows.append([f"{when:%Y-%m-%d}", t["home"]["team"]["displayName"], t["away"]["team"]["displayName"], int(hs), int(as_)])
            except (KeyError, TypeError, ValueError):
                continue
    return rows


def _dedupe(rows):
    seen, out = set(), []
    for r in sorted(rows):
        k = (r[0], r[1], r[2])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def update_history(events, now_ts):
    """Complète data/espn_hist.json : (re)télécharge les compétitions nouvelles ou périmées, puis ajoute les matchs terminés du flux mondial. -> historique {slug: [[...]]}."""
    data = _read(HIST_FILE) or {"d": {}, "ts": {}}
    hist, ts = data["d"], data["ts"]
    slugs = sorted({it["slug"] for it in events if not it["slug"].startswith(SKIP_PREFIX) and it["slug"] not in MODELED and it["slug"] != "club.friendly"} | set(SLUG_POOL))
    year = datetime.fromtimestamp(now_ts, timezone.utc).year
    todo = [s for s in slugs if s not in hist or now_ts - ts.get(s, 0) > REFRESH_DAYS * 86400]
    if todo:
        with ThreadPoolExecutor(8) as ex:
            for slug, rows in zip(todo, ex.map(lambda s: _fetch_slug(s, range(year - HIST_YEARS + 1, year + 1)), todo)):
                if rows or slug not in hist:
                    hist[slug] = _dedupe(rows)
                    ts[slug] = now_ts
        print(f"[info] historique ESPN : {len(todo)} compétition(s) téléchargée(s)", file=sys.stderr)
    for it in events:                                                   # résultats de ces derniers jours : le modèle apprend tout de suite
        if it["st"] == "post" and it["hs"] is not None and it["as_"] is not None and it["slug"] in hist:
            hist[it["slug"]].append([it["date"], it["home"], it["away"], it["hs"], it["as_"]])
    for s in hist:
        hist[s] = _dedupe(hist[s])
    _write(HIST_FILE, dict(d=hist, ts=ts))
    return hist


def dataset(hist, div):
    """Lignes de matchs (format poisson) d'une compétition ou d'un regroupement de sélections."""
    key = div[2:]
    slugs = POOLS[key] if key in POOLS else (key,)
    lst = _dedupe([r for s in slugs for r in hist.get(s, [])])
    return [dict(Div=div, Date=datetime.strptime(d, "%Y-%m-%d"), HomeTeam=h, AwayTeam=a, FTHG=hg, FTAG=ag, FTR="H" if hg > ag else "D" if hg == ag else "A",
                 season=d[:4], shots=None, xg=None) for d, h, a, hg, ag in lst]


def eligible(rows, pooled):
    """Compétition « de championnat » : assez de matchs, un nombre d'équipes raisonnable et beaucoup de matchs par équipe (écarte les coupes)."""
    teams = {r["HomeTeam"] for r in rows} | {r["AwayTeam"] for r in rows}
    if len(rows) < MIN_MATCHES:
        return False
    return pooled or (len(teams) <= 60 and 2 * len(rows) / len(teams) >= 30)


# ---------------------------------------------------------------- évaluation
_G = np.arange(11)


def _p3(lh, la):
    g = np.outer(sp.pmf(_G, lh), sp.pmf(_G, la))
    return np.array([np.tril(g, -1).sum(), np.trace(g), np.triu(g, 1).sum()])


def evaluate(div, rows, now):
    """Rejoue les 12 derniers mois (refit mensuel, passé seul) : perte logarithmique 1X2 de chaque réglage et de la fréquence des résultats."""
    pooled = div[2:] in POOLS
    cfgs = POOL_CFGS if pooled else CFGS
    lo = (now.replace(day=1) - timedelta(days=365)).replace(day=1)
    months = sorted({(r["Date"].year, r["Date"].month) for r in rows if r["Date"] >= lo and r["Date"] < now})
    ll = {k: [] for k in cfgs}
    base = []
    xi0, l20 = poisson.XI, poisson.L2
    saved = poisson.LEAGUE_CFG.pop(div, None)
    try:
        for yy, mm in months:
            d0 = datetime(yy, mm, 1)
            train = [r for r in rows if r["Date"] < d0]
            if len(train) < 200:
                continue
            fr = np.array([sum(r["FTR"] == c for r in train) for c in "HDA"], float)
            fr /= fr.sum()
            ms = {}
            for k, (xi, l2) in cfgs.items():
                poisson.XI, poisson.L2 = xi, l2
                ms[k] = poisson.fit(train, d0)
            m0 = ms["def"]
            for r in rows:
                if (r["Date"].year, r["Date"].month) != (yy, mm) or r["HomeTeam"] not in m0["idx"] or r["AwayTeam"] not in m0["idx"]:
                    continue
                y = "HDA".index(r["FTR"])
                for k, m in ms.items():
                    _, (lh, la) = poisson.score_grid(m, r["HomeTeam"], r["AwayTeam"])
                    ll[k].append(-math.log(max(_p3(lh, la)[y], 1e-9)))
                base.append(-math.log(fr[y]))
    finally:
        poisson.XI, poisson.L2 = xi0, l20
        if saved is not None:
            poisson.LEAGUE_CFG[div] = saved
    if len(base) < 100:
        return None
    best = min(cfgs, key=lambda k: np.mean(ll[k]))
    return dict(cfg=list(cfgs[best]), gain=round(float(np.mean(base) - np.mean(ll[best])), 4), n=len(base), ts=now.timestamp())


def evaluations(hist, divs, now):
    """Évaluations en cache (rafraîchies au plus EVAL_PER_RUN par exécution, les plus anciennes d'abord)."""
    ev = _read(EVAL_FILE) or {"m": {}}
    m = ev["m"]
    due = sorted((d for d in divs if d not in m or now.timestamp() - m[d].get("ts", 0) > EVAL_DAYS * 86400), key=lambda d: m.get(d, {}).get("ts", 0))
    for div in due[:EVAL_PER_RUN]:
        rows = dataset(hist, div)
        r = evaluate(div, rows, now) if eligible(rows, div[2:] in POOLS) else None
        m[div] = r or dict(cfg=None, gain=None, n=len(rows), ts=now.timestamp())
        if r and r["gain"] >= GAIN_MIN:                                   # fiabilité réelle des pronostics « sûrs » (rejoués sur le passé) : [nombre, annoncé, réussi]
            import tracking
            poisson.LEAGUE_CFG[div] = tuple(r["cfg"])
            safe = [x for x in tracking.backtest_rows(div, rows) if x[4] == 0]
            if safe:
                m[div]["cal"] = [len(safe), round(sum(x[3] for x in safe) / len(safe), 4), round(sum(x[6] for x in safe) / len(safe), 4)]
        print(f"[info] évaluation {div} : {m[div]}", file=sys.stderr)
    if due:
        _write(EVAL_FILE, ev)
    return m


# ---------------------------------------------------------------- construction pour le bot
def build(now, events, hist):
    """-> (infos par compétition modélisée: {div: dict(df, name, ctry, flag, cfg)}, lignes de calendrier à modéliser)."""
    from tennis import paris
    today = f"{paris(datetime.fromtimestamp(now.timestamp(), timezone.utc).replace(tzinfo=None)):%Y-%m-%d}"
    upcoming, started = {}, set()
    for it in events:
        live = it["st"] != "pre" and it["date"] == today                       # match du jour déjà commencé ou terminé : il reste affiché jusqu'à la fin de la journée
        if live:
            started.add((it["date"], it["home"], it["away"]))
        if (it["st"] == "pre" or live) and it["slug"] not in MODELED and not it["slug"].startswith(SKIP_PREFIX) and it["slug"] != "club.friendly":
            upcoming.setdefault(div_of(it["slug"]), []).append(it)
    ev = evaluations(hist, sorted(upcoming), now)
    info, fixtures = {}, []
    for div, its in upcoming.items():
        e = ev.get(div)
        if not e or not e.get("cfg") or (e.get("gain") or 0) < GAIN_MIN:
            continue
        full = dataset(hist, div)
        rows = [r for r in full if (f"{r['Date']:%Y-%m-%d}", r["HomeTeam"], r["AwayTeam"]) not in started]     # le modèle ne doit pas connaître le résultat d'un match du jour
        if not rows:
            continue
        slug = its[0]["slug"]
        if div[2:] in POOLS:
            name, ctry, flag = POOL_NAME[div[2:]]
        else:
            fr, _, cfr = describe(slug, its[0]["lname"])
            name, ctry, flag = fr, cfr, FLAGS.get(slug.split(".")[0], "⚽")
        poisson.LEAGUE_CFG[div] = tuple(e["cfg"])
        recent = now - timedelta(days=400)
        info[div] = dict(df=rows, full=full, name=name, ctry=ctry, flag=flag, gain=e["gain"], slugs=sorted({it["slug"] for it in its}),
                         teams=sorted({t for r in rows if r["Date"] >= recent for t in (r["HomeTeam"], r["AwayTeam"])}))
        for it in its:
            row = dict(Div=div, Date=datetime.strptime(it["date"], "%Y-%m-%d"), Time=it["time"], HomeTeam=it["home"], AwayTeam=it["away"])
            if it.get("o"):
                row.update(it["o"])                               # cotes ESPN (B365H…) : alimentent le mélange modèle + marché
            fixtures.append(row)
    return info, fixtures
