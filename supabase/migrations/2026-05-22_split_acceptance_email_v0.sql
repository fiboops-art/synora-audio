-- Synora Audio - Split acceptance via email magic link (MVP)

-- Parties: add email (identity)
alter table public.parties
  add column if not exists email text;

create index if not exists parties_user_email_idx on public.parties (user_id, email);

-- Recording split acceptances (per party)
create table if not exists public.recording_split_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, -- owner
  split_id uuid not null references public.recording_splits(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,

  email text not null,
  token_hash text not null,
  status text not null default 'pending', -- pending | accepted | rejected | expired

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_user_agent text
);

create index if not exists recording_split_acceptances_user_split_idx on public.recording_split_acceptances (user_id, split_id);
create index if not exists recording_split_acceptances_token_idx on public.recording_split_acceptances (token_hash);
create index if not exists recording_split_acceptances_status_idx on public.recording_split_acceptances (user_id, status);

alter table public.recording_split_acceptances enable row level security;

drop policy if exists "recording_split_acceptances_select_own" on public.recording_split_acceptances;
create policy "recording_split_acceptances_select_own"
  on public.recording_split_acceptances for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recording_split_acceptances_insert_own" on public.recording_split_acceptances;
create policy "recording_split_acceptances_insert_own"
  on public.recording_split_acceptances for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recording_split_acceptances_update_own" on public.recording_split_acceptances;
create policy "recording_split_acceptances_update_own"
  on public.recording_split_acceptances for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

