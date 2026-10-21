-- Pronostics : communauté (pronostics partagés, abonnements). À coller UNE FOIS dans Supabase > SQL Editor > Run. Sans danger si relancé.

create table if not exists public.pf_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  author     text not null check (char_length(author) between 2 and 24),
  legs       jsonb not null check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 6 and pg_column_size(legs) < 6000),
  created_at timestamptz not null default now()
);
create index if not exists pf_posts_created on public.pf_posts (created_at desc);
alter table public.pf_posts enable row level security;
drop policy if exists "pf_posts_read" on public.pf_posts;
drop policy if exists "pf_posts_insert" on public.pf_posts;
drop policy if exists "pf_posts_delete" on public.pf_posts;
create policy "pf_posts_read" on public.pf_posts for select to authenticated using (true);
create policy "pf_posts_insert" on public.pf_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "pf_posts_delete" on public.pf_posts for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.pf_follows (
  follower uuid not null references auth.users (id) on delete cascade,
  followed uuid not null references auth.users (id) on delete cascade,
  primary key (follower, followed),
  check (follower <> followed)
);
alter table public.pf_follows enable row level security;
drop policy if exists "pf_follows_read" on public.pf_follows;
drop policy if exists "pf_follows_insert" on public.pf_follows;
drop policy if exists "pf_follows_delete" on public.pf_follows;
create policy "pf_follows_read" on public.pf_follows for select to authenticated using (auth.uid() = follower);
create policy "pf_follows_insert" on public.pf_follows for insert to authenticated with check (auth.uid() = follower);
create policy "pf_follows_delete" on public.pf_follows for delete to authenticated using (auth.uid() = follower);

revoke all on public.pf_posts, public.pf_follows from anon;
grant select, insert, delete on public.pf_posts, public.pf_follows to authenticated;
grant all on public.pf_posts, public.pf_follows to service_role;
