-- Pronostics : comptes, rôles et synchronisation des paris.
-- À coller UNE FOIS dans Supabase > SQL Editor > New query > Run.
-- Les tables sont préfixées « pf_ » : elles n'ont aucun lien avec celles de Seuil.

-- 1) Profils : le rôle (free / premium / admin) d'un compte. Un utilisateur LIT son profil mais ne peut pas le modifier.
create table if not exists public.pf_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'free' check (role in ('free', 'premium', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.pf_profiles enable row level security;
drop policy if exists "pf_profiles_select_own" on public.pf_profiles;
create policy "pf_profiles_select_own" on public.pf_profiles for select to authenticated using (auth.uid() = user_id);
-- Aucune politique insert / update / delete : seul le serveur (trigger ci-dessous, ou toi dans le tableau de bord) peut changer un rôle.

-- 2) Création automatique du profil à l'inscription.
create or replace function public.pf_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.pf_profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists pf_on_auth_user_created on auth.users;
create trigger pf_on_auth_user_created after insert on auth.users for each row execute function public.pf_handle_new_user();
-- Comptes déjà existants (par exemple celui de Seuil) : profil créé d'office.
insert into public.pf_profiles (user_id) select id from auth.users on conflict do nothing;

-- 3) État de l'utilisateur : ses paris et son plan (un seul document JSON par compte, visible uniquement par lui).
create table if not exists public.pf_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint pf_state_size check (pg_column_size(data) < 2000000)
);
alter table public.pf_state enable row level security;
drop policy if exists "pf_state_select_own" on public.pf_state;
drop policy if exists "pf_state_insert_own" on public.pf_state;
drop policy if exists "pf_state_update_own" on public.pf_state;
drop policy if exists "pf_state_delete_own" on public.pf_state;
create policy "pf_state_select_own" on public.pf_state for select to authenticated using (auth.uid() = user_id);
create policy "pf_state_insert_own" on public.pf_state for insert to authenticated with check (auth.uid() = user_id);
create policy "pf_state_update_own" on public.pf_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pf_state_delete_own" on public.pf_state for delete to authenticated using (auth.uid() = user_id);

-- Pour donner un accès Premium ou Admin à quelqu'un (à faire dans le SQL Editor) :
--   update public.pf_profiles set role = 'premium' where user_id = (select id from auth.users where email = 'adresse@exemple.fr');
