// Démarre un paiement Stripe Checkout pour Premium ou Suprême. Appelée par le navigateur (utilisateur connecté).
// Corps : { tier: 'premium' | 'supreme', period: 'week' | 'month' | 'year' } -> { url } (page de paiement Stripe)
import { cors, db, json, SITE, stripe, userFromRequest } from '../_shared/common.ts';

const TIERS = ['premium', 'supreme'];
const PERIODS = ['week', 'month', 'year'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'auth' }, 401);
    const { tier, period } = await req.json().catch(() => ({}));
    if (!TIERS.includes(tier) || !PERIODS.includes(period)) return json({ error: 'offre inconnue' }, 400);

    const prices = await stripe('/v1/prices', 'GET', { 'lookup_keys[]': `pf_${tier}_${period}`, active: true });
    const price = prices.data?.[0];
    if (!price) return json({ error: 'tarif introuvable : lance scripts/stripe_setup.mjs' }, 500);

    const rows = await db(`pf_subscriptions?select=customer,subscription,status&user_id=eq.${user.id}`);
    const row = rows?.[0];
    if (row && ['active', 'trialing', 'past_due'].includes(row.status)) return json({ error: 'already' }, 409);   // déjà abonné : passer par le portail

    let customer: string | undefined = row?.customer;
    if (!customer) {
      const found = await stripe('/v1/customers/search', 'GET', { query: `metadata['uid']:'${user.id}'` });
      customer = found.data?.[0]?.id;
    }
    if (!customer) customer = (await stripe('/v1/customers', 'POST', { email: user.email, 'metadata[uid]': user.id })).id;
    await db('pf_subscriptions?on_conflict=user_id', 'POST', { user_id: user.id, customer }, 'resolution=merge-duplicates');

    const params: Record<string, string | number | boolean> = {
      mode: 'subscription', customer, client_reference_id: user.id, locale: 'fr', allow_promotion_codes: true,
      'line_items[0][price]': price.id, 'line_items[0][quantity]': 1,
      'subscription_data[metadata][uid]': user.id, 'subscription_data[metadata][tier]': tier, 'subscription_data[metadata][period]': period,
      success_url: `${SITE}?paid=1`, cancel_url: `${SITE}?paid=0`,
      'custom_text[submit][message]': `En validant, tu acceptes les [CGV](${SITE}?legal=cgu) et tu confirmes avoir 18 ans ou plus. Résiliable à tout moment, remboursement possible sous 14 jours.`,
    };
    if (!row?.subscription) params['subscription_data[trial_period_days]'] = 3;       // essai gratuit seulement la première fois
    const session = await stripe('/v1/checkout/sessions', 'POST', params);
    return json({ url: session.url });
  } catch (e) {
    console.error('pf-checkout', e);
    return json({ error: 'erreur serveur' }, 500);
  }
});
