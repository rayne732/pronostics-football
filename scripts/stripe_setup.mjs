// Crée dans Stripe les produits, les tarifs et la configuration du portail client de Pronostics. Sans danger si relancé (les tarifs existants sont repris).
// Usage (PowerShell) :   $env:STRIPE_SECRET_KEY = "sk_test_…" ; node scripts/stripe_setup.mjs
// Commence TOUJOURS par une clé de TEST (sk_test_…). La clé reste dans ta console : ne la colle jamais dans un fichier ni dans un message.
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY || !/^sk_(test|live)_/.test(KEY)) { console.error('Définis STRIPE_SECRET_KEY (clé secrète sk_test_… ou sk_live_…).'); process.exit(1); }
console.log(KEY.startsWith('sk_live_') ? '⚠ MODE RÉEL (sk_live) : de vrais paiements seront possibles.' : 'Mode test (sk_test) : aucun vrai paiement.');

async function stripe(path, method = 'GET', params = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const url = 'https://api.stripe.com' + path + (method === 'GET' && [...body].length ? '?' + body : '');
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? body : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} : ${j?.error?.message}`);
  return j;
}

// montants en centimes, TTC (à ajuster avec les prix de la page Offres de l'appli)
const PLANS = {
  premium: { name: 'Pronostics Premium', prices: { week: 299, month: 799, year: 5900 } },
  supreme: { name: 'Pronostics Suprême', prices: { week: 499, month: 1299, year: 9900 } },
};
const INTERVAL = { week: 'week', month: 'month', year: 'year' };

for (const [tier, p] of Object.entries(PLANS)) {
  let product = (await stripe('/v1/products/search', 'GET', { query: `metadata['pf_tier']:'${tier}' AND active:'true'` })).data[0];
  if (!product) product = await stripe('/v1/products', 'POST', { name: p.name, 'metadata[pf_tier]': tier });
  for (const [period, cents] of Object.entries(p.prices)) {
    const lookup = `pf_${tier}_${period}`;
    const have = (await stripe('/v1/prices', 'GET', { 'lookup_keys[]': lookup, active: true })).data[0];
    if (have) { console.log(`= ${lookup} existe déjà (${have.unit_amount / 100} €)`); continue; }
    await stripe('/v1/prices', 'POST', { product: product.id, currency: 'eur', unit_amount: cents, 'recurring[interval]': INTERVAL[period], lookup_key: lookup, 'metadata[pf_tier]': tier });
    console.log(`+ ${lookup} créé (${cents / 100} €)`);
  }
}

// portail client : changer de carte, résilier, factures. Résiliation à la fin de la période payée.
const site = process.env.SITE_URL || 'https://rayne732.github.io/pronostics-football/';
try {
  const cfg = await stripe('/v1/billing_portal/configurations', 'POST', {
    'business_profile[headline]': 'Gérer mon abonnement Pronostics',
    'features[invoice_history][enabled]': true,
    'features[payment_method_update][enabled]': true,
    'features[customer_update][enabled]': true, 'features[customer_update][allowed_updates][0]': 'email',
    'features[subscription_cancel][enabled]': true, 'features[subscription_cancel][mode]': 'at_period_end',
    'default_return_url': site,
  });
  console.log('+ portail client configuré', cfg.id);
} catch (e) { console.log('Portail client : à configurer à la main dans Stripe (Paramètres > Billing > Portail client).', String(e.message).slice(0, 120)); }

console.log('\nTerminé. Étape suivante : créer le webhook (voir supabase/README_paiement.md).');
