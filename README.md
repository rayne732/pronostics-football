# Pronostics football

Application web installable qui affiche des probabilités et pronostics pour 7 championnats
(Ligue 1, Premier League, La Liga, Bundesliga, Serie A, Championship, Brasileirão ; pas de corners pour le Brésil), calculés par un modèle statistique
(loi de Poisson, attaque / défense par équipe, avantage du domicile, pondération par date).

> Analyse indicative, pas un conseil de pari. Le test de rentabilité (onglet « Fiabilité ») montre que ce
> modèle **ne bat pas les bookmakers**. Réservé aux adultes. Joueurs Info Service : 09 74 75 13 13.

## Architecture

- `bot.py --html` assemble tout : football (modèle propre), puis un module par sport (`tennis.py`, `basket.py`, `rugby.py`, `handball.py`,
  `hockey.py`, `baseball.py`, `nfl.py`, `f1.py`). Un sport en panne n'empêche pas la publication des autres.
- `page.py` écrit `output/index.html` (léger : football + coque) et un fichier `output/data/<sport>.json` par sport, chargé à l'ouverture
  du sport. `web/app.js` contient **une seule** interface pour tous les sports d'équipe (`SPORT_CFG`) ; chaque `web/<sport>.js` expose
  `init`, `fetchRaw` (calendrier et scores en direct, via le navigateur) et `build` (mêmes calculs que le module Python).
- `selfcheck.py` vérifie le site généré (fichiers, probabilités valides) à chaque exécution du workflow.

## Comment ça marche

- `bot.py` télécharge les résultats (football-data.co.uk) et le calendrier (football-data.org), entraîne le
  modèle et génère le site dans `output/` (page unique + manifeste + service worker + icônes).
