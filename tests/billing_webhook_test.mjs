// Test du webhook de paiement avec de faux Stripe et Supabase : node tests/billing_webhook_test.mjs
import { sign } from '../supabase/functions/_shared/stripe_sig.js';

const SECRET = 'whsec_test';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET };
let handler;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } };
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body ? String(init.body) : '' });
  const u = String(url);
  if (u.includes('pf_subscriptions?select=user_id')) return new Response(JSON.stringify([{ user_id: 'u-from-customer' }]), { status: 200 });
  if (u.startsWith('https://api.stripe.com/v1/subscriptions/')) return new Response(JSON.stringify(subFor('sub_9', 'active')), { status: 200 });
  return new Response('', { status: 200 });
};
await import('../supabase/functions/pf-webhook/index.ts');

const subFor = (id, status, key = 'pf_supreme_year', meta = { uid: 'u1' }) => ({ id, customer: 'cus_1', status, metadata: meta, current_period_end: 1900000000, cancel_at: null, items: { data: [{ price: { lookup_key: key } }] } });
const send = async (event, badSig = false) => {
  const body = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const sig = badSig ? `t=${t},v1=00` : `t=${t},v1=${await sign(SECRET, t, body)}`;
  calls.length = 0;
  return handler(new Request('http://x/pf-webhook', { method: 'POST', headers: { 'Stripe-Signature': sig }, body }));
};
const problems = [];
const expect = (name, cond) => { if (!cond) problems.push(name); };
const patch = () => calls.find((c) => c.method === 'PATCH');
const upsert = () => calls.find((c) => c.url.includes('pf_subscriptions?on_conflict') && c.method === 'POST');

let r = await send({ type: 'customer.subscription.created', data: { object: subFor('sub_1', 'trialing') } });
expect('abonnement en essai : 200', r.status === 200);
expect('abonnement en essai : rôle supreme', patch() && JSON.parse(patch().body).role === 'supreme');
expect('l’admin n’est jamais modifié', patch() && patch().url.includes('role=neq.admin') && patch().url.includes('user_id=eq.u1'));
expect('ligne d’abonnement enregistrée', upsert() && JSON.parse(upsert().body).tier === 'supreme' && JSON.parse(upsert().body).period === 'year');

r = await send({ type: 'customer.subscription.updated', data: { object: subFor('sub_1', 'canceled', 'pf_premium_month') } });
expect('abonnement terminé : retour au gratuit', patch() && JSON.parse(patch().body).role === 'free');

r = await send({ type: 'customer.subscription.updated', data: { object: subFor('sub_1', 'past_due', 'pf_premium_week') } });
expect('paiement en retard : accès conservé', patch() && JSON.parse(patch().body).role === 'premium');

r = await send({ type: 'customer.subscription.deleted', data: { object: subFor('sub_2', 'canceled', 'pf_premium_month', {}) } });
expect('compte retrouvé par le client Stripe', patch() && patch().url.includes('user_id=eq.u-from-customer'));

r = await send({ type: 'customer.subscription.updated', data: { object: subFor('sub_3', 'active', 'seuil_pro_monthly') } });
expect('abonnement d’un autre produit ignoré', !patch() && !upsert());

r = await send({ type: 'checkout.session.completed', data: { object: { subscription: 'sub_9' } } });
expect('fin de paiement : abonnement relu chez Stripe', calls.some((c) => c.url.includes('/v1/subscriptions/sub_9')) && patch() && JSON.parse(patch().body).role === 'supreme');

r = await send({ type: 'invoice.paid', data: { object: {} } });
expect('autre événement : accepté sans rien faire', r.status === 200 && !patch());

r = await send({ type: 'customer.subscription.created', data: { object: subFor('sub_4', 'active') } }, true);
expect('signature fausse : refusé', r.status === 400 && !patch());

if (problems.length) { console.error('ÉCHECS :\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('webhook de paiement : 9 scénarios corrects');
