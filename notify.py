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
        fams, _ = families(models[div], home, away)
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
