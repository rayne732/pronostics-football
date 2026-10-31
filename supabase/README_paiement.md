# Ouvrir les paiements (Stripe) — pas à pas

Tout le code est prêt. Il reste à brancher TES comptes. **Commence en mode test** : aucun vrai argent ne bouge.
Les clés (sk_test_…, whsec_…) se tapent uniquement dans TA console. Ne les colle jamais dans un fichier du projet ni dans un message.

## 1. Stripe (mode test)
1. Dans le tableau de bord Stripe, active le **mode test** (interrupteur en haut).
2. *Développeurs > Clés API* : copie la **clé secrète** (`sk_test_…`).
3. Dans PowerShell, dans le dossier `foot-bot` :
   ```powershell
   $env:STRIPE_SECRET_KEY = "sk_test_COLLE_TA_CLE_ICI"
   node scripts/stripe_setup.mjs
   ```
   Cela crée les produits **Pronostics Premium** et **Pronostics Suprême**, leurs 6 tarifs (semaine / mois / année) et le portail client. Relançable sans danger.
   Les montants sont dans `scripts/stripe_setup.mjs` : garde-les identiques à ceux de la page Offres de l'appli.

## 2. Supabase : base de données
Dans *SQL Editor*, colle et lance (Run) **dans cet ordre**, un fichier à la fois :
1. `supabase/pronos_roles.sql` (ajoute le niveau Suprême)
2. `supabase/pronos_referral.sql` (parrainage)
3. `supabase/pronos_billing.sql` (abonnements)

## 3. Supabase : les 3 fonctions de paiement
Il faut l'outil Supabase en ligne de commande (il se lance avec `npx`, rien à installer) et ton compte Supabase :
```powershell
npx supabase login
npx supabase link --project-ref wmwmuvkxdsvnrtcjqkyf
npx supabase functions deploy pf-checkout
npx supabase functions deploy pf-portal
npx supabase functions deploy pf-webhook --no-verify-jwt
```
(`--no-verify-jwt` est obligatoire pour `pf-webhook` : Stripe n'a pas de compte sur ton site, la sécurité vient de la signature.)

## 4. Le webhook Stripe
1. *Stripe > Développeurs > Webhooks > Ajouter un point de terminaison*.
2. URL : `https://wmwmuvkxdsvnrtcjqkyf.supabase.co/functions/v1/pf-webhook`
3. Événements à cocher : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copie la **clé de signature** (`whsec_…`) puis enregistre les secrets (dans ta console) :
   ```powershell
   npx supabase secrets set STRIPE_SECRET_KEY="sk_test_..." STRIPE_WEBHOOK_SECRET="whsec_..." SITE_URL="https://rayne732.github.io/pronostics-football/"
   ```

## 5. Activer dans l'appli et tester
1. Dans `web/app.js`, mets `var BILLING = { on: true };` (demande-moi de le faire).
2. Sur le site, connecte-toi, ouvre *Réglages > Offres*, coche la case, clique sur « Essayer 3 jours gratuits ».
3. Paie avec la carte de test **4242 4242 4242 4242**, date future, CVC au choix.
4. Au retour, ton niveau passe à Premium/Suprême en quelques secondes. Teste aussi : « Gérer mon abonnement » (portail), la résiliation, et le retour au gratuit.
5. Carte qui échoue : `4000 0000 0000 0341` (paiement refusé au renouvellement).

## 6. Avant d'ouvrir au public (indispensable)
- **Statut d'entrepreneur** (micro-entreprise / SIRET) : obligatoire pour vendre. Complète ensuite les champs `[À COMPLÉTER]` de `web/legal.js` (nom, adresse, SIRET, contact, médiateur de la consommation, TVA). Tant qu'il en reste, un message d'alerte s'affiche pour l'admin.
- **Faire relire** les conditions et la politique de confidentialité par un professionnel : ce sont des modèles.
- **Publicité** : en France, la communication autour des paris sportifs est encadrée (ANJ) : pas de promesse de gains, pas de ciblage des mineurs, message de prévention visible. Vérifie les règles avant toute campagne.
- **Stripe en réel** : active ton compte Stripe (identité, compte bancaire), puis refais les étapes 1 à 4 avec les clés **sk_live_** et un second webhook en mode réel.
- **Supabase** : ce projet est partagé avec Seuil. Pour vendre, un projet séparé est préférable (relance alors les 4 fichiers SQL dans le nouveau projet et change l'adresse et la clé publique dans `web/account.js`).
- **Hébergement** : GitHub Pages convient pour démarrer ; vérifie ses conditions d'usage pour une activité commerciale.
