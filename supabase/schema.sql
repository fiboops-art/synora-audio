-- Synora Audio (MVP) - minimal schema

create extension if not exists pgcrypto;

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  created_at timestamptz not null default now(),
  guardian_status text not null default 'PENDING',
  distribution_status text not null default 'NOT_SENT',
  guardian_raw jsonb,
  meta jsonb
);

alter table public.tracks enable row level security;

-- MVP: open read/write for anon (remove later when auth is added)
drop policy if exists "tracks_anon_read" on public.tracks;
create policy "tracks_anon_read" on public.tracks
for select
to anon
using (true);

drop policy if exists "tracks_anon_write" on public.tracks;
create policy "tracks_anon_write" on public.tracks
for insert
to anon
with check (true);

drop policy if exists "tracks_anon_update" on public.tracks;
create policy "tracks_anon_update" on public.tracks
for update
to anon
using (true)
with check (true);

