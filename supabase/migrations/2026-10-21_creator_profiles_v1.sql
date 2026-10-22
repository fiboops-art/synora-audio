-- Synora Creators — Account profiles v1
-- Account identity is intentionally separate from Rights parties and payout destinations.

create table if not exists public.creator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('person', 'company')),
  display_name text not null,
  tax_id text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_profiles enable row level security;

drop policy if exists "creator_profiles_select_own" on public.creator_profiles;
create policy "creator_profiles_select_own"
  on public.creator_profiles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "creator_profiles_insert_own" on public.creator_profiles;
create policy "creator_profiles_insert_own"
  on public.creator_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "creator_profiles_update_own" on public.creator_profiles;
create policy "creator_profiles_update_own"
  on public.creator_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
