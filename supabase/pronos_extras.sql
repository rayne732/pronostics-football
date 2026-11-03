-- Pronostics : ancienneté des abonnés (badges, paliers) et boîte à idées avec vote. À coller UNE FOIS dans Supabase > SQL Editor > Run
-- (après pronos_billing.sql). Sans danger si relancé.

-- 1) ancienneté : date de début du premier abonnement (renseignée par la fonction serveur pf-webhook)
alter table public.pf_subscriptions add column if not exists since timestamptz;

-- 2) boîte à idées : réservée aux abonnés pour proposer et voter ; tout compte connecté peut lire
create table if not exists public.pf_ideas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 10 and 280),
  status     text not null default 'open' check (status in ('open', 'planned', 'done', 'declined')),
  created_at timestamptz not null default now()
);
create table if not exists public.pf_idea_votes (
  idea_id uuid not null references public.pf_ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (idea_id, user_id)
);
alter table public.pf_ideas enable row level security;
alter table public.pf_idea_votes enable row level security;
-- aucune règle d'accès direct : tout passe par les fonctions ci-dessous (qui font les vérifications)
revoke all on public.pf_ideas, public.pf_idea_votes from anon, authenticated;
grant all on public.pf_ideas, public.pf_idea_votes to service_role;

create or replace function public.pf_is_paid() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pf_profiles where user_id = auth.uid() and role in ('premium', 'supreme', 'admin'));
$$;

create or replace function public.pf_ideas_list()
returns table (id uuid, author text, body text, status text, created_at timestamptz, votes bigint, mine boolean, voted boolean)
language sql stable security definer set search_path = public, auth as $$
  select i.id, left(split_part(u.email, '@', 1), 3) || '…', i.body, i.status, i.created_at,
         (select count(*) from public.pf_idea_votes v where v.idea_id = i.id),
         i.user_id = auth.uid(),
         exists (select 1 from public.pf_idea_votes v where v.idea_id = i.id and v.user_id = auth.uid())
  from public.pf_ideas i join auth.users u on u.id = i.user_id
  where auth.uid() is not null
  order by 6 desc, i.created_at desc
  limit 200;
$$;

create or replace function public.pf_idea_add(p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.pf_is_paid() then raise exception 'reserve aux abonnes'; end if;
  p_body := btrim(p_body);
  if char_length(p_body) < 10 or char_length(p_body) > 280 then raise exception 'longueur invalide'; end if;
  if (select count(*) from public.pf_ideas where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then raise exception 'limite : 3 idees par jour'; end if;
  insert into public.pf_ideas (user_id, body) values (auth.uid(), p_body) returning id into new_id;
  insert into public.pf_idea_votes (idea_id, user_id) values (new_id, auth.uid());      -- l'auteur vote pour son idée
  return new_id;
end;
$$;

create or replace function public.pf_idea_vote(p_idea uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pf_is_paid() then raise exception 'reserve aux abonnes'; end if;
  if p_on then
    insert into public.pf_idea_votes (idea_id, user_id) values (p_idea, auth.uid()) on conflict do nothing;
  else
    delete from public.pf_idea_votes where idea_id = p_idea and user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.pf_idea_delete(p_idea uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.pf_ideas where id = p_idea and (public.pf_is_admin() or (user_id = auth.uid() and status = 'open'));
end;
$$;

create or replace function public.pf_admin_idea_status(p_idea uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pf_is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('open', 'planned', 'done', 'declined') then raise exception 'statut inconnu'; end if;
  update public.pf_ideas set status = p_status where id = p_idea;
end;
$$;

revoke all on function public.pf_is_paid(), public.pf_ideas_list(), public.pf_idea_add(text), public.pf_idea_vote(uuid, boolean), public.pf_idea_delete(uuid), public.pf_admin_idea_status(uuid, text) from public, anon;
grant execute on function public.pf_is_paid(), public.pf_ideas_list(), public.pf_idea_add(text), public.pf_idea_vote(uuid, boolean), public.pf_idea_delete(uuid), public.pf_admin_idea_status(uuid, text) to authenticated;
