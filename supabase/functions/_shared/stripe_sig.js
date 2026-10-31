// Vérification de la signature d'un webhook Stripe (schéma v1 : HMAC-SHA256 de « horodatage.corps » avec le secret whsec_…).
// Module sans dépendance : tourne dans Supabase Edge Functions (Deno) et dans Node (tests).
const enc = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {                       // comparaison à durée constante
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function sign(secret, timestamp, payload) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${payload}`)));
}

// header : valeur de l'en-tête « Stripe-Signature » ; renvoie true si valide et pas trop ancien (5 minutes par défaut)
export async function verify(payload, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!payload || !header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const t = Number(parts.t);
  const sigs = header.split(',').map((p) => p.trim()).filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = await sign(secret, t, payload);
  return sigs.some((s) => safeEqual(s, expected));
}
