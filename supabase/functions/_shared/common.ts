// Outils communs aux fonctions de paiement (Supabase Edge Functions, Deno). Aucun secret n'est écrit ici : tout vient des variables d'environnement.
export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
export const SITE = (Deno.env.get('SITE_URL') ?? 'https://rayne732.github.io/pronostics-football/').replace(/\/?$/, '/');

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Appel de l'API Stripe (formulaire encodé, sans SDK). params : clés déjà « aplaties » (ex. « line_items[0][price] »).
export async function stripe(path: string, method: 'GET' | 'POST' = 'GET', params: Record<string, string | number | boolean> = {}) {
  if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY manquante');
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  const url = 'https://api.stripe.com' + path + (method === 'GET' && [...body].length ? '?' + body.toString() : '');
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? body : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${r.status} : ${j?.error?.message ?? 'erreur'}`);
  return j;
}

// Base de données avec la clé de service (contourne la sécurité par ligne : à n'utiliser que côté serveur).
export async function db(path: string, method = 'GET', body?: unknown, prefer?: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Base ${r.status} : ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// Utilisateur connecté d'après le jeton envoyé par le navigateur.
export async function userFromRequest(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email ?? '' } : null;
}
