-- Soft-delete support for synora-audio tracks
-- Run this in Supabase SQL editor for the synora-audio project.

alter table public.tracks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

-- Helpful index for listing
create index if not exists tracks_user_deleted_at_idx
  on public.tracks (user_id, deleted_at);

-- Optional: if you rely on RLS for client-side operations, add policies.
-- (Server routes currently use service_role + explicit user_id filters.)
--
-- Example (adjust to your setup):
--
-- alter table public.tracks enable row level security;
--
-- create policy "tracks_select_own"
--   on public.tracks for select
--   using (auth.uid() = user_id and deleted_at is null);
--
-- create policy "tracks_update_own"
--   on public.tracks for update
--   using (auth.uid() = user_id)
--   with check (auth.uid() = user_id);
