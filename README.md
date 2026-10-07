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

### Tennis sans tennis-data (serveur GitHub)

Le site tennis-data.co.uk refuse les connexions depuis GitHub (403). `tennis.py` garde donc une copie compacte de l'historique
(`data/tennis_matches.json`, rafraîchie à chaque exécution où tennis-data répond) et la complète toutes les 2 h avec les matchs terminés d'ESPN :
les notes de joueurs restent à jour sans tennis-data. Les joueurs absents de tennis-data sont suivis sous leur nom ESPN.

### Fiabilité des exécutions planifiées

GitHub retarde ou saute parfois les exécutions planifiées (constaté : neuf heures sans exécution un matin). Le workflow a donc trois créneaux le matin
(5h17, 5h47, 6h37 UTC) et des passages toutes les 2 h à des minutes décalées. Les notifications du matin ne partent qu'une fois par jour : `bot.py --notify-morning`
vérifie `data/notify_state.json` et n'envoie que si elles ne sont pas déjà parties (entre 4 h et 10 h).

## Amélioration des statistiques (octobre 2026)

- **Mélange modèle + marché (football)** : `blend.py` déduit les buts attendus des cotes (1X2 + plus/moins 2,5) et les mélange avec ceux du modèle (80 % marché).
  Test sur 2 283 matchs 2025/26 : perte logarithmique 1,0125 → ~0,996 (1X2), 0,693 → ~0,681 (plus/moins 2,5), 0,690 → 0,685 (les deux marquent).
  Appliqué seulement quand le calendrier contient des cotes ; les autres marchés (handicap, buts par équipe…) héritent des buts mélangés.
- **Réglages par sport** (régularisation, sur le backtest de chaque sport) : NFL 14 → 7, basket 8/6 → 12, rugby 5 → 1, hockey 60 → 250, baseball 25 → 100.
- **Seuil « sûr » ajusté à l'optimisme mesuré** : hockey 71,6 %, baseball 71,6 %, rugby/handball 71,5 %, MMA 71,5 %, volley 75 %.
- Essayés sans gain suffisant : demi-vie du football, correction de Dixon-Coles (-0,0005), classement ATP/WTA pour le tennis (-0,0015).

## Bilan du soir et statistiques par compétition
- **Notification du soir** (`notify.build_evening`, option `--notify-evening`, fenêtre 20 h–23 h UTC, créneaux cron 21 h 17 et 22 h 47) : pronostics sûrs gagnés aujourd'hui, par sport, et les trois plus gros ratés. Une seule fois par jour (`data/notify_state.json`, clé `evening`) ; rien n'est envoyé s'il y a moins de 5 pronostics vérifiés.
- **Par compétition** (onglet Fiabilité, `page.competition_rows`) : pronostics sûrs rejoués sur la dernière saison, annoncé contre réussi, pour chaque championnat de football (avec le suivi réel) et chaque ligue des autres sports.

## 29 championnats de football
- **Résultats** : football-data.co.uk (formats « saison » : Ligue 2, 2. Bundesliga, Serie B, La Liga 2, Eredivisie, Pro League, Liga Portugal, Süper Lig, Super League grecque, Premiership écossaise ; format « new » à fichier unique : MLS, Liga MX, Argentine, J1 League, Eliteserien, Allsvenskan, Superliga danoise, Ekstraklasa, SuperLiga roumaine, Super League suisse, Veikkausliiga, Premier Division irlandaise, Brasileirão). Mêmes modèle, marchés, suivi et notifications que les 6 premiers championnats.
- **Calendriers** : fixtures.csv (avec cotes) et football-data.org pour les championnats majeurs ; **ESPN** (`fixtures_api.fetch_espn`, une requête par championnat) pour les autres, avec les cotes DraftKings quand elles existent (elles alimentent le mélange modèle + marché). Pologne, Roumanie, Suisse, Finlande, Irlande n'ont pas de calendrier ESPN à jour : leurs matchs du jour viennent d'API-Football (`fixtures_from_ext`, noms à vérifier).
- **Réglages par championnat** (`poisson.LEAGUE_CFG`) : demi-vie et régularisation choisies en rejouant 2024-26 mois par mois, uniquement quand le gain dépasse 0,0035 de perte logarithmique (les petites divisions préfèrent une régularisation forte). Le backtest (`tracking.run_backtest(..., merge=True)`) couvre tous les championnats depuis juillet 2025.
- Les championnats à phase finale (MLS, Liga MX, Argentine…) peuvent avoir des matchs de playoffs mal pris en compte : la fiabilité réelle est dans l'onglet Fiabilité > Par compétition.

