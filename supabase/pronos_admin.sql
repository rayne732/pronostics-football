-- Pronostics : gestion des comptes (admin) et suppression de son propre compte.
-- À coller UNE FOIS dans Supabase > SQL Editor > Run (après pronos.sql). Sans danger si relancé.

create or replace function public.pf_is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.pf_profiles where user_id = auth.uid() and role = 'admin');
$$;

-- Liste des comptes : réservée aux admins (la fonction renvoie zéro ligne aux autres).
create or replace function public.pf_admin_users()
returns table (user_id uuid, email text, role text, created_at timestamptz, last_sign_in timestamptz)
language sql security definer stable set search_path = public as $$
  select p.user_id, u.email::text, p.role, p.created_at, u.last_sign_in_at
  from public.pf_profiles p join auth.users u on u.id = p.user_id
  where public.pf_is_admin()
  order by p.created_at desc;
$$;

-- Changer le niveau d'accès d'un compte : réservé aux admins.
create or replace function public.pf_admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pf_is_admin() then raise exception 'forbidden'; end if;
  if new_role not in ('free', 'premium', 'admin') then raise exception 'rôle inconnu'; end if;
  update public.pf_profiles set role = new_role where user_id = target;
end;
$$;

-- Supprimer SON compte et toutes ses données (droit à l'effacement).
create or replace function public.pf_delete_me() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.pf_is_admin(), public.pf_admin_users(), public.pf_admin_set_role(uuid, text), public.pf_delete_me() from public, anon;
grant execute on function public.pf_is_admin(), public.pf_admin_users(), public.pf_admin_set_role(uuid, text), public.pf_delete_me() to authenticated;

-- TON compte en admin (remplace l'adresse par la tienne, puis Run) :
--   update public.pf_profiles set role = 'admin' where user_id = (select id from auth.users where email = 'ton-adresse@exemple.fr');
