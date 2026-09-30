"""Bot d'analyse football : met à jour les données, prédit les prochains matchs avec le modèle Poisson,
et affiche, envoie (Telegram) ou publie sous forme de page web les probabilités.

  python bot.py                          # aperçu des matchs des 4 prochains jours (rien n'est envoyé)
  python bot.py --html                   # génère output/index.html (+ artifact.html)
  python bot.py --send                   # envoie sur Telegram (TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID requis)
  python bot.py --match Lyon Marseille   # analyse un match précis (domicile, extérieur), Ligue 1 par défaut
  python bot.py --match Arsenal Chelsea --league E0
  python bot.py --days 7 --no-update
"""
import argparse
import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

import numpy as np

from digest import build_digest
from fixtures_api import fetch_fixtures
from markets import fit_all
from page import build_page
import tracking
from notify import run as run_notify
from poisson import load
from pwa import write_site
from winamax import format_match

BASE_URL = "https://www.football-data.co.uk"
LEAGUES = {"F1": "Ligue 1", "E0": "Premier League", "SP1": "La Liga", "D1": "Bundesliga",
           "I1": "Serie A", "E1": "Championship"}
FIRST_SEASON = 2021                                       # historique utilisé : depuis 2021/22
os.chdir(os.path.dirname(os.path.abspath(__file__)))     # poisson.py lit data/ en chemin relatif


def current_season_start(today):
    return today.year if today.month >= 7 else today.year - 1


def download(url, dest):
    try:
        with urllib.request.urlopen(url, timeout=30) as resp, open(dest, "wb") as fh:
            fh.write(resp.read())
        return True
    except Exception as exc:                     # réseau HS : on continue avec les fichiers locaux
        print(f"[avertissement] téléchargement impossible ({url}) : {exc}", file=sys.stderr)
        return False


def update_data(today):
    """Historique manquant + saison en cours (toujours rafraîchie) pour chaque championnat, et calendrier."""
    os.makedirs("data", exist_ok=True)
    cur = current_season_start(today)
    for div in LEAGUES:
        for y in range(FIRST_SEASON, cur + 1):
            code = f"{y % 100:02d}{(y + 1) % 100:02d}"
            dest = f"data/{div}_{code}.csv"
            if y == cur or not os.path.exists(dest):
                download(f"{BASE_URL}/mmz4281/{code}/{div}.csv", dest)
    download(f"{BASE_URL}/fixtures.csv", "data/fixtures.csv")


def upcoming(today, days):
    """Matchs des championnats suivis dans les `days` prochains jours (fixtures.csv)."""
    out = []
    start = today.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=days)
    try:
        with open("data/fixtures.csv", encoding="utf-8-sig", newline="") as fh:
            for r in csv.DictReader(fh):
                if r.get("Div") not in LEAGUES:
                    continue
                d = datetime.strptime(r["Date"], "%d/%m/%Y")
                if start <= d <= end:
                    r["Date"] = d
                    out.append(r)
    except FileNotFoundError:
        pass
    return sorted(out, key=lambda r: (r["Div"], r["Date"], r.get("Time", "")))


def get_fixtures(now, days, leagues):
    """Calendrier : fixtures.csv (avec cotes) complété par l'API football-data.org si FOOTBALL_DATA_TOKEN existe."""
    load_env()
    rows = upcoming(now, days)
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    if token:
        have = {(r["Div"], r["HomeTeam"], r["AwayTeam"]) for r in rows}
        api = fetch_fixtures(token, now, days, {d: set(v["teams"]) for d, v in leagues.items()})
        rows += [r for r in api if r["Div"] in leagues and (r["Div"], r["HomeTeam"], r["AwayTeam"]) not in have]
    return sorted(rows, key=lambda r: (r["Div"], r["Date"], r.get("Time", "")))


def market_probs(r):
    try:
        o = np.array([float(r["B365H"]), float(r["B365D"]), float(r["B365A"])])
        return (1 / o) / (1 / o).sum()
    except (KeyError, ValueError, TypeError):
        return None


def build_message(models, fixtures):
    if not fixtures:
        return None
    parts, key = ["Analyses football (modèle Poisson)"], None
    for r in fixtures:
        if (r["Div"], r["Date"]) != key:
            key = (r["Div"], r["Date"])
            parts.append(f"\n== {LEAGUES[r['Div']]} - {r['Date']:%d/%m/%Y} ==")
        parts.append(format_match(models[r["Div"]], r["HomeTeam"], r["AwayTeam"], market_probs(r)))
    parts.append("\n⚠ = marché non validé par backtest (seuls résultat 1X2 et double chance le sont). Cote juste = 1/probabilité : "
                 "un pari n'a d'intérêt que si la cote du bookmaker est nettement supérieure. Analyse indicative, pas un conseil de pari.")
    return "\n".join(parts)


def load_env():
    if os.path.exists(".env"):
        with open(".env", encoding="utf-8") as fh:
            for line in fh:
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ.setdefault(k, v.strip().strip('"'))


