"""Mail du matin : les matchs du jour, du plus au moins confiant, avec le bilan de la veille.
Deux versions du même contenu : texte brut et HTML (styles en ligne, tableaux : c'est ce que les clients mail acceptent)."""
import json
import os
from datetime import timedelta
from html import escape

from winamax import SAFE_MIN, classify, families

TRACK_FILE = "data/tracking.json"
PAGE_URL = os.environ.get("SITE_URL") or "https://claude.ai/artifact/2eTvArh79uNHxft6KgJCZK"
CONF = {"high": "haute confiance", "mid": "confiance moyenne", "low": "match ouvert"}
CONF_COLOR = {"high": ("#1f9d63", "#ffffff"), "mid": ("#f6ad3a", "#3b2600"), "low": ("#4f8cff", "#ffffff")}
DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
MAX_MATCHES = 6


def _conf(p):
    return "high" if p >= 0.6 else "mid" if p >= 0.45 else "low"


def yesterday_summary(day):
    """(matchs, pronostics sûrs vérifiés, gagnés) pour les matchs terminés à la date `day` (AAAA-MM-JJ)."""
    try:
        with open(TRACK_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, ValueError):
        return None
    ms = [m for m in data["matches"].values() if m["date"] == day and m["settled"]]
    picks = [p for m in ms for p in m["picks"] if p["tier"] == 0 and p.get("hit") is not None]
    if not picks:
        return None
    return len(ms), len(picks), sum(1 for p in picks if p["hit"])


def _pct(x):
    return f"{x:.0%}"


def _rows(models, fixtures, today, leagues):
    rows = []
    for r in fixtures:
        div, home, away = r["Div"], r["HomeTeam"], r["AwayTeam"]
        idx = models[div]["goals"]["idx"]
        if r["Date"].date() != today or home not in idx or away not in idx:
            continue
        fams, _ = families(models[div], home, away)
        by = {f["name"]: f["sels"] for f in fams}
        res = by["Résultat du match"]
        fav, pf = max(res.items(), key=lambda kv: kv[1])
        safe, _ = classify(fams)
        rows.append(dict(time=r.get("Time", ""), league=leagues[div]["name"], home=home, away=away, fav=fav, pf=pf,
                         p3=list(res.values()), over=by["Total buts (plus)"]["Plus de 2,5 buts"],
                         btts=by["Les deux équipes marquent"]["Oui"], safe=safe[:3]))
    rows.sort(key=lambda x: -x["pf"])
    return rows


def _plural(n, word):
    return f"{n} {word}{'s' if n > 1 else ''}"


# ---------------------------------------------------------------- texte brut
def _text(rows, now, high, y, bt):
    lines = ["Bonjour,", "", f"Aujourd'hui : {_plural(len(rows), 'match')} analysé{'s' if len(rows) > 1 else ''}, "
                                    f"{high} à haute confiance. Du plus au moins confiant :", ""]
    for i, x in enumerate(rows[:MAX_MATCHES], 1):
        lines.append(f"{i}) {x['time']} · {x['league']} · {x['home']} - {x['away']}")
        lines.append(f"   Favori : {x['fav']} {_pct(x['pf'])} ({CONF[_conf(x['pf'])]})")
        lines.append(f"   Plus de 2,5 buts : {_pct(x['over'])} | Les deux marquent : {_pct(x['btts'])}")
        if x["safe"]:
            lines.append("   Sûrs : " + " ; ".join(f"{m + ' ' if s in ('Oui', 'Non') else ''}{s} ({_pct(p)})" for m, s, p, _ in x["safe"]))
        lines.append("")
    if len(rows) > MAX_MATCHES:
        lines += [f"... et {len(rows) - MAX_MATCHES} autre(s) match(s) sur la page.", ""]
    if y:
        lines += [f"Bilan d'hier : {y[2]} pronostics sûrs gagnés sur {y[1]} ({y[2] / y[1]:.0%}), {y[0]} match(s) terminé(s).", ""]
    if bt:
        n = f"{bt['total']['n']:,}".replace(",", " ")
        lines += [f"Repère (backtest sur {n} pronostics) : les pronostics « sûrs » (≥ {SAFE_MIN:.0%}) ont été gagnés "
                  f"{bt['safe']['hit']:.0%} du temps, pour {bt['safe']['p']:.0%} annoncé.", ""]
    lines += [f"Page complète (fiches, analyse libre, fiabilité) : {PAGE_URL}", "",
              "Analyse statistique indicative, pas un conseil de pari : le test de rentabilité montre que ce modèle ne bat pas les bookmakers. "
              "Si tu paries, ne mise que ce que tu peux perdre (Joueurs Info Service : 09 74 75 13 13)."]
    return "\n".join(lines)


