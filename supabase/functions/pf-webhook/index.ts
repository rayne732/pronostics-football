// Reçoit les événements Stripe et met à jour l'abonnement et le niveau d'accès du compte.
// À déployer SANS vérification de jeton (Stripe n'a pas de compte) : la sécurité vient de la signature (STRIPE_WEBHOOK_SECRET).
import { verify } from '../_shared/stripe_sig.js';
import { db, json, stripe } from '../_shared/common.ts';

const ACTIVE = ['active', 'trialing', 'past_due'];          // past_due : Stripe réessaie le paiement, l'accès continue

// Reporte un abonnement Stripe dans pf_subscriptions et ajuste le rôle du compte (jamais celui d'un admin).
async function syncSubscription(sub: any) {
  const item = sub.items?.data?.[0];
  const key: string = item?.price?.lookup_key ?? '';
  const m = /^pf_(premium|supreme)_(week|month|year)$/.exec(key);
  if (!m) return;                                           // abonnement d'un autre produit du même compte Stripe (ex. Seuil) : on l'ignore
  let uid: string | undefined = sub.metadata?.uid;
  if (!uid) uid = (await db(`pf_subscriptions?select=user_id&customer=eq.${sub.customer}`))?.[0]?.user_id;
  if (!uid) return;
  const end = sub.current_period_end ?? item?.current_period_end;
  await db('pf_subscriptions?on_conflict=user_id', 'POST', {
    user_id: uid, customer: sub.customer, subscription: sub.id, tier: m[1], period: m[2], status: sub.status,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null, updated_at: new Date().toISOString(),
  }, 'resolution=merge-duplicates');
  const role = ACTIVE.includes(sub.status) ? m[1] : 'free';
  await db(`pf_profiles?user_id=eq.${uid}&role=neq.admin`, 'PATCH', { role });
}

Deno.serve(async (req) => {
  const payload = await req.text();
  const ok = await verify(payload, req.headers.get('Stripe-Signature') ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '');
  if (!ok) return json({ error: 'signature invalide' }, 400);
  try {
    const event = JSON.parse(payload);
    const obj = event.data?.object;
    if (event.type === 'checkout.session.completed' && obj?.subscription) {
      await syncSubscription(await stripe(`/v1/subscriptions/${obj.subscription}`));
    } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
      await syncSubscription(obj);
    }
    return json({ received: true });
  } catch (e) {
    console.error('pf-webhook', e);
    return json({ error: 'erreur serveur' }, 500);              // Stripe réessaiera
  }
});
