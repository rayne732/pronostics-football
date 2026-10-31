-- Pronostics : abonnements (Stripe). À coller UNE FOIS dans Supabase > SQL Editor > Run (après pronos_roles.sql). Sans danger si relancé.
-- Cette table est écrite UNIQUEMENT par la fonction serveur « pf-webhook » (clé de service). Les utilisateurs ne peuvent que lire leur propre ligne.

create table if not exists public.pf_subscriptions (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  customer           text,                                   -- identifiant client Stripe (cus_…)
  subscription       text,                                   -- identifiant d'abonnement Stripe (sub_…)
  tier               text check (tier in ('premium', 'supreme')),
  period             text check (period in ('week', 'month', 'year')),
  status             text,                                   -- active, trialing, past_due, canceled, unpaid, incomplete…
  current_period_end timestamptz,
  cancel_at          timestamptz,                            -- résiliation programmée : l'accès continue jusque-là
  updated_at         timestamptz not null default now()
);
create index if not exists pf_subscriptions_customer on public.pf_subscriptions (customer);
alter table public.pf_subscriptions enable row level security;
drop policy if exists "pf_subscriptions_read" on public.pf_subscriptions;
create policy "pf_subscriptions_read" on public.pf_subscriptions for select to authenticated using (auth.uid() = user_id);

revoke all on public.pf_subscriptions from anon;
grant select on public.pf_subscriptions to authenticated;
grant all on public.pf_subscriptions to service_role;
