"""Notifications sur le téléphone via ntfy.sh (gratuit, sans compte : on s'abonne à un « sujet » secret dans l'appli ntfy).
  - un résumé le matin s'il y a des matchs aujourd'hui ;
  - une alerte 45 min avant chaque match à haute confiance des prochaines 24 h (programmée chez ntfy avec « delay »).
Le nom du sujet (NTFY_TOPIC) joue le rôle de mot de passe : ne pas le publier."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

from digest import _conf, _pct, _rows, yesterday_summary
from blend import lams as blend_lams
from winamax import families

NTFY_URL = "https://ntfy.sh/"
ALERT_MINUTES = 45
MAX_ALERTS = 8


def paris_ts(d, hhmm):
    """Timestamp Unix d'un coup d'envoi donné en heure de Paris (date = datetime, hhmm = « 20:45 »)."""
    h, m = (int(x) for x in (hhmm or "00:00").split(":"))
    naive = datetime(d.year, d.month, d.day, h, m)
    try:
        from zoneinfo import ZoneInfo
        return int(naive.replace(tzinfo=ZoneInfo("Europe/Paris")).timestamp())
    except Exception:                                      # pas de base de fuseaux : heure d'été approximative (mars à octobre)
        off = 2 if 3 <= d.month <= 10 else 1
        return int(naive.replace(tzinfo=timezone(timedelta(hours=off))).timestamp())


def build(models, fixtures, now, leagues, site_url):
    """-> liste de messages ntfy (dicts JSON sans le sujet)."""
    msgs = []
    rows = _rows(models, fixtures, now.date(), leagues)
    if rows:
        high = sum(1 for x in rows if _conf(x["pf"]) == "high")
        top = "\n".join(f"{x['time']} {x['home']} – {x['away']} : {x['fav']} {_pct(x['pf'])}" for x in rows[:3])
        y = yesterday_summary(f"{now - timedelta(days=1):%Y-%m-%d}")
        if y:
            top += f"\nHier : {y[2]}/{y[1]} pronostics sûrs gagnés"
        msgs.append(dict(title=f"Pronostics du {now:%d/%m} : {len(rows)} match{'s' if len(rows) > 1 else ''}, {high} à haute confiance",
                         message=top, priority=3, tags=["soccer"], **({"click": site_url} if site_url else {})))
    # alertes avant coup d'envoi : matchs à haute confiance qui commencent dans les prochaines 24 h
    t0, horizon = now.timestamp(), now.timestamp() + 24 * 3600
    alerts = []
    for r in fixtures:
        div, home, away = r["Div"], r["HomeTeam"], r["AwayTeam"]
        if home not in models[div]["goals"]["idx"] or away not in models[div]["goals"]["idx"]:
            continue
        ko = paris_ts(r["Date"], r.get("Time"))
        fire = ko - ALERT_MINUTES * 60
        if not (t0 + 600 < fire < horizon):
            continue
        fams, _ = families(models[div], home, away, blend_lams(models[div], r))
        res = next(f for f in fams if f["name"] == "Résultat du match")["sels"]
        fav, pf = max(res.items(), key=lambda kv: kv[1])
        if _conf(pf) == "high":
            alerts.append((pf, fire, r, fav))
    for pf, fire, r, fav in sorted(alerts, key=lambda a: -a[0])[:MAX_ALERTS]:
        msgs.append(dict(title=f"Dans {ALERT_MINUTES} min : {r['HomeTeam']} – {r['AwayTeam']}",
                         message=f"{leagues[r['Div']]['name']} · {fav} {_pct(pf)} (haute confiance)", priority=4,
                         tags=["soccer", "fire"], delay=str(fire), **({"click": site_url} if site_url else {})))
    return msgs


SPORT_ICONS = {"tennis": "🎾", "basket": "🏀", "rugby": "🏉", "handball": "🤾", "hockey": "🏒", "baseball": "⚾", "nfl": "🏈", "mma": "🥋", "volley": "🏐"}
SPORT_TAGS = {"tennis": "tennis", "basket": "basketball", "rugby": "rugby_football", "handball": "handball", "hockey": "ice_hockey", "baseball": "baseball",
              "nfl": "football", "mma": "boxing_glove", "volley": "volleyball"}
MAX_EXTRA_ALERTS = 8
EXTRA_MIN_FAV = 0.72                # favori net : probabilité du vainqueur d'au moins 72 %


def _paris_date(now):
    """Date (Paris) du moment `now` (heure locale de la machine)."""
    from tennis import paris
    return paris(datetime.fromtimestamp(now.timestamp(), timezone.utc).replace(tzinfo=None)).date()


def _fav(it):
    """(nom du favori, probabilité) d'un match de n'importe quel sport (p scalaire = victoire du premier, ou liste 1 / N / 2)."""
    p = it["p"]
    h, a = (p[0], p[2]) if isinstance(p, list) else (p, 1 - p)
    return (it.get("home") or it.get("a"), h) if h >= a else (it.get("away") or it.get("b"), a)


def build_extra(sports, now, site_url):
    """Notifications des autres sports : un résumé du matin (pronostics les plus sûrs du jour) et des alertes avant les favoris nets."""
    msgs = []
    today = _paris_date(now).isoformat()
    tomorrow = (_paris_date(now) + timedelta(days=1)).isoformat()
    picks, n_matches, alerts = [], 0, []
    t0, horizon = now.timestamp(), now.timestamp() + 24 * 3600
    for key, data in (sports or {}).items():
        icon = SPORT_ICONS.get(key)
        for it in (data or {}).get("matches", []):
            if not icon or it.get("state") != "pre" or not it.get("known") or it["date"] not in (today, tomorrow):
                continue
            home, away = it.get("home") or it.get("a"), it.get("away") or it.get("b")
            if it["date"] == today:
                n_matches += 1
                for r in it.get("safe", [])[:2]:
                    picks.append((r["p"], f"{icon} {it['time']} {home} – {away} : {r['s']} ({_pct(r['p'])})"))
            name, pf = _fav(it)
            fire = paris_ts(datetime.strptime(it["date"], "%Y-%m-%d"), it["time"]) - ALERT_MINUTES * 60
            if pf >= EXTRA_MIN_FAV and t0 + 600 < fire < horizon:
                alerts.append((pf, fire, key, icon, home, away, name))
    if picks:
        picks.sort(key=lambda x: -x[0])
        msgs.append(dict(title=f"Autres sports aujourd'hui : {n_matches} match{'s' if n_matches > 1 else ''}, {len(picks)} pronostics sûrs",
                         message=chr(10).join(line for _, line in picks[:5]), priority=3, tags=["tada"], **({"click": site_url} if site_url else {})))
    for pf, fire, key, icon, home, away, name in sorted(alerts, key=lambda a: -a[0])[:MAX_EXTRA_ALERTS]:
        msgs.append(dict(title=f"Dans {ALERT_MINUTES} min : {icon} {home} – {away}", message=f"Favori : {name} {_pct(pf)}", priority=3,
                         tags=[SPORT_TAGS.get(key, "sports"), "fire"], delay=str(fire), **({"click": site_url} if site_url else {})))
    return msgs


def _football_day(day):
    """(pronostics sûrs vérifiés, gagnés, ratés [(proba, texte)]) du football pour le jour `day` (AAAA-MM-JJ), d'après le suivi du site."""
    from digest import TRACK_FILE
    try:
        with open(TRACK_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return 0, 0, []
    n = w = 0
    miss = []
    for m in data["matches"].values():
        if m["date"] != day or not m["settled"]:
            continue
        for p in m["picks"]:
            if p["tier"] != 0 or p.get("hit") is None:
                continue
            n += 1
            w += int(bool(p["hit"]))
            if not p["hit"]:
                miss.append((p["p"], f"⚽ {m['home']} – {m['away']} : {p['sel']} ({_pct(p['p'])})"))
    return n, w, miss


def _day_counts(sports, day):
    """{icône: [pronostics sûrs vérifiés, gagnés]} pour le jour `day` (football d'après le suivi, autres sports d'après leurs matchs terminés)."""
    out = {}
    n, w, _ = _football_day(day)
    if n:
        out["⚽"] = [n, w]
    for key, data in (sports or {}).items():
        icon = SPORT_ICONS.get(key)
        if not icon:
            continue
        sn = sw = 0
        for it in (data or {}).get("matches", []):
            if it.get("state") != "post" or it.get("date") != day:
                continue
            for r in it.get("picks", []):
                if r["t"] == 0 and r.get("h") is not None:
                    sn += 1
                    sw += int(bool(r["h"]))
        if sn:
            out[icon] = [sn, sw]
    return out


def record_days(state, sports, now):
    """Mémorise dans `state` les résultats d'aujourd'hui et d'hier (le plus complet l'emporte), sur 14 jours. -> True si l'état a changé."""
    today = _paris_date(now)
    days, changed = state.setdefault("days", {}), False
    for d in (today, today - timedelta(days=1)):
        key = d.isoformat()
        cnt = _day_counts(sports, key)
        old = days.get(key, {})
        if sum(v[0] for v in cnt.values()) >= sum(v[0] for v in old.values()) and cnt != old:
            days[key], changed = cnt, True
    for k in [k for k in days if k < (today - timedelta(days=14)).isoformat()]:
        del days[k]
        changed = True
    return changed


def build_weekly(state, now, site_url):
    """Résumé des 7 derniers jours (jours enregistrés dans `state`), à envoyer le dimanche soir. [] s'il y a trop peu de pronostics."""
    today = _paris_date(now)
    keys = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    per, by_day = {}, []
    for k in keys:
        cnt = state.get("days", {}).get(k, {})
        dn = sum(v[0] for v in cnt.values())
        dw = sum(v[1] for v in cnt.values())
        if dn:
            by_day.append((k, dn, dw))
        for icon, (sn, sw) in cnt.items():
            a = per.setdefault(icon, [0, 0])
            a[0] += sn
            a[1] += sw
    tn, tw = sum(v[0] for v in per.values()), sum(v[1] for v in per.values())
    if tn < 20:
        return []
    lines = [" · ".join(f"{i} {w}/{n} ({w / n:.0%})" for i, (n, w) in sorted(per.items(), key=lambda kv: -kv[1][0]))]
    ranked = [(i, w / n, n) for i, (n, w) in per.items() if n >= 10]
    if len(ranked) >= 2:
        ranked.sort(key=lambda x: -x[1])
        lines.append(f"Meilleur sport : {ranked[0][0]} {ranked[0][1]:.0%} · à surveiller : {ranked[-1][0]} {ranked[-1][1]:.0%}")
    if by_day:
        best = max(by_day, key=lambda x: x[2] / x[1])
        lines.append(f"Meilleur jour : {datetime.strptime(best[0], '%Y-%m-%d'):%d/%m} ({best[2]}/{best[1]})")
    return [dict(title=f"Semaine du {datetime.strptime(keys[0], '%Y-%m-%d'):%d/%m} au {today:%d/%m} : {tw}/{tn} pronostics sûrs gagnés ({tw / tn:.0%})",
                 message=chr(10).join(lines), priority=3, tags=["calendar"], **({"click": site_url} if site_url else {}))]


def _assistant_day(day, sports):
    """(paris, gagnés) du plan « Équilibré » de l'assistant pour le jour `day` : un pronostic sûr par match, probabilité réduite de 3 points (2 de plus si marché non validé),
    entre 78 % et 93 %, les 4 meilleurs. Le vrai plan de l'appli dépend du profil et du budget, qui restent sur le téléphone : ceci est un repère."""
    from digest import TRACK_FILE
    cands = {}

    def add(key, pa, p, hit):
        if pa >= 0.78 and p <= 0.93 and (key not in cands or pa > cands[key][0]):
            cands[key] = (pa, bool(hit))
    try:
        with open(TRACK_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
        for m in data["matches"].values():
            if m["date"] != day or not m["settled"]:
                continue
            for p in m["picks"]:
                if p["tier"] == 0 and p.get("hit") is not None:
                    add(f"F|{m['home']}|{m['away']}", p["p"] - 0.03 - (0 if p.get("validated") else 0.02), p["p"], p["hit"])
    except (OSError, ValueError):
        pass
    for key, d in (sports or {}).items():
        for it in (d or {}).get("matches", []):
            if it.get("state") != "post" or it.get("date") != day:
                continue
            for r in it.get("picks", []):
                if r["t"] == 0 and r.get("h") is not None:
                    add(f"{key}|{it.get('id')}", r["p"] - 0.05, r["p"], r["h"])
    top = sorted(cands.values(), key=lambda x: -x[0])[:4]
    return len(top), sum(1 for _, h in top if h)


def build_evening(sports, now, site_url):
    """Bilan du soir : pronostics sûrs gagnés aujourd'hui (tous sports), par sport, et les plus gros ratés. [] s'il y en a trop peu."""
    day = _paris_date(now).isoformat()
    per, miss = [], []
    n, w, ms = _football_day(day)
    if n:
        per.append(("⚽", n, w))
        miss += ms
    for key, data in (sports or {}).items():
        icon = SPORT_ICONS.get(key)
        sn = sw = 0
        for it in (data or {}).get("matches", []):
            if not icon or it.get("state") != "post" or it.get("date") != day:
                continue
            home, away = it.get("home") or it.get("a"), it.get("away") or it.get("b")
            for r in it.get("picks", []):
                if r["t"] != 0 or r.get("h") is None:
                    continue
                sn += 1
                sw += int(bool(r["h"]))
                if not r["h"]:
                    miss.append((r["p"], f"{icon} {home} – {away} : {r['s']} ({_pct(r['p'])})"))
        if sn:
            per.append((icon, sn, sw))
    tn, tw = sum(p[1] for p in per), sum(p[2] for p in per)
    if tn < 5:
        return []
    lines = [" · ".join(f"{i} {w_}/{n_}" for i, n_, w_ in per)]
    an, aw = _assistant_day(day, sports)
    if an >= 2:
        lines.append(f"🤖 Assistant (profil Équilibré) : {aw}/{an} paris conseillés gagnés")
    miss.sort(key=lambda x: -x[0])
    if miss:
        lines.append("Plus gros ratés :")
        lines += [t for _, t in miss[:3]]
    return [dict(title=f"Bilan du {_paris_date(now):%d/%m} : {tw}/{tn} pronostics sûrs gagnés ({tw / tn:.0%})", message=chr(10).join(lines),
                 priority=3, tags=["chart_with_upwards_trend"], **({"click": site_url} if site_url else {}))]


def run_evening(now, sports, dry=False, state=None):
    """Bilan du soir ; le dimanche, s'ajoute le résumé de la semaine (une fois par semaine, mémorisé dans state["weekly"])."""
    topic = os.environ.get("NTFY_TOPIC", "")
    if not topic and not dry:
        print("[notif] NTFY_TOPIC absent : aucune notification envoyée.", file=sys.stderr)
        return False
    site = os.environ.get("SITE_URL", "")
    msgs = build_evening(sports, now, site)
    if state is not None and _paris_date(now).weekday() == 6 and state.get("weekly") != _paris_date(now).isoformat():
        weekly = build_weekly(state, now, site)
        if weekly:
            msgs += weekly
            state["weekly"] = _paris_date(now).isoformat()
    send(msgs, topic, dry)
    return bool(msgs)


def send(msgs, topic, dry=False):
    for m in msgs:
        when = f" (programmée {datetime.fromtimestamp(int(m['delay']), timezone.utc):%d/%m %H:%M} UTC)" if "delay" in m else ""
        print(f"[notif] {m['title']}{when}")
        if dry:
            continue
        body = json.dumps(dict(topic=topic, **m), ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(NTFY_URL, body, {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp.read()
        except Exception as exc:
            print(f"[avertissement] envoi ntfy impossible : {exc}", file=sys.stderr)


def run(models, fixtures, now, leagues, dry=False, sports=None):
    topic = os.environ.get("NTFY_TOPIC", "")
    if not topic and not dry:
        print("[notif] NTFY_TOPIC absent : aucune notification envoyée.", file=sys.stderr)
        return
    site = os.environ.get("SITE_URL", "")
    send(build(models, fixtures, now, leagues, site) + build_extra(sports, now, site), topic, dry)
