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

from apifootball import external_matches
import baseball
import basket
import f1
import handball
import golf
import hockey
import volleyball
import mma
import nfl
import rugby
import tennis
from digest import build_digest
from fixtures_api import fetch_fixtures, fetch_espn, fixtures_from_ext
from markets import fit_all
from page import build_page
import tracking
from notify import run as run_notify, run_evening, record_days
from results import update as results_update
from poisson import NEW_FORMAT, load
from pwa import write_site
from winamax import format_match

BASE_URL = "https://www.football-data.co.uk"
LEAGUES = {"F1": "Ligue 1", "E0": "Premier League", "SP1": "La Liga", "D1": "Bundesliga",
           "I1": "Serie A", "E1": "Championship", "BRA": "Brasileirão",
           "F2": "Ligue 2", "D2": "2. Bundesliga", "I2": "Serie B", "SP2": "La Liga 2", "N1": "Eredivisie", "B1": "Pro League (Belgique)",
           "P1": "Liga Portugal", "T1": "Süper Lig", "G1": "Super League (Grèce)", "SC0": "Premiership (Écosse)",
           "USA": "MLS", "MEX": "Liga MX", "ARG": "Primera División (Argentine)", "JPN": "J1 League", "NOR": "Eliteserien", "SWE": "Allsvenskan",
           "DNK": "Superliga (Danemark)", "POL": "Ekstraklasa", "ROU": "SuperLiga (Roumanie)", "SWZ": "Super League (Suisse)", "FIN": "Veikkausliiga",
           "IRL": "Premier Division (Irlande)"}
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
        if div in NEW_FORMAT:                                    # un seul fichier, mis à jour chaque jour
            download(f"{BASE_URL}/new/{NEW_FORMAT[div][0]}", f"data/{NEW_FORMAT[div][0]}")
            continue
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


def get_fixtures(now, days, leagues, ext=None):
    """Calendrier : fixtures.csv (avec cotes) complété par l'API football-data.org si FOOTBALL_DATA_TOKEN existe."""
    load_env()
    rows = upcoming(now, days)
    token = os.environ.get("FOOTBALL_DATA_TOKEN")
    if token:
        have = {(r["Div"], r["HomeTeam"], r["AwayTeam"]) for r in rows}
        api = fetch_fixtures(token, now, days, {d: set(v["teams"]) for d, v in leagues.items()})
        rows += [r for r in api if r["Div"] in leagues and (r["Div"], r["HomeTeam"], r["AwayTeam"]) not in have]
    have = {(r["Div"], r["HomeTeam"], r["AwayTeam"]) for r in rows}                 # championnats absents de l'offre gratuite : calendrier ESPN
    rows += [r for r in fetch_espn(now, days, {d: set(v["teams"]) for d, v in leagues.items()}) if (r["Div"], r["HomeTeam"], r["AwayTeam"]) not in have]
    have = {(r["Div"], r["HomeTeam"], r["AwayTeam"]) for r in rows}
    rows += [r for r in fixtures_from_ext(ext, now, days, {d: set(v["teams"]) for d, v in leagues.items()}) if (r["Div"], r["HomeTeam"], r["AwayTeam"]) not in have]
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


def tennis_data(now):
    """Pronostics tennis (modèle Elo + calendrier ESPN) ; une panne ne doit pas empêcher de publier le football."""
    try:
        return tennis.build(now)
    except Exception as exc:
        print(f"[avertissement] tennis indisponible : {exc}", file=sys.stderr)
        return {}


def volley_data(now):
    """Pronostics volley-ball (API-Sports, offre gratuite) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return volleyball.build(now)
    except Exception as exc:
        print(f"[avertissement] volley-ball indisponible : {exc}", file=sys.stderr)
        return {}


def golf_data(now):
    """Pronostics golf (PGA, DP World Tour, LPGA) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return golf.build(now)
    except Exception as exc:
        print(f"[avertissement] golf indisponible : {exc}", file=sys.stderr)
        return {}


def mma_data(now):
    """Pronostics MMA (UFC) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return mma.build(now)
    except Exception as exc:
        print(f"[avertissement] MMA indisponible : {exc}", file=sys.stderr)
        return {}


def nfl_data(now):
    """Pronostics football américain (NFL) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return nfl.build(now)
    except Exception as exc:
        print(f"[avertissement] NFL indisponible : {exc}", file=sys.stderr)
        return {}


def baseball_data(now):
    """Pronostics baseball (MLB) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return baseball.build(now)
    except Exception as exc:
        print(f"[avertissement] baseball indisponible : {exc}", file=sys.stderr)
        return {}


def hockey_data(now):
    """Pronostics hockey sur glace (NHL) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return hockey.build(now)
    except Exception as exc:
        print(f"[avertissement] hockey indisponible : {exc}", file=sys.stderr)
        return {}


def f1_data(now):
    """Pronostics Formule 1 ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return f1.build(now)
    except Exception as exc:
        print(f"[avertissement] F1 indisponible : {exc}", file=sys.stderr)
        return {}


def handball_data(now):
    """Pronostics handball (API-Sports, offre gratuite) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return handball.build(now)
    except Exception as exc:
        print(f"[avertissement] handball indisponible : {exc}", file=sys.stderr)
        return {}


