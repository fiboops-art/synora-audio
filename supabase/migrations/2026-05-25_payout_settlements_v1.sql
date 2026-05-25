-- Synora Audio - Payout settlements (v1)
-- Phase 2 foundation: source-of-truth of real-world settlement execution.

create extension if not exists pgcrypto;

create table if not exists public.payout_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  payout_id uuid not null references public.payout_requests(id) on delete cascade,
  destination_id uuid not null references public.payout_destinations(id) on delete restrict,

  operator_id uuid not null,
  provider text not null, -- PIX | BANK | PAYPAL | WISE | STRIPE | CRYPTO
  settlement_ref text not null,
  status text not null default 'PENDING', -- PENDING | PROCESSING | SETTLED | FAILED | REVERSED
  settled_at timestamptz,

  -- immutable masked snapshot of destination at settlement time
  destination_snapshot jsonb,
  raw jsonb,

  correlation_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guardrails
alter table public.payout_settlements
  drop constraint if exists payout_settlements_provider_check;
alter table public.payout_settlements
  add constraint payout_settlements_provider_check
  check (provider in ('PIX','BANK','PAYPAL','WISE','STRIPE','CRYPTO'));

alter table public.payout_settlements
  drop constraint if exists payout_settlements_status_check;
alter table public.payout_settlements
  add constraint payout_settlements_status_check
  check (status in ('PENDING','PROCESSING','SETTLED','FAILED','REVERSED'));

-- Indexes
create index if not exists payout_settlements_user_created_idx on public.payout_settlements (user_id, created_at desc);
create index if not exists payout_settlements_user_payout_idx on public.payout_settlements (user_id, payout_id, created_at desc);
create index if not exists payout_settlements_user_destination_idx on public.payout_settlements (user_id, destination_id, created_at desc);
create index if not exists payout_settlements_user_status_idx on public.payout_settlements (user_id, status, created_at desc);
create index if not exists payout_settlements_user_provider_idx on public.payout_settlements (user_id, provider, created_at desc);

-- Anti-duplicidade contextual: settlement proof unique per user+provider
create unique index if not exists payout_settlements_unique_ref
  on public.payout_settlements (user_id, provider, settlement_ref)
  where settlement_ref is not null and btrim(settlement_ref) <> '';

alter table public.payout_settlements enable row level security;

drop policy if exists "payout_settlements_select_own" on public.payout_settlements;
create policy "payout_settlements_select_own"
  on public.payout_settlements for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "payout_settlements_insert_own" on public.payout_settlements;
create policy "payout_settlements_insert_own"
  on public.payout_settlements for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "payout_settlements_update_own" on public.payout_settlements;
create policy "payout_settlements_update_own"
  on public.payout_settlements for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