# ---------------------------------------------------------------- HTML
FONT = "font-family:Arial,Helvetica,sans-serif"


def _bar(p3):
    w = [max(1, round(p * 100)) for p in p3]
    cells = "".join(f'<td width="{x}%" height="8" bgcolor="{c}" style="font-size:0;line-height:0;background:{c}">&nbsp;</td>'
                    for x, c in zip(w, ("#1f9d63", "#9aa3b8", "#e0524a")))
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:4px"><tr>{cells}</tr></table>'


def _card(i, x):
    conf = _conf(x["pf"])
    bg, fg = CONF_COLOR[conf]
    safe = "".join(
        f'<tr><td style="{FONT};font-size:14px;color:#2a3350;padding:3px 0">{escape((m + " ") if s in ("Oui", "Non") else "")}{escape(s)}</td>'
        f'<td align="right" style="{FONT};font-size:14px;font-weight:bold;color:#1f9d63;padding:3px 0 3px 12px;white-space:nowrap">{_pct(p)}</td></tr>'
        for m, s, p, _ in x["safe"])
    safe_block = (f'<div style="{FONT};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7590;margin:14px 0 4px">Pronostics sûrs</div>'
                  f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{safe}</table>') if safe else ""
    p3 = x["p3"]
    return (
        f'<tr><td style="background:#ffffff;padding:18px 24px;border-top:1px solid #e3e7f1">'
        f'<div style="{FONT};font-size:12px;color:#6b7590">{i}. {escape(x["time"])} &middot; {escape(x["league"])}</div>'
        f'<div style="{FONT};font-size:18px;font-weight:bold;color:#121729;margin:4px 0 10px">{escape(x["home"])} &ndash; {escape(x["away"])}</div>'
        f'<span style="{FONT};display:inline-block;background:{bg};color:{fg};font-size:12px;font-weight:bold;padding:5px 10px;border-radius:8px">'
        f'{escape(x["fav"])} {_pct(x["pf"])} &middot; {CONF[conf]}</span>'
        f'<div style="margin:12px 0 4px">{_bar(p3)}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="{FONT};font-size:12px;color:#1f9d63;font-weight:bold">1 &middot; {_pct(p3[0])}</td>'
        f'<td align="center" style="{FONT};font-size:12px;color:#6b7590;font-weight:bold">X &middot; {_pct(p3[1])}</td>'
        f'<td align="right" style="{FONT};font-size:12px;color:#e0524a;font-weight:bold">2 &middot; {_pct(p3[2])}</td></tr></table>'
        f'<div style="{FONT};font-size:13px;color:#2a3350;margin-top:10px">Plus de 2,5 buts <b>{_pct(x["over"])}</b>'
        f' &nbsp;&middot;&nbsp; Les deux marquent <b>{_pct(x["btts"])}</b></div>'
        f'{safe_block}</td></tr>')


def _info_box(text):
    return (f'<tr><td style="background:#ffffff;padding:0 24px 16px"><div style="{FONT};font-size:13px;color:#2a3350;background:#f1f4fa;'
            f'border-radius:10px;padding:12px 14px">{text}</div></td></tr>')


def _html(rows, now, high, y, bt):
    date = f"{DAYS[now.weekday()].capitalize()} {now.day} {MONTHS[now.month - 1]}"
    cards = "".join(_card(i, x) for i, x in enumerate(rows[:MAX_MATCHES], 1))
    more = (f'<tr><td style="background:#ffffff;padding:4px 24px 18px;{FONT};font-size:13px;color:#6b7590;border-top:1px solid #e3e7f1">'
            f'&hellip; et {len(rows) - MAX_MATCHES} autre(s) match(s) sur la page.</td></tr>') if len(rows) > MAX_MATCHES else ""
    boxes = ""
    if y:
        boxes += _info_box(f"<b>Bilan d&rsquo;hier</b> : {y[2]} pronostics s&ucirc;rs gagn&eacute;s sur {y[1]} ({y[2] / y[1]:.0%}), {y[0]} match(s) termin&eacute;(s).")
    if bt:
        n = f"{bt['total']['n']:,}".replace(",", "&nbsp;")
        boxes += _info_box(f"<b>Rep&egrave;re</b> : sur {n} pronostics test&eacute;s dans le pass&eacute;, ceux class&eacute;s &laquo;&nbsp;s&ucirc;rs&nbsp;&raquo; "
                           f"(&ge;&nbsp;{SAFE_MIN:.0%}) ont &eacute;t&eacute; gagn&eacute;s <b>{bt['safe']['hit']:.0%}</b> du temps, pour {bt['safe']['p']:.0%} annonc&eacute;.")
    button = (f'<tr><td align="center" style="background:#ffffff;padding:8px 24px 24px"><a href="{PAGE_URL}" style="{FONT};display:inline-block;'
              f'background:#f6ad3a;color:#3b2600;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px">'
              f'Ouvrir la page compl&egrave;te</a><div style="{FONT};font-size:12px;color:#6b7590;margin-top:8px">'
              f'fiches d&eacute;taill&eacute;es, analyse libre, fiabilit&eacute;</div></td></tr>')
    footer = (f'<tr><td style="background:#e9edf6;padding:16px 24px;border-radius:0 0 14px 14px;{FONT};font-size:11px;line-height:1.5;color:#6b7590">'
              f'Analyse statistique indicative, pas un conseil de pari : le test de rentabilit&eacute; montre que ce mod&egrave;le ne bat pas les bookmakers. '
              f'Si tu paries, ne mise que ce que tu peux perdre (Joueurs Info Service&nbsp;: 09&nbsp;74&nbsp;75&nbsp;13&nbsp;13).</td></tr>')
    return (
        f'<div style="background:#dfe4f0;padding:20px 8px;{FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">'
        f'<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">'
        f'<tr><td style="background:#0b1020;padding:24px;border-radius:14px 14px 0 0">'
        f'<div style="{FONT};font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#8f9ab8">Pronostics football</div>'
        f'<div style="{FONT};font-size:24px;font-weight:bold;color:#ffffff;margin:4px 0">{date}</div>'
        f'<div style="{FONT};font-size:14px;color:#f6ad3a">{_plural(len(rows), "match")} analys&eacute;{"s" if len(rows) > 1 else ""} &middot; '
        f'{high} &agrave; haute confiance</div></td></tr>'
        f'{cards}{more}{boxes}{button}{footer}</table></td></tr></table></div>')


def build_digest(models, fixtures, now, leagues, reliability=None):
    """-> (sujet, texte, html) ou None s'il n'y a aucun match aujourd'hui."""
    today = now.date()
    rows = _rows(models, fixtures, today, leagues)
    if not rows:
        return None
    high = sum(1 for x in rows if _conf(x["pf"]) == "high")
    subject = f"Pronostics du {now:%d/%m} : {_plural(len(rows), 'match')}, {high} à haute confiance"
    y = yesterday_summary(f"{today - timedelta(days=1):%Y-%m-%d}")
    bt = reliability["bt"] if reliability and reliability.get("bt") else None
    return subject, _text(rows, now, high, y, bt), _html(rows, now, high, y, bt)
