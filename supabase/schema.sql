-- Synora Audio (MVP) - minimal schema

create extension if not exists pgcrypto;

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  artist text not null,
  created_at timestamptz not null default now(),
  guardian_status text not null default 'PENDING',
  distribution_status text not null default 'NOT_SENT',
  file_path text,
  file_mime text,
  file_size bigint,
  deleted_at timestamptz,
  deleted_by uuid,
  guardian_raw jsonb,
  meta jsonb
);

-- Optional FK (safe to run even if auth schema isn't present in local tooling)
do $$ begin
  alter table public.tracks
    add constraint tracks_user_id_fkey
    foreign key (user_id) references auth.users(id)
    on delete cascade;
exception when undefined_table then
  -- Local tooling without auth schema: ignore.
  null;
end $$;

alter table public.tracks enable row level security;

-- Indexes
create index if not exists tracks_user_created_at_idx on public.tracks (user_id, created_at desc);
create index if not exists tracks_user_deleted_at_idx on public.tracks (user_id, deleted_at);

-- RLS policies (user-scoped)
drop policy if exists "tracks_select_own" on public.tracks;
create policy "tracks_select_own"
  on public.tracks for select
  to authenticated
  using (auth.uid() = user_id and deleted_at is null);

drop policy if exists "tracks_insert_own" on public.tracks;
create policy "tracks_insert_own"
  on public.tracks for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "tracks_update_own" on public.tracks;
create policy "tracks_update_own"
  on public.tracks for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
