"""Journal des résultats de nos pronostics sur 14 jours : sert à régler automatiquement les paris notés dans « Mes paris ».
Format publié : {"m": {identifiant du match: [[marché, sélection, 1 si gagné sinon 0], ...]}, "gen": date}.
Football : suivi réel (data/tracking.json) ; autres sports : matchs terminés de leurs données (clé « picks »)."""
import json
import os
from datetime import datetime, timedelta

LOG = "data/results_log.json"
KEEP_DAYS = 14
ALL_DAYS = 3                      # football : résultat de TOUTES les sélections des fiches match pour les 3 derniers jours (règlement des paris hors pronostics)


def _read(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _all_selections(today, tr, models, rows_by_div):
    """{identifiant du match: [[marché, sélection, 1/0], ...]} pour chaque sélection de chaque marché des matchs de football terminés ces derniers jours."""
    from tracking import result_of
    from winamax import families
    lo = f"{today.date() - timedelta(days=ALL_DAYS):%Y-%m-%d}"
    out = {}
    for key, m in tr["matches"].items():
        if not m.get("settled") or m["date"] < lo or m["div"] not in models:
            continue
        row = (rows_by_div.get(m["div"]) or {}).get((datetime.strptime(m["date"], "%Y-%m-%d"), m["home"], m["away"]))
        if row is None:
            continue
        res = result_of(row)
        try:
            fams, _ = families(models[m["div"]], m["home"], m["away"])
        except Exception:
            continue
        sel = []
        for f in fams:
            for label, rule in f["rules"].items():
                try:
                    hit = rule(res)
                except Exception:
                    hit = None
                if hit is not None:
                    sel.append([f["name"], label, int(bool(hit))])
        if sel:
            out[key] = sel
    return out


def update(today, sports, track_file="data/tracking.json", models=None, rows_by_div=None):
    """Met à jour le journal (fichier data/results_log.json) puis renvoie la version à publier."""
    log = (_read(LOG) or {}).get("m", {})
    lo = f"{today.date() - timedelta(days=KEEP_DAYS):%Y-%m-%d}"
    tr = _read(track_file) or {"matches": {}}
    for key, m in tr["matches"].items():
        if m.get("settled") and m["date"] >= lo:
            picks = [[p["market"], p["sel"], int(bool(p["hit"]))] for p in m["picks"] if p.get("hit") is not None]
            if picks:
                log[key] = dict(d=m["date"], p=picks)
    for sport, data in (sports or {}).items():
        for it in (data or {}).get("matches", []):
            if it.get("state") != "post" or not it.get("picks") or it.get("date", "") < lo:
                continue
            log[f"{sport}|{it['id']}"] = dict(d=it["date"], p=[[r["m"], r["s"], int(bool(r["h"]))] for r in it["picks"] if r.get("h") is not None])
    log = {k: v for k, v in log.items() if v["d"] >= lo}
    os.makedirs("data", exist_ok=True)
    with open(LOG, "w", encoding="utf-8") as fh:
        json.dump(dict(m=log), fh, ensure_ascii=False, separators=(",", ":"))
    pub = dict(m={k: v["p"] for k, v in log.items()}, gen=f"{today:%Y-%m-%d %H:%M}")
    if models and rows_by_div:
        pub["a"] = _all_selections(today, tr, models, rows_by_div)
    return pub
