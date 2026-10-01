"""Génère la page web : une petite application (accueil par dates, fiche match, analyse libre, fiabilité).
Les marchés sont calculés dans le navigateur (web/engine.js) à partir des paramètres du modèle ; ce fichier
prépare les données et le contenu statique (fiabilité, test de rentabilité)."""
import json
import os
from html import escape

from winamax import SAFE_MIN

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" '
         'href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">')


def _read(name):
    with open(os.path.join(WEB, name), encoding="utf-8") as fh:
        return fh.read()


def _n(x):
    return f"{x:,}".replace(",", " ")


def _gap_cls(s):
    return "ok" if s["hit"] >= s["p"] - 0.03 else "bad"


def _cards(sm, title):
    def card(label, s):
        if not s["n"]:
            return f'<div class="rel"><div class="rl">{label}</div><div class="rs">pas encore de données</div></div>'
        return (f'<div class="rel"><div class="rl">{label}</div><div class="rv {_gap_cls(s)}">{s["hit"]:.0%}</div>'
                f'<div class="rs">gagnés · annoncé {s["p"]:.0%}<br>{_n(s["n"])} pronostics</div></div>')
    return f'<h4>{escape(title)}</h4><div class="rel-cards">{card("Sûrs (≥ 70 %)", sm["safe"])}{card("Moins sûrs", sm["less"])}</div>'


def _tables(sm):
    rows = "".join(
        f'<tr><td>{b["lo"]:.0%}–{b["hi"]:.0%}</td><td>{_n(b["n"])}</td><td>{b["p"]:.0%}</td><td class="{_gap_cls(b)}">{b["hit"]:.0%}</td></tr>'
        for b in sm["buckets"] if b["n"] >= 20)
    kinds = "".join(
        f'<tr><td>{escape(k["kind"])}</td><td>{_n(k["n"])}</td><td>{k["p"]:.0%}</td><td class="{_gap_cls(k)}">{k["hit"]:.0%}</td></tr>'
        for k in sm["kinds"] if k["n"] >= 20)
    head = "<tr><th>{}</th><th>Pronostics</th><th>Annoncé</th><th>Réel</th></tr>"
    return (f'<details class="rel-d"><summary>Détail par tranche de probabilité</summary><div class="tblw"><table class="tbl">{head.format("Probabilité annoncée")}{rows}</table></div></details>'
            f'<details class="rel-d"><summary>Détail par type de marché</summary><div class="tblw"><table class="tbl">{head.format("Marché")}{kinds}</table></div></details>')


MONTHS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"]


def _chart(series, title):
    """Courbes mois par mois : probabilité annoncée (pointillés) et part réellement gagnée (trait plein)."""
    if len(series) < 2:
        return ""
    W, H, L, R, T, B = 640, 250, 46, 16, 16, 34
    lo = min(min(x[2], x[3]) for x in series) - 0.04
    hi = max(max(x[2], x[3]) for x in series) + 0.04
    lo, hi = max(0.0, (int(lo * 20)) / 20), min(1.0, (int(hi * 20) + 1) / 20)
    X = lambda i: L + (W - L - R) * (i / (len(series) - 1))
    Y = lambda v: T + (H - T - B) * (1 - (v - lo) / (hi - lo))
    grid, step = "", 0.05
    v = lo
    while v <= hi + 1e-9:
        grid += (f'<line x1="{L}" x2="{W - R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="var(--line)" stroke-width="1"/>'
                 f'<text x="{L - 8}" y="{Y(v) + 4:.1f}" text-anchor="end" fill="var(--mute)" font-size="11">{v:.0%}</text>')
        v += step
    xl = ""
    for i, (m, n, pa, hit) in enumerate(series):
        if len(series) <= 8 or i % 2 == 0:
            xl += f'<text x="{X(i):.1f}" y="{H - 10}" text-anchor="middle" fill="var(--mute)" font-size="11">{MONTHS[int(m[5:]) - 1]} {m[2:4]}</text>'
    pts = lambda k: " ".join(f"{X(i):.1f},{Y(x[k]):.1f}" for i, x in enumerate(series))
    dots = "".join(f'<circle cx="{X(i):.1f}" cy="{Y(x[3]):.1f}" r="3.6" fill="var(--green)"><title>{x[0]} : {x[3]:.0%} gagnés sur {x[1]} pronostics ({x[2]:.0%} annoncé)</title></circle>'
                   for i, x in enumerate(series))
    return (f'<h4>{escape(title)}</h4><div class="chartw"><svg viewBox="0 0 {W} {H}" role="img" aria-label="{escape(title)}" class="chart">{grid}{xl}'
            f'<polyline points="{pts(2)}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="5 4"/>'
            f'<polyline points="{pts(3)}" fill="none" stroke="var(--green)" stroke-width="2.6" stroke-linejoin="round"/>{dots}</svg></div>'
            f'<div class="legend"><span><i class="lg1"></i>Annoncé par le modèle</span><span><i class="lg2"></i>Réellement gagné</span></div>')