def rugby_data(now):
    """Pronostics rugby à XV (Top 14, Premiership, URC) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return rugby.build(now)
    except Exception as exc:
        print(f"[avertissement] rugby indisponible : {exc}", file=sys.stderr)
        return {}


def basket_data(now):
    """Pronostics basket (NBA, EuroLeague) ; une panne ne doit pas empêcher de publier le reste."""
    try:
        return basket.build(now)
    except Exception as exc:
        print(f"[avertissement] basket indisponible : {exc}", file=sys.stderr)
        return {}


def load_env():
    if os.path.exists(".env"):
        with open(".env", encoding="utf-8-sig") as fh:
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
    ap.add_argument("--days", type=int, default=5, help="fenêtre glissante de matchs à venir (défaut : aujourd'hui + 5 jours)")
    ap.add_argument("--match", nargs=2, metavar=("DOM", "EXT"), help="analyser un match précis")
    ap.add_argument("--league", default="F1", choices=list(LEAGUES), help="championnat pour --match (défaut F1)")
    ap.add_argument("--html", action="store_true", help="générer la page web output/index.html")
    ap.add_argument("--digest-date", metavar="AAAA-MM-JJ", help="test : générer le mail du matin comme si on était à cette date")
    ap.add_argument("--notify", action="store_true", help="envoyer les notifications ntfy (NTFY_TOPIC requis)")
    ap.add_argument("--notify-dry", action="store_true", help="afficher les notifications sans les envoyer")
    ap.add_argument("--notify-evening", action="store_true", help="envoie le bilan du soir une seule fois par jour (entre 20 h et 23 h UTC), si pas déjà parti")
    ap.add_argument("--notify-morning", action="store_true", help="envoie les notifications du matin une seule fois par jour (entre 4 h et 10 h), si elles ne sont pas déjà parties")
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
        ext = external_matches(now)
        fixtures = get_fixtures(now, args.days, leagues, ext)
        tracking.record(fixtures, models, now)                           # enregistre ceux des matchs à venir
        print(f"Suivi : {settled} match(s) vérifié(s), {len(fixtures)} match(s) à venir enregistré(s).", file=sys.stderr)
        page_args = (models, fixtures, market_probs, now, args.days, leagues, tracking.reliability_data(), dfs, ext, tennis_data(now), basket_data(now), rugby_data(now), handball_data(now), hockey_data(now), f1_data(now), baseball_data(now), nfl_data(now), mma_data(now), golf_data(now), volley_data(now))
        esports = dict(zip(("tennis", "basket", "rugby", "handball", "hockey"), (page_args[9], page_args[10], page_args[11], page_args[12], page_args[13])))
        esports.update(baseball=page_args[15], nfl=page_args[16], mma=page_args[17], volley=page_args[19])
        res = results_update(now, esports)                               # résultats de nos pronostics (14 jours) : règlement automatique de « Mes paris »
        with open("output/index.html", "w", encoding="utf-8") as fh:
            fh.write(build_page(*page_args, lazy_dir="output/data", res=res))
        with open("output/artifact.html", "w", encoding="utf-8") as fh:      # version prête à publier (sans squelette HTML)
            fh.write(build_page(*page_args, artifact=True, res=res))
        write_site("output")                                             # manifeste, icônes, service worker (application installable)
        print(f"Page générée : {os.path.abspath('output/index.html')}")
        state_path, state = "data/notify_state.json", {}
        try:
            with open(state_path, encoding="utf-8") as fh:
                state = json.load(fh)
        except (OSError, ValueError):
            pass
        morning_due = args.notify_morning and 4 <= now.hour <= 10 and state.get("date") != f"{now:%Y-%m-%d}"
        if args.notify or args.notify_dry or morning_due:
            n_now = datetime.strptime(args.digest_date, "%Y-%m-%d").replace(hour=6) if args.digest_date else now   # --digest-date : simulation
            sports = dict(zip(("tennis", "basket", "rugby", "handball", "hockey"), (page_args[9], page_args[10], page_args[11], page_args[12], page_args[13])))
            sports.update(baseball=page_args[15], nfl=page_args[16], mma=page_args[17], volley=page_args[19])
            run_notify(models, fixtures, n_now, leagues, dry=args.notify_dry, sports=sports)
            if morning_due and not args.notify_dry and os.environ.get("NTFY_TOPIC"):
                state["date"] = f"{now:%Y-%m-%d}"
                with open(state_path, "w", encoding="utf-8") as fh:
                    json.dump(state, fh)
        changed = record_days(state, esports, now)                      # résultats du jour et d'hier : base du résumé hebdomadaire
        evening_due = args.notify_evening and 20 <= now.hour <= 23 and state.get("evening") != f"{now:%Y-%m-%d}"
        if evening_due and os.environ.get("NTFY_TOPIC") and run_evening(now, esports, state=state):
            state["evening"] = f"{now:%Y-%m-%d}"
            changed = True
        if changed:
            with open(state_path, "w", encoding="utf-8") as fh:
                json.dump(state, fh)
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
