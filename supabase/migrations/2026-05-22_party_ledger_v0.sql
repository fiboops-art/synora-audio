-- Synora Audio - Party sub-ledger allocations (apply active recording splits)

create extension if not exists pgcrypto;

create table if not exists public.party_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  party_id uuid not null references public.parties(id) on delete cascade,
  split_id uuid not null references public.recording_splits(id) on delete cascade,
  statement_id uuid not null references public.royalty_statements(id) on delete cascade,
  line_id uuid not null references public.royalty_lines(id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries(id) on delete cascade,

  amount_usd double precision not null,
  created_at timestamptz not null default now()
);

-- Avoid double allocation for same party+ledger_entry
create unique index if not exists party_ledger_unique on public.party_ledger_entries (user_id, party_id, ledger_entry_id);
create index if not exists party_ledger_user_created_idx on public.party_ledger_entries (user_id, created_at desc);
create index if not exists party_ledger_user_party_idx on public.party_ledger_entries (user_id, party_id);

alter table public.party_ledger_entries enable row level security;

drop policy if exists "party_ledger_select_own" on public.party_ledger_entries;
create policy "party_ledger_select_own"
  on public.party_ledger_entries for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "party_ledger_insert_own" on public.party_ledger_entries;
create policy "party_ledger_insert_own"
  on public.party_ledger_entries for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "party_ledger_update_own" on public.party_ledger_entries;
create policy "party_ledger_update_own"
  on public.party_ledger_entries for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