- `poisson.py`, `markets.py`, `winamax.py` : modèle et marchés (résultat, double chance, buts, mi-temps, corners…).
- `web/` : interface (moteur de marchés `engine.js` exécuté dans le navigateur, `app.js`, `style.css`).
- `tracking.py` : suivi de précision (chaque pronostic affiché est vérifié après le match) et backtest.
- `notify.py` : notifications sur téléphone via [ntfy](https://ntfy.sh).
- `value_test.py` : simulation de paris sur les écarts de cote (résultat : perdant).

## Déploiement (GitHub Pages)

1. **Settings → Pages → Source : GitHub Actions**.
2. **Settings → Secrets and variables → Actions → New repository secret** :
   - `FOOTBALL_DATA_TOKEN` : clé gratuite de <https://www.football-data.org> (calendrier des matchs) ;
   - `NTFY_TOPIC` : nom secret du sujet ntfy (longue chaîne aléatoire, joue le rôle de mot de passe).
3. Le workflow `.github/workflows/pages.yml` s'exécute à chaque push et chaque jour à 5h30 UTC.

## Notifications sur téléphone

Installer l'application **ntfy** (Android / iOS), puis « S'abonner à un sujet » avec exactement le même nom
que le secret `NTFY_TOPIC`. Chaque matin de match : un résumé ; 45 minutes avant chaque match à haute confiance :
une alerte (programmée côté ntfy).

## En local

```bash
pip install -r requirements.txt
python bot.py --html              # génère output/
python bot.py --match Lyon Marseille
python bot.py --html --notify-dry # affiche les notifications sans les envoyer
```

Données : résultats © football-data.co.uk, calendrier © football-data.org (offre gratuite, usage non commercial).

## Autres compétitions du jour (API-Football)

Clé gratuite de <https://dashboard.api-football.com> (secret `API_FOOTBALL_KEY`, en local dans `.env`). L'offre gratuite
(100 requêtes/jour) ne donne que les matchs du jour : l'onglet « Autres matchs » liste ~30 matchs (sélections, coupes, amicaux…)
avec les prédictions d'API-Football, **non validées** par nos backtests.

## Tennis

`tennis.py` : notes Elo (globale + bonus par surface) calculées sur les résultats ATP/WTA de tennis-data.co.uk (depuis 2022),
calendrier et résultats des tournois en cours via l'API publique d'ESPN (hier + 7 jours). Chaque pronostic n'utilise que des
données antérieures au match. Test sur 2025-2026 : vainqueur juste ~65 %, bien calibré, mais un peu moins bon que les cotes des bookmakers.
Le site est régénéré toutes les 2 h (cron) pour garder le tennis et les résultats à jour ; les notifications ne partent que le matin.

## Basket (NBA et EuroLeague)

`basket.py` : points attendus de chaque équipe (attaque / défense / avantage du terrain, moindres carrés régularisés, matchs récents
plus pondérés), marges et totaux de points modélisés par des lois normales. Marchés : vainqueur, handicap, total de points, points
par équipe. Historique : ESPN (NBA, 3 saisons) et API officielle de l'EuroLeague, mis en cache dans `data/basket_games.json`.
Test sur la saison 2025-26 : vainqueur juste ~63 % (NBA) et ~66 % (EuroLeague), pronostics « sûrs » annoncés 74-76 % pour 74-75 % réels.
Les matchs sont aussi récupérés en direct par le navigateur (comme le tennis).

## Rugby à XV (Top 14, Premiership, URC)

`rugby.py` : même modèle de points que le basket (attaque / défense / avantage du terrain), avec le match nul. Marchés : résultat,
double chance, handicap, total de points, points par équipe. Historique ESPN depuis 2024 (`data/rugby_games.json`), calendrier et
scores récupérés en direct par le navigateur. Test sur 2025-26 : vainqueur juste ~78 % (Top 14), ~68-69 % (Premiership, URC).

## Handball

`handball.py` : même modèle de points que le rugby, données API-Sports (clé `API_FOOTBALL_KEY`). L'offre gratuite ne donne que les
saisons 2022-2024 et les matchs d'hier à demain : les notes des équipes datent de juin 2025 et le calendrier ne couvre que 3 jours.
Le test mesure un modèle figé un an plus tôt (vainqueur juste ~63-79 % selon le championnat, « sûrs » bien calibrés).

## Hockey sur glace (NHL)

`hockey.py` : buts du temps réglementaire ~ lois de Poisson par équipe (comme le football), historique ESPN (`data/hockey_games.json`),
calendrier et scores en direct dans le navigateur. Marchés : résultat temps réglementaire, vainqueur (prolongations incluses), double chance,
total de buts, buts par équipe, handicap ±1,5. Le hockey est très aléatoire : vainqueur juste ~52-54 % seulement.

## Formule 1

`f1.py` : modèle de classement de Plackett-Luce (pilote + voiture, pondération récente) sur les résultats depuis 2023 (API Jolpica),
20 000 courses simulées. Après les qualifications, la grille est prise en compte. Marchés : vainqueur, podium, top 6, top 10, pole, duels
de coéquipiers. Le site se régénère toutes les 2 h, donc la prédiction est affinée peu après les qualifications.

## Baseball (MLB)

`baseball.py` : points marqués par équipe ~ binomiales négatives (attaque / défense / avantage du terrain, pondération récente), historique et
calendrier de l'API officielle de la MLB (`statsapi.mlb.com`, sans clé). Marchés : vainqueur, total de points, points par équipe, handicap ±1,5.
Test sur 2025-26 (4 800 matchs) : vainqueur juste ~54 %, très ouvert comme le hockey ; calendrier et scores en direct dans le navigateur.

## Football américain (NFL)

`nfl.py` : même moteur que le basket (points attendus par équipe, marges et totaux ~ lois normales, 4 saisons d'historique ESPN). Marchés :
vainqueur, handicap, total de points, points par équipe. Test sur 2025-26 (320 matchs) : vainqueur juste ~60 %, « sûrs » bien calibrés.
Blessures, météo et quarterbacks ne sont pas pris en compte.

## MMA (UFC)

`mma.py` : notes Elo des combattants (historique ESPN depuis 2022) et fréquences d'arrêt par round selon l'écart de niveau et le nombre de
rounds. Marchés : vainqueur, va à la décision, plus / moins de 1,5 et 2,5 rounds, méthode de victoire. Test depuis 2025 (660 combats) :
vainqueur juste ~61 %. Les combattants avec moins de 2 combats UFC n'ont pas de pronostic sûr.

## Golf (PGA Tour, DP World Tour, LPGA)

`golf.py` : niveau de chaque joueur = coups gagnés par tour sur le reste du plateau (moyenne pondérée par la date), 20 000 tournois simulés
(avec le cut, et à partir du score actuel pour un tournoi en cours). Marchés : vainqueur, top 5, top 10, top 20, passe le cut. Historique
ESPN depuis 2024 (`data/golf_rounds.json`). Les règles de cut sont simplifiées (65 premiers et ex æquo après 2 tours), recalcul toutes les 2 h.

## Volley-ball

`volleyball.py` : notes Elo par championnat (avantage du terrain compris) ; les scores en sets (3-0, 3-1, 3-2), le total de sets et le handicap en sets
viennent du même modèle que le tennis (match au meilleur des 5 sets). Données API-Sports (clé `API_FOOTBALL_KEY`) : saisons 2022-2024 pour l'historique
et hier à demain pour le calendrier (offre gratuite) ; les notes datent donc de mai 2025. Le test mesure un modèle figé un an plus tôt.

## Bilan global

L'onglet « Fiabilité » commence par un bilan des 7 derniers jours pour tous les sports. Le football vient du suivi serveur (`data/tracking.json`) ;
les autres sports sont comptés par le navigateur à partir des résultats récupérés en direct (mémorisés sur l'appareil, 45 jours). Le bouton
« Actualiser » (ou une mise à jour automatique toutes les 3 h à l'ouverture) charge chaque sport et enregistre ses derniers résultats.

## Onglet « Aujourd'hui » et notifications multi-sports

- L'onglet **Aujourd'hui** (premier de la barre du bas) charge tous les sports et liste les pronostics les plus sûrs du jour et les favoris les plus nets.
- `notify.py` envoie en plus du football, chaque matin : un résumé « autres sports » (les 5 pronostics les plus sûrs) et des alertes 45 minutes avant
  les favoris nets (≥ 72 %, 8 au maximum). Le tennis n'y figure que si le serveur peut lire tennis-data.co.uk (bloqué depuis GitHub : voir `health.json`).
