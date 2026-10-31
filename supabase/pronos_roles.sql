-- Pronostics : ajoute le niveau « supreme » (clés combo illimitées) aux niveaux d'accès. À coller UNE FOIS dans Supabase > SQL Editor > Run. Sans danger si relancé.
-- Niveaux : free (gratuit), premium (tous les matchs détaillés), supreme (premium + clés combo illimitées), admin.

alter table public.pf_profiles drop constraint if exists pf_profiles_role_check;
alter table public.pf_profiles add constraint pf_profiles_role_check check (role in ('free', 'premium', 'supreme', 'admin'));

create or replace function public.pf_admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pf_is_admin() then raise exception 'forbidden'; end if;
  if new_role not in ('free', 'premium', 'supreme', 'admin') then raise exception 'rôle inconnu'; end if;
  update public.pf_profiles set role = new_role where user_id = target;
end;
$$;

-- Pour donner un niveau à la main (remplace l'adresse) :
--   update public.pf_profiles set role = 'supreme' where user_id = (select id from auth.users where email = 'adresse@exemple.fr');
