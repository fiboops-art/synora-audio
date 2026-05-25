-- Synora Audio - Payout requests (MVP)

create extension if not exists pgcrypto;

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  party_id uuid not null references public.parties(id) on delete cascade,
  amount_usd double precision not null,
  status text not null default 'PENDING', -- PENDING | APPROVED | BLOCKED | SENT | FAILED | CANCELED
  guardian_raw jsonb,
  correlation_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_requests_user_created_idx on public.payout_requests (user_id, created_at desc);
create index if not exists payout_requests_user_party_idx on public.payout_requests (user_id, party_id);

alter table public.payout_requests enable row level security;

drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own"
  on public.payout_requests for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "payout_requests_insert_own" on public.payout_requests;
create policy "payout_requests_insert_own"
  on public.payout_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "payout_requests_update_own" on public.payout_requests;
create policy "payout_requests_update_own"
  on public.payout_requests for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

