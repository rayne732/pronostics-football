"""Contrôle rapide du site généré (output/) : fichiers présents, données lisibles, probabilités valides.
Affiche un avertissement par problème (code de sortie 1 s'il y en a), sans bloquer le déploiement."""
import json
import math
import os
import re
import sys

problems = []


def check(cond, msg):
    if not cond:
        problems.append(msg)


def valid_p(p):
    ps = p if isinstance(p, list) else [p]
    return all(isinstance(x, (int, float)) and not math.isnan(x) and 0 <= x <= 1 for x in ps)


html = open("output/index.html", encoding="utf-8").read()
m = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S)
check(bool(m), "index.html : bloc de données introuvable")
D = json.loads(m.group(1).replace("<\\/", "</")) if m else {}
check(len(html) < 600_000, f"index.html trop lourd ({len(html) // 1024} Ko) : les données doivent rester dans output/data/")
check(bool(D.get("fixtures")) or bool(D.get("ext")) or bool(D.get("leagues")), "football : aucune donnée")

for key, url in (D.get("lazy") or {}).items():
    path = os.path.join("output", url.split("?")[0])
    check(os.path.exists(path), f"{path} manquant")
    if not os.path.exists(path):
        continue
    data = json.load(open(path, encoding="utf-8"))
    if key == "hist":
        check(isinstance(data, list) and len(data) > 100, "hist : historique vide")
        continue
    if key == "res":
        check(isinstance(data.get("m"), dict), "res : journal des résultats absent")
        print(f"res       {len(data.get('m', {})):3d} matchs réglables, {os.path.getsize(path) // 1024} Ko")
        continue
    ms = data.get("matches", [])
    check("generated" in data, f"{key} : date de mise à jour absente")
    check(bool(data.get("model")) or key in ("handball", "tennis", "golf", "volley"), f"{key} : modèle absent (pas de direct dans le navigateur)")
    for x in ms:
        if not valid_p(x["p"]):
            problems.append(f"{key} : probabilité invalide pour {x.get('home') or x.get('a')} - {x.get('away') or x.get('b')}")
            break
    print(f"{key:9s} {len(ms):3d} matchs, {os.path.getsize(path) // 1024} Ko")

f1 = D.get("f1") or {}
check(bool(f1.get("next")) or bool(f1.get("last")), "f1 : aucune donnée")

# Diagnostic de joignabilité depuis le serveur de calcul (écrit output/health.json, publié avec le site)
import urllib.request
health = {}
for name, url in (("espn_site", "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"),
                  ("espn_web", "https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"),
                  ("espn_core", "https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl?lang=en&region=us"),
                  ("mlb", "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-01"),
                  ("euroleague", "https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games?limit=1"),
                  ("tennis_data", "https://tennis-data.co.uk/data.php"),
                  ("jolpica", "https://api.jolpi.ca/ergast/f1/current.json?limit=1")):
    for ua in ("Mozilla/5.0", "curl/8.4.0"):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": ua}), timeout=25) as r:
                health[f"{name}|{ua[:7]}"] = r.status
        except Exception as exc:
            health[f"{name}|{ua[:7]}"] = str(exc)[:60]
json.dump(health, open("output/health.json", "w"), indent=1)
print("problèmes :", problems or "aucun")
sys.exit(1 if problems else 0)
