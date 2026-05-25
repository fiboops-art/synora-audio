-- Synora Audio - Payout destinations (v1)
-- Phase 2 foundation: reusable, verifiable payout endpoints per party.

create extension if not exists pgcrypto;

create table if not exists public.payout_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  party_id uuid not null references public.parties(id) on delete cascade,

  provider text not null, -- PIX | BANK | PAYPAL | WISE | STRIPE | CRYPTO
  label text not null,
  currency text not null default 'USD',
  details jsonb not null default '{}'::jsonb,
  fingerprint text,
  status text not null default 'DRAFT', -- DRAFT | PENDING_VERIFICATION | VERIFIED | DISABLED

  verified_at timestamptz,
  verified_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Guardrails
alter table public.payout_destinations
  drop constraint if exists payout_destinations_provider_check;
alter table public.payout_destinations
  add constraint payout_destinations_provider_check
  check (provider in ('PIX','BANK','PAYPAL','WISE','STRIPE','CRYPTO'));

alter table public.payout_destinations
  drop constraint if exists payout_destinations_status_check;
alter table public.payout_destinations
  add constraint payout_destinations_status_check
  check (status in ('DRAFT','PENDING_VERIFICATION','VERIFIED','DISABLED'));

-- Verified implies verified_at/by
alter table public.payout_destinations
  drop constraint if exists payout_destinations_verified_fields_check;
alter table public.payout_destinations
  add constraint payout_destinations_verified_fields_check
  check (
    (status <> 'VERIFIED')
    or (verified_at is not null and verified_by is not null)
  );

-- Indexes
create index if not exists payout_destinations_user_created_idx on public.payout_destinations (user_id, created_at desc);
create index if not exists payout_destinations_user_party_idx on public.payout_destinations (user_id, party_id, created_at desc);
create index if not exists payout_destinations_user_status_idx on public.payout_destinations (user_id, status, created_at desc);
create index if not exists payout_destinations_user_provider_idx on public.payout_destinations (user_id, provider, created_at desc);

-- Prevent duplicate destinations per user/provider by fingerprint (when provided)
create unique index if not exists payout_destinations_unique_fingerprint
  on public.payout_destinations (user_id, provider, fingerprint)
  where fingerprint is not null and btrim(fingerprint) <> '';

alter table public.payout_destinations enable row level security;

drop policy if exists "payout_destinations_select_own" on public.payout_destinations;
create policy "payout_destinations_select_own"
  on public.payout_destinations for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "payout_destinations_insert_own" on public.payout_destinations;
create policy "payout_destinations_insert_own"
  on public.payout_destinations for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "payout_destinations_update_own" on public.payout_destinations;
create policy "payout_destinations_update_own"
  on public.payout_destinations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