def _reliability(rel):
    if not rel or (not rel["bt"] and not rel["live"]):
        return ""
    out = ['<h2>Fiabilité du modèle</h2>',
           '<div class="meta">« Annoncé » = probabilité moyenne donnée par le modèle. « Réel » = part de pronostics gagnés. '
           'Si les deux sont proches, le modèle est bien calibré ; un réel nettement plus bas veut dire qu’il est trop confiant.</div>']
    if rel["live"]:
        d = rel["since"]
        out.append(_cards(rel["live"], f"Suivi réel (pronostics affichés ici, vérifiés après les matchs, depuis le {d[8:]}/{d[5:7]}/{d[:4]})"))
        out.append(_tables(rel["live"]))
        out.append(_chart(rel.get("monthly_live", []), "Évolution du suivi réel (pronostics sûrs)"))
    else:
        out.append('<div class="empty">Suivi réel : les premiers pronostics affichés sur cette page seront comptés après leurs matchs.</div>')
    if rel["bt"]:
        s = rel["seasons"]
        label = " et ".join(f"{x[:2]}/{x[2:]}" for x in s)
        out.append(_cards(rel["bt"], f"Backtest (pronostics rejoués semaine par semaine sur {label}, modèle entraîné sur le passé seulement)"))
        out.append(_tables(rel["bt"]))
        out.append(_chart(rel.get("monthly", []), "Évolution mois par mois des pronostics sûrs (backtest)"))
    return "".join(out)


def _value():
    """Section « peut-on gagner de l’argent » : résultats de value_test.py (data/value_summary.json)."""
    try:
        with open("data/value_summary.json", encoding="utf-8") as fh:
            v = json.load(fh)
    except (FileNotFoundError, ValueError):
        return ""
    edges = sorted({r["edge"] for r in v["rows"]})
    head = "<tr><th>Cotes utilisées</th>" + "".join(f"<th>avantage ≥ {e:.0%}</th>" for e in edges) + "</tr>"
    tables = []
    for market in ("1X2", "Plus/moins 2,5 buts"):
        rows = ""
        for src in ("Bet365", "Moyenne marché", "Meilleure cote"):
            cells = ""
            for e in edges:
                r = next((x for x in v["rows"] if x["market"] == market and x["source"] == src and x["edge"] == e), None)
                cells += f'<td class="bad">{r["roi"]:+.1%}</td>' if r else "<td>–</td>"
            rows += f"<tr><td>{src}</td>{cells}</tr>"
        tables.append(f'<h4>{escape(market)}</h4><div class="tblw"><table class="tbl">{head}{rows}</table></div>')
    d = v["generated"]
    return (
        '<h2>Peut-on gagner de l’argent avec ces pronostics ?</h2>'
        '<div class="meta">Non, pas avec ce modèle. Test du '
        f'{d[8:]}/{d[5:7]}/{d[:4]} : {_n(v["matches"])} matchs de 6 championnats (saisons '
        + ", ".join(f"{x[:2]}/{x[2:]}" for x in v["seasons"]) +
        '), avec les vraies cotes d’avant-match, en misant une unité chaque fois que le modèle voit un avantage '
        '(probabilité × cote − 1) au-dessus du seuil. Chiffres : gain net moyen par unité misée.</div>'
        + "".join(tables) +
        '<div class="note" style="margin-top:12px;border-top:0;padding-top:0">'
        'Sur le 1X2, plus l’avantage apparent est grand, plus on perd : un gros écart avec la cote vient presque toujours d’une '
        'erreur du modèle, pas du bookmaker. Sur le plus/moins 2,5 buts, on perd à peu près la marge du bookmaker (≈ 5 %). '
        'Même avec la meilleure cote du marché, le résultat reste négatif. Les cotes de Winamax n’ont pas été testées ; '
        'rien ne laisse penser qu’elles changeraient le verdict. Ces pronostics servent à analyser un match, pas à gagner de l’argent. '
        'Si tu paries, ne mise que ce que tu peux perdre (Joueurs Info Service : 09 74 75 13 13).</div>')


def _model_params(m, teams):
    """Paramètres du modèle des équipes de la saison en cours : pour chaque équipe [attaque, défense]."""
    def part(mm):
        idx = mm["idx"]
        return dict(mu=round(float(mm["mu"]), 5), ha=round(float(mm["ha"]), 5),
                    t={t: [round(float(mm["att"][idx[t]]), 4), round(float(mm["dfn"][idx[t]]), 4)] for t in teams if t in idx})
    return dict(g=part(m["goals"]), c=part(m["corners"]) if m.get("corners") else None, ht=round(float(m["ht"]), 5))


