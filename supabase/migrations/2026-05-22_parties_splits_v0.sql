-- Synora Audio - Parties + Recording Splits v0 (Master-first)

create extension if not exists pgcrypto;

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  display_name text not null,
  kind text not null default 'person', -- person | company
  created_at timestamptz not null default now(),
  meta jsonb
);

create index if not exists parties_user_created_idx on public.parties (user_id, created_at desc);

alter table public.parties enable row level security;

drop policy if exists "parties_select_own" on public.parties;
create policy "parties_select_own"
  on public.parties for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "parties_insert_own" on public.parties;
create policy "parties_insert_own"
  on public.parties for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "parties_update_own" on public.parties;
create policy "parties_update_own"
  on public.parties for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.recording_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  recording_id uuid not null references public.recordings(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft', -- draft | proposed | active | superseded
  created_at timestamptz not null default now(),
  meta jsonb
);

create index if not exists recording_splits_user_created_idx on public.recording_splits (user_id, created_at desc);
create index if not exists recording_splits_user_recording_idx on public.recording_splits (user_id, recording_id);

alter table public.recording_splits enable row level security;

drop policy if exists "recording_splits_select_own" on public.recording_splits;
create policy "recording_splits_select_own"
  on public.recording_splits for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recording_splits_insert_own" on public.recording_splits;
create policy "recording_splits_insert_own"
  on public.recording_splits for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recording_splits_update_own" on public.recording_splits;
create policy "recording_splits_update_own"
  on public.recording_splits for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.recording_split_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  split_id uuid not null references public.recording_splits(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete restrict,
  role text not null default 'participant',
  share_bps int not null, -- basis points, must sum to 10000
  created_at timestamptz not null default now(),
  meta jsonb
);

create index if not exists recording_split_items_split_idx on public.recording_split_items (split_id);
create index if not exists recording_split_items_user_party_idx on public.recording_split_items (user_id, party_id);

alter table public.recording_split_items enable row level security;

drop policy if exists "recording_split_items_select_own" on public.recording_split_items;
create policy "recording_split_items_select_own"
  on public.recording_split_items for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recording_split_items_insert_own" on public.recording_split_items;
create policy "recording_split_items_insert_own"
  on public.recording_split_items for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recording_split_items_update_own" on public.recording_split_items;
create policy "recording_split_items_update_own"
  on public.recording_split_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