def send_telegram(text):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        sys.exit("TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID manquants (variables d'environnement ou fichier .env).")
    chunks, cur = [], ""
    for line in text.split("\n"):                # Telegram limite à 4096 caractères par message
        if len(cur) + len(line) + 1 > 3800:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        data = urllib.parse.urlencode({"chat_id": chat, "text": c}).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data)
        with urllib.request.urlopen(req, timeout=30) as resp:
            if not json.load(resp).get("ok"):
                sys.exit("Échec d'envoi Telegram.")
    print(f"Envoyé ({len(chunks)} message(s)).")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--send", action="store_true", help="envoyer sur Telegram au lieu d'afficher")
    ap.add_argument("--days", type=int, default=7, help="fenêtre glissante de matchs à venir (défaut 7 jours : aujourd'hui + 6)")
    ap.add_argument("--match", nargs=2, metavar=("DOM", "EXT"), help="analyser un match précis")
    ap.add_argument("--league", default="F1", choices=list(LEAGUES), help="championnat pour --match (défaut F1)")
    ap.add_argument("--html", action="store_true", help="générer la page web output/index.html")
    ap.add_argument("--digest-date", metavar="AAAA-MM-JJ", help="test : générer le mail du matin comme si on était à cette date")
    ap.add_argument("--notify", action="store_true", help="envoyer les notifications ntfy (NTFY_TOPIC requis)")
    ap.add_argument("--notify-dry", action="store_true", help="afficher les notifications sans les envoyer")
    ap.add_argument("--backtest", action="store_true", help="recalculer le backtest de précision (long : ~20 min)")
    ap.add_argument("--no-update", action="store_true", help="ne pas télécharger les données")
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    now = datetime.now()
    if not args.no_update:
        update_data(now)
    if args.backtest:
        tracking.run_backtest(list(LEAGUES))
        return
    wanted = list(LEAGUES) if args.html or not args.match else [args.league]
    models, leagues, dfs = {}, {}, {}
    for div in wanted:
        df = load(div)
        if not df:
            print(f"[avertissement] pas de données pour {LEAGUES[div]}", file=sys.stderr)
            continue
        models[div] = fit_all(df, now)
        dfs[div] = df
        cur = df[-1]["season"]
        leagues[div] = dict(name=LEAGUES[div],
                            teams=sorted({t for r in df if r["season"] == cur for t in (r["HomeTeam"], r["AwayTeam"])}))
        print(f"{LEAGUES[div]} : modèle entraîné sur {len(df)} matchs (dernier : {df[-1]['Date']:%d/%m/%Y}).", file=sys.stderr)

    if args.html:
        os.makedirs("output", exist_ok=True)
        rows_by_div = {d: {(r["Date"], r["HomeTeam"], r["AwayTeam"]): r for r in dfs[d]} for d in dfs}
        settled = tracking.settle(models, now, rows_by_div)              # vérifie les pronostics des matchs terminés
        fixtures = get_fixtures(now, args.days, leagues)
        if not fixtures:                                                 # trêve : on montre les prochaines rencontres (14 jours)
            fixtures = get_fixtures(now, 14, leagues)
        tracking.record(fixtures, models, now)                           # enregistre ceux des matchs à venir
        print(f"Suivi : {settled} match(s) vérifié(s), {len(fixtures)} match(s) à venir enregistré(s).", file=sys.stderr)
        page_args = (models, fixtures, market_probs, now, args.days, leagues, tracking.reliability_data(), dfs)
        with open("output/index.html", "w", encoding="utf-8") as fh:
            fh.write(build_page(*page_args))
        with open("output/artifact.html", "w", encoding="utf-8") as fh:      # version prête à publier (sans squelette HTML)
            fh.write(build_page(*page_args, artifact=True))
        write_site("output")                                             # manifeste, icônes, service worker (application installable)
        print(f"Page générée : {os.path.abspath('output/index.html')}")
        if args.notify or args.notify_dry:
            n_now = datetime.strptime(args.digest_date, "%Y-%m-%d").replace(hour=6) if args.digest_date else now   # --digest-date : simulation
            run_notify(models, fixtures, n_now, leagues, dry=args.notify_dry)
        d_now = datetime.strptime(args.digest_date, "%Y-%m-%d").replace(hour=9) if args.digest_date else now
        digest = build_digest(models, fixtures, d_now, leagues, page_args[6])          # mail du matin (s'il y a des matchs aujourd'hui)
        if digest:
            with open("output/digest.txt", "w", encoding="utf-8") as fh:
                fh.write("SUJET: " + digest[0] + chr(10) + chr(10) + digest[1])
            with open("output/digest.html", "w", encoding="utf-8") as fh:
                fh.write(digest[2])
            print(f"Mail du matin prêt : {digest[0]}")
        elif os.path.exists("output/digest.txt"):
            for f in ("output/digest.txt", "output/digest.html"):
                if os.path.exists(f):
                    os.remove(f)
            print("Pas de match aujourd'hui : aucun mail.")
        return
    if args.match:
        msg = format_match(models[args.league], *args.match)
    else:
        msg = build_message(models, get_fixtures(now, args.days, leagues))
        if msg is None:
            print(f"Aucun match dans les {args.days} prochains jours (fixtures.csv). Rien à envoyer.")
            return
    if args.send:
        load_env()
        send_telegram(msg)
    else:
        print(msg)


if __name__ == "__main__":
    main()
