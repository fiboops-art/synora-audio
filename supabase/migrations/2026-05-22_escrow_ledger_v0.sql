-- Synora Audio - Escrow + Ledger v0 (unallocated bucket in USD)

create extension if not exists pgcrypto;

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  statement_id uuid not null references public.royalty_statements(id) on delete cascade,
  line_id uuid not null references public.royalty_lines(id) on delete cascade,

  kind text not null, -- allocated | unallocated | held
  amount_usd double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_user_created_idx on public.ledger_entries (user_id, created_at desc);
create index if not exists ledger_entries_user_kind_idx on public.ledger_entries (user_id, kind);
create index if not exists ledger_entries_user_statement_idx on public.ledger_entries (user_id, statement_id);

alter table public.ledger_entries enable row level security;

drop policy if exists "ledger_entries_select_own" on public.ledger_entries;
create policy "ledger_entries_select_own"
  on public.ledger_entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ledger_entries_insert_own" on public.ledger_entries;
create policy "ledger_entries_insert_own"
  on public.ledger_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "ledger_entries_update_own" on public.ledger_entries;
create policy "ledger_entries_update_own"
  on public.ledger_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.escrow_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  statement_id uuid not null references public.royalty_statements(id) on delete cascade,
  line_id uuid not null references public.royalty_lines(id) on delete cascade,

  amount_usd double precision not null,
  resolution_status text not null default 'open', -- open | resolved | written_off

  best_confidence double precision,
  attempted_matches jsonb,

  resolved_to_recording_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists escrow_user_created_idx on public.escrow_buckets (user_id, created_at desc);
create index if not exists escrow_user_status_idx on public.escrow_buckets (user_id, resolution_status);
create index if not exists escrow_user_statement_idx on public.escrow_buckets (user_id, statement_id);

alter table public.escrow_buckets enable row level security;

drop policy if exists "escrow_select_own" on public.escrow_buckets;
create policy "escrow_select_own"
  on public.escrow_buckets for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "escrow_insert_own" on public.escrow_buckets;
create policy "escrow_insert_own"
  on public.escrow_buckets for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "escrow_update_own" on public.escrow_buckets;
create policy "escrow_update_own"
  on public.escrow_buckets for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

