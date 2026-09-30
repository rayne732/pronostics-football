# Pronostics football

Application web installable qui affiche des probabilités et pronostics pour 6 championnats
(Ligue 1, Premier League, La Liga, Bundesliga, Serie A, Championship), calculés par un modèle statistique
(loi de Poisson, attaque / défense par équipe, avantage du domicile, pondération par date).

> Analyse indicative, pas un conseil de pari. Le test de rentabilité (onglet « Fiabilité ») montre que ce
> modèle **ne bat pas les bookmakers**. Réservé aux adultes. Joueurs Info Service : 09 74 75 13 13.

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
