-- Synora Creators — Track <-> Recording link v1
-- A recording may originate from an uploaded track.
-- Nullable preserves recordings created/imported through other flows.

alter table public.recordings
  add column if not exists track_id uuid references public.tracks(id) on delete set null;

create unique index if not exists recordings_user_track_uidx
  on public.recordings (user_id, track_id)
  where track_id is not null;

create index if not exists recordings_track_idx
  on public.recordings (track_id)
  where track_id is not null;