def build_data(models, fixtures, market_probs, leagues, history, generated_at, recent=None, daily=None, ext=None, tennis=None, basket=None, rugby=None, handball=None, hockey=None, f1=None, baseball=None, nfl=None, mma=None):
    lg = {}
    for div, info in leagues.items():
        lg[div] = dict(name=info["name"], teams=info["teams"], **_model_params(models[div], info["teams"]))
    fx = []
    for r in fixtures:
        mk = market_probs(r) if market_probs else None
        fx.append(dict(id=f'{r["Div"]}|{r["Date"]:%Y-%m-%d}|{r["HomeTeam"]}|{r["AwayTeam"]}', div=r["Div"],
                       date=f'{r["Date"]:%Y-%m-%d}', time=r.get("Time", ""), home=r["HomeTeam"], away=r["AwayTeam"],
                       mk=[round(float(x), 4) for x in mk] if mk is not None else None))
    hist = []
    for div, rows in (history or {}).items():
        for r in rows:
            hist.append([div, int(f'{r["Date"]:%Y%m%d}'), r["HomeTeam"], r["AwayTeam"], r["FTHG"], r["FTAG"]])
    hist.sort(key=lambda x: x[1])
    return dict(generated=f"{generated_at:%d/%m/%Y à %H:%M}", order=list(leagues), leagues=lg, fixtures=fx, hist=hist, recent=recent or [], daily=daily or [], ext=ext or [], tennis=tennis or {}, basket=basket or {}, rugby=rugby or {}, handball=handball or {}, hockey=hockey or {}, f1=f1 or {}, baseball=baseball or {}, nfl=nfl or {}, mma=mma or {}, today=os.environ.get("TRACKING_TODAY") or f"{generated_at:%Y-%m-%d}", safeMin=SAFE_MIN)


def _info(reliability):
    intro = ('<h2>Comment lire les pronostics</h2><div class="meta">Chaque probabilité vient d’un modèle statistique (loi de Poisson) '
             'entraîné sur les résultats passés. « Sûr » veut dire probabilité d’au moins 70 %, pas certitude. La cote juste vaut '
             '1 / probabilité : un pari n’a d’intérêt que si la cote du bookmaker est nettement supérieure. '
             '⚠ marque un marché non validé par backtest (seuls le résultat 1X2 et la double chance le sont). '
             'Analyse indicative, pas un conseil de pari. Réservé aux adultes. En cas de difficulté avec le jeu : Joueurs Info Service, 09 74 75 13 13 (appel non surtaxé).</div>')
    return intro + _reliability(reliability) + _value()


LAZY = ("hist", "tennis", "basket", "rugby", "handball", "hockey", "baseball", "nfl", "mma")      # données lourdes : un fichier par sport, chargé à l'ouverture du sport


def build_page(models, fixtures, market_probs, generated_at, days, leagues, reliability=None, history=None, external=None, tennis=None, basket=None, rugby=None, handball=None, hockey=None, f1=None, baseball=None, nfl=None, mma=None, artifact=False, lazy_dir=None):
    d = build_data(models, fixtures, market_probs, leagues, history, generated_at, (reliability or {}).get("recent"), (reliability or {}).get("daily"), external, tennis, basket, rugby, handball, hockey, f1, baseball, nfl, mma)
    if lazy_dir and not artifact:
        os.makedirs(lazy_dir, exist_ok=True)
        stamp = f"{generated_at:%Y%m%d%H%M}"
        d["lazy"] = {}
        for key in LAZY:
            with open(os.path.join(lazy_dir, f"{key}.json"), "w", encoding="utf-8") as fh:
                json.dump(d[key], fh, ensure_ascii=False, separators=(",", ":"))
            d[key] = [] if key == "hist" else {}
            d["lazy"][key] = f"data/{key}.json?v={stamp}"
    data = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    head = f'<title>Pronostics Football</title>{FONTS}<style>{_read("style.css")}</style>'
    body = (f'<div id="app"></div>'
            f'<nav id="nav" aria-label="Navigation"></nav>'
            f'<script id="data" type="application/json">{data}</script>'
            f'<template id="info-html">{_info(reliability)}</template>'
            f'<script>{_read("engine.js")}</script><script>{_read("tennis.js")}</script><script>{_read("basket.js")}</script><script>{_read("rugby.js")}</script><script>{_read("hockey.js")}</script><script>{_read("baseball.js")}</script><script>{_read("nfl.js")}</script><script>{_read("mma.js")}</script><script>{_read("app.js")}</script>')
    if artifact:
        return head + body
    desc = "Probabilités et pronostics de 6 championnats de football (modèle statistique). Analyse indicative, pas un conseil de pari."
    meta = (f'<meta name="description" content="{desc}"><meta name="theme-color" content="#070b18"><meta name="color-scheme" content="dark light">'
            f'<meta property="og:title" content="Pronostics football"><meta property="og:description" content="{desc}">'
            f'<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
            f'<meta name="apple-mobile-web-app-title" content="Pronos"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
            f'<link rel="manifest" href="manifest.webmanifest"><link rel="icon" type="image/png" href="icons/icon-192.png">'
            f'<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
            f'<style>:root{{padding-top:env(safe-area-inset-top,0px)}}</style>')
    sw = ("<script>if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) "
          "{window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });}</script>")
    return (f'<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">{meta}{head}</head><body>{body}{sw}</body></html>')