## Mes paris
Onglet « Mes paris » (`web/bets.js`) : saisie des paris (mise, cote, sport, simple ou combiné), résultat (gagné, perdu, remboursé), bénéfice, retour sur mise, réussite nécessaire pour être à l'équilibre contre réussite réelle, courbe cumulée, répartition par sport et par type, budget mensuel avec alerte, sauvegarde par copier / coller. Tout reste dans le localStorage de l'appareil : rien n'est envoyé au serveur ni publié sur le site.

Chaque fiche match a un bouton « Noter un pari sur ce match » et un lien vers Winamax (page d'accueil des paris : pas de lien direct possible, le nom du match est copié pour le chercher) ; chaque sélection a un bouton « € » qui pré-remplit « Mes paris » (match, marché et notre probabilité). Aucun accès au compte Winamax : mise et cote réelle restent à saisir à la main.

### Règlement automatique de « Mes paris »
`results.py` garde 14 jours de résultats de nos pronostics (football : suivi réel ; autres sports : matchs terminés) dans `data/results_log.json` et publie `data/res.json` (chargé à l'ouverture de l'onglet). Un pari créé avec le bouton « € » d'une sélection (ou avec « Noter ce combiné ») est relié au pronostic ; dès que le match est dans le journal, il passe en gagné ou perdu tout seul (un combiné est perdu dès qu'une sélection est perdue, gagné quand toutes le sont). Une sélection absente de nos pronostics reste à régler à la main. Catégories libres (suggestions : Pronostic sûr, Moins sûr, Combiné), bilan par catégorie et comparaison entre nos probabilités annoncées et tes résultats.

## Calendrier mondial et journal des résultats (`espn_hub.py`)
Le flux « all » d'ESPN donne, en un appel par jour, **toutes les compétitions de football du monde** (≈ 220 ligues ; vérifié contre un balayage ligue par ligue : aucun écart). On en tire :
- le **calendrier** des 5 prochains jours, les matchs en cours et les résultats d'hier et d'aujourd'hui, pour toutes les compétitions hors championnats modélisés (page « Compétitions », recherche par nom ou pays), avec les probabilités déduites des cotes quand ESPN en a ;
- un **journal des résultats** (`data/match_log.json`, 60 jours) : chaque match terminé est enregistré avec la probabilité du marché d'avant-match ; les prédictions d'API-Football (`data/ext_log.json`) sont reliées au résultat. Onglet Fiabilité > « Compétitions hors modèle » : part de favoris justes des cotes et d'API-Football, qui grandit chaque jour ;
- les dates de « Autres matchs » suivent l'heure de Paris.

