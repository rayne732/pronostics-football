// Test de la vérification de signature Stripe : node tests/stripe_sig_test.mjs
import { sign, verify } from '../supabase/functions/_shared/stripe_sig.js';

const secret = 'whsec_test_secret';
const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
const now = Date.now(), t = Math.floor(now / 1000);
const good = `t=${t},v1=${await sign(secret, t, payload)}`;
const problems = [];
const check = async (name, got, want) => { if (got !== want) problems.push(`${name} : obtenu ${got}, attendu ${want}`); };

await check('signature valide', await verify(payload, good, secret, 300, now), true);
await check('corps modifié', await verify(payload + ' ', good, secret, 300, now), false);
await check('mauvais secret', await verify(payload, good, 'whsec_autre', 300, now), false);
await check('signature altérée', await verify(payload, good.replace(/.$/, (c) => (c === '0' ? '1' : '0')), secret, 300, now), false);
await check('trop ancien', await verify(payload, good, secret, 300, now + 10 * 60 * 1000), false);
await check('en-tête vide', await verify(payload, '', secret, 300, now), false);
await check('plusieurs signatures (rotation de secret)', await verify(payload, `t=${t},v1=deadbeef,v1=${await sign(secret, t, payload)}`, secret, 300, now), true);

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('signature Stripe : 7 vérifications correctes');
