-- Synora Audio - Recording registry + Master-first matching v0 (ISRC exact)

create extension if not exists pgcrypto;

create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  isrc text,
  track_title text,
  artist_name text,
  created_at timestamptz not null default now(),
  meta jsonb
);

create index if not exists recordings_user_created_idx on public.recordings (user_id, created_at desc);
create index if not exists recordings_user_isrc_idx on public.recordings (user_id, isrc);

alter table public.recordings enable row level security;

drop policy if exists "recordings_select_own" on public.recordings;
create policy "recordings_select_own"
  on public.recordings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recordings_insert_own" on public.recordings;
create policy "recordings_insert_own"
  on public.recordings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recordings_update_own" on public.recordings;
create policy "recordings_update_own"
  on public.recordings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Add matching columns to royalty_lines (idempotent)
alter table public.royalty_lines
  add column if not exists recording_id uuid,
  add column if not exists match_confidence double precision,
  add column if not exists match_method text;

create index if not exists royalty_lines_user_recording_idx on public.royalty_lines (user_id, recording_id);