## Modèles maison pour les compétitions ESPN (`espn_models.py`)
Le même modèle Poisson (et les mêmes marchés, suivi et règlement des paris) est appliqué aux compétitions du flux mondial dont il bat nettement la simple fréquence des résultats : divisions inférieures anglaises, football féminin, Amérique latine, Arabie saoudite, Chine, Inde… et **les sélections nationales** (tous les matchs internationaux réunis : amicaux, Ligues des Nations, qualifications). Les coupes, les amicaux de clubs et les compétitions sans assez de matchs restent en calendrier (affiche + cotes).
- `data/espn_hist.json` : historique (4 ans) par compétition, **complété à chaque exécution** par les matchs terminés du flux ESPN : les modèles apprennent chaque jour ; re-téléchargé en entier chaque semaine.
- `data/espn_models.json` : évaluation glissante (12 mois, refit mensuel, 14 compétitions par exécution) : meilleur réglage, gain de perte logarithmique contre la fréquence des résultats (seuil 0,012) et fiabilité des pronostics « sûrs » rejoués (« annoncé / réussi », reprise dans l'onglet Fiabilité > Par compétition).
- Identifiants `x:<code ESPN>` (`x:INT` et `x:INTW` pour les sélections). Le suivi réel ne garde que les pronostics sûrs de ces compétitions (fichier compact) et purge au-delà de 150 jours.

## Alertes favoris, règlement élargi, surveillance
- **Alertes sur mes favoris** (`web/alerts.js`, onglet Favoris) : le navigateur programme lui-même chez ntfy une notification 45 min avant chaque match en favori (★) ; le nom du sujet ntfy est saisi une fois et reste dans l'appareil. Les alertes sont annulées si le favori est retiré, reprogrammées si l'heure change ; ntfy limite à 3 jours : les matchs plus lointains sont programmés à l'ouverture suivante.
- **Règlement élargi** : `results.py` publie aussi, pour le football des 3 derniers jours, le résultat de **toutes** les sélections de chaque marché (`res.json`, clé `a`), pas seulement de nos pronostics : un pari « € » sur n'importe quelle sélection d'une fiche match est réglé tout seul.
- **Surveillance** (`tracking.update_backtest`, `tracking.drift`) : une fois par semaine le backtest est prolongé (seules les semaines manquantes sont rejouées) et une alerte ntfy part si les pronostics sûrs d'un championnat réussissent 5 points de moins que ce qui était annoncé sur 60 jours (≥ 200 pronostics).
- **Combinés du jour** (onglet Aujourd'hui) : prudent / équilibré / audacieux, avec probabilité réelle, cote juste et cote minimale à exiger.

## Marchés supplémentaires (football)
Ajoutés en miroir dans `winamax.py` et `web/engine.js` (parité vérifiée) : écart de buts « gagne par au moins 2 / 3 buts » (oui/non), handicaps ±0,5 / ±1,5 / ±2,5, « vainqueur remboursé si match nul », score exact multichance, dernier but, buts d'une équipe jusqu'à 3,5, et 24 combinaisons « résultat + buts » façon MyMatch (probabilité exacte tirée de la grille de scores). Les marchés redondants (écarts, handicaps, combinaisons) portent `extra` : affichés dans « Autres marchés » et dans « Haute confiance de ce match » (85-97 %), mais hors décompte et suivi des pronostics sûrs pour ne pas gonfler les statistiques. Pas de marchés de joueurs (buteurs, passeurs…) ni de type de but : pas de données fiables gratuites.
Mise à jour : une quarantaine de marchés « extra » supplémentaires, tous calculés depuis la grille de scores et la répartition des buts entre les mi-temps (1re et 2e périodes indépendantes) : nombre exact de buts (total et par équipe), intervalles, marge de victoire, résultat + buts, résultat + les deux marquent, 1er but + résultat (buts échangeables : P(1er but du domicile | score i-j) = i/(i+j)), quelle équipe va marquer, cage inviolée, victoire sans concéder, gagner une / les deux mi-temps, marquer dans les deux mi-temps, mi-temps avec le plus de buts, une dizaine de marchés « Mi-temps - … » (score exact, double chance, buts, vainqueur remboursé…), minute du 1er but (10 et 15 min, buts répartis uniformément par période). Probabilités et règles de règlement vérifiées par simulation de 300 000 matchs (207 sélections, aucun écart > 1,2 point) et parité Python / JavaScript vérifiée.

## Modes bookmaker (Winamax / Betclic)

Sous le titre du football, on active Winamax, Betclic ou les deux. La fiche match n'affiche alors que les marchés proposés par les bookmakers actifs (pastille W / B quand un seul des deux le propose). Le bouton « Marchés » ouvre un tableau où chaque marché se coche par bookmaker : Winamax suit tes captures, Betclic est une estimation à corriger (`web/books.js`). Chaque pari de « Mes paris » peut porter un bookmaker, avec bénéfice par bookmaker. Réglages stockés sur l'appareil (`pf-books`).

## Tennis : écart de jeux (handicap en jeux)

Winamax propose l'« Écart de jeux » (ex. Svitolina −1,5 / Li +1,5). `tennis_games.py` (miroir JS dans `web/tennis.js`) le calcule avec un modèle de Markov : point au service → jeu → set (tie-break à 6-6) → match. La force relative des deux joueurs est réglée pour retrouver exactement la probabilité de victoire de l'Elo ; le niveau moyen de service (ATP 0,64, WTA 0,565) et un aléa de « forme du jour » (0,05 / 0,055) ont été calés sur ~7 000 matchs 2025-2026 : jeux totaux prédits 23,76 / 22,20 contre 23,71 / 22,15 réels, et les probabilités d'écart (±1,5 à ±5,5) tombent à 1-2 points près de la fréquence réelle, avec un log-loss meilleur que la fréquence brute. Les réglages ont été calés sur ces mêmes matchs (pas de test hors échantillon) : le marché reste marqué ⚠ comme les autres marchés de sets.

Même modèle de jeux, autres marchés Winamax du tennis : **nombre de jeux de chaque joueur** (plus / moins), **premier joueur à réaliser un break**, **résultat après 6 jeux** et **nombre exact de sets**. Comparaison avec les cotes d'une capture Winamax (Svitolina–Li) une fois la marge retirée : premier break 34 / 66 % chez eux contre 33 / 67 % chez nous ; 2 sets 64 % contre 59 % (match plus serré chez nous). Le premier break et le résultat après 6 jeux ne peuvent pas être vérifiés avec le seul score final (pas de données point par point) : ils sont affichés mais jamais comptés dans le suivi.

Marchés tennis ajoutés ensuite (même modèle de jeux) : **vainqueur du 1er set**, **résultat 1er set / match**, **total de jeux du match** et **du 1er set**, **tie-break** (match, 1er set, nombre), **un set à 6-0**, **score exact du 1er set**. Vérification sur les ~7 000 matchs 2025-2026 (moyennes prédites / réelles) : tie-break dans le match ATP 38,8 % / 39,0 %, WTA 24,1 % / 24,4 % ; tie-break au 1er set 19,0 / 20,5 % et 11,1 / 12,0 % ; un set à 6-0 3,5 / 3,8 % et 10,0 / 10,0 % ; plus de 9,5 jeux au 1er set 53,7 / 56,1 % et 42,9 / 44,7 %. Tous restent marqués ⚠ (calage sur les mêmes matchs, pas de test hors échantillon) mais sont réglés automatiquement dans le suivi.

## Assistant (onglet Aujourd'hui)

`web/app.js` (`assistantPlan` / `assistantHTML`) propose chaque jour des mises selon un **profil** (Prudent ≥ 85 %, Équilibré ≥ 78 %, Audacieux ≥ 70 %), une **mise de base** (2, 5, 10 ou 20 €) et un **budget du jour** (par défaut 3 mises de base). Un seul pronostic par match, probabilité réduite de 3 points par prudence ; mise = 100 % de la mise de base à partir de 88 %, 50 % de 82 à 88 %, 30 % de 74 à 82 % ; au-delà de 93 % (cote trop basse), sur un match déjà commencé ou sur un marché non validé en profil prudent, je ne propose rien ; « cote minimale » = 1 / probabilité. Il lit le budget et les mises du mois dans « Mes paris » : mises divisées par deux à 80 % du budget, plus aucun conseil une fois le budget atteint. Le bouton « Noter ce pari » préremplit Mes paris avec la mise conseillée. Réglages dans le navigateur (`pf-assist`). Aucun gain n'est garanti : la marge des bookmakers fait perdre la plupart des parieurs sur la durée.

Alerte de l'assistant : le bouton « 🔔 Alerte 45 min avant chaque pari conseillé » (onglet Aujourd'hui) programme, depuis le navigateur, une notification ntfy par pari conseillé avec le pari, la mise et la cote minimale, en réutilisant le sujet ntfy des alertes de favoris. La programmation se fait à l'ouverture de l'appli (le plan dépend de ton profil, de ta mise et de ton budget, qui restent sur ton téléphone) ; une alerte déjà programmée n'est jamais supprimée par un chargement partiel.
