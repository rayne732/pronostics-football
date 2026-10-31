// Ouvre le portail client Stripe (changer de carte, résilier, voir les factures). -> { url }
import { cors, db, json, SITE, stripe, userFromRequest } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const user = await userFromRequest(req);
    if (!user) return json({ error: 'auth' }, 401);
    const rows = await db(`pf_subscriptions?select=customer&user_id=eq.${user.id}`);
    const customer = rows?.[0]?.customer;
    if (!customer) return json({ error: 'aucun abonnement' }, 404);
    const session = await stripe('/v1/billing_portal/sessions', 'POST', { customer, return_url: SITE });
    return json({ url: session.url });
  } catch (e) {
    console.error('pf-portal', e);
    return json({ error: 'erreur serveur' }, 500);
  }
});
