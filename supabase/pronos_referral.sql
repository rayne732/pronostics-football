-- Pronostics : parrainage. À coller UNE FOIS dans Supabase > SQL Editor > Run. Sans danger si relancé.
-- Un utilisateur a un code = les 8 premiers caractères de son identifiant. Un nouveau compte (moins de 7 jours) peut utiliser UN code, une seule fois.
-- Le parrain gagne 3 clés par filleul (10 filleuls au plus, compté côté appli), le filleul gagne 1 clé.

create table if not exists public.pf_referrals (
  referred   uuid primary key references auth.users (id) on delete cascade,   -- un compte ne peut être parrainé qu'une fois
  referrer   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (referrer <> referred)
);
create index if not exists pf_referrals_referrer on public.pf_referrals (referrer);
alter table public.pf_referrals enable row level security;
drop policy if exists "pf_referrals_read" on public.pf_referrals;
create policy "pf_referrals_read" on public.pf_referrals for select to authenticated using (auth.uid() = referrer or auth.uid() = referred);
-- pas de droit d'écriture direct : tout passe par la fonction ci-dessous (qui fait les vérifications)

create or replace function public.pf_claim_referral(p_code text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r uuid;
  created timestamptz;
begin
  if auth.uid() is null then return 'auth'; end if;
  if p_code is null or p_code !~ '^[0-9a-fA-F]{8}$' then return 'unknown'; end if;
  select id into r from auth.users where substr(replace(id::text, '-', ''), 1, 8) = lower(p_code) limit 1;
  if r is null then return 'unknown'; end if;
  if r = auth.uid() then return 'self'; end if;
  if exists (select 1 from public.pf_referrals where referred = auth.uid()) then return 'already'; end if;
  select created_at into created from auth.users where id = auth.uid();
  if created < now() - interval '7 days' then return 'old'; end if;
  if (select count(*) from public.pf_referrals where referrer = r) >= 10 then return 'full'; end if;
  insert into public.pf_referrals (referrer, referred) values (r, auth.uid());
  return 'ok';
end;
$$;

revoke all on function public.pf_claim_referral(text) from public, anon;
grant execute on function public.pf_claim_referral(text) to authenticated;
revoke all on public.pf_referrals from anon;
grant select on public.pf_referrals to authenticated;
grant all on public.pf_referrals to service_role;
