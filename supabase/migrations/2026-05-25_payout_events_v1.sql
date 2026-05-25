-- Synora Audio - Payout audit trail (v1)

create extension if not exists pgcrypto;

create table if not exists public.payout_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  payout_id uuid not null references public.payout_requests(id) on delete cascade,
  actor_id uuid not null,
  action text not null, -- CREATED | STATUS_CHANGED
  from_status text,
  to_status text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_events_user_created_idx on public.payout_events (user_id, created_at desc);
create index if not exists payout_events_user_payout_idx on public.payout_events (user_id, payout_id, created_at desc);

alter table public.payout_events enable row level security;

drop policy if exists "payout_events_select_own" on public.payout_events;
create policy "payout_events_select_own"
  on public.payout_events for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "payout_events_insert_own" on public.payout_events;
create policy "payout_events_insert_own"
  on public.payout_events for insert
  to authenticated
  with check (auth.uid() = user_id);

