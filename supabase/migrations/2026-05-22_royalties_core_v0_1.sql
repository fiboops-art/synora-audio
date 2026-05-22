-- Synora Audio (Core v0.1) - Royalties normalized ingestion

create extension if not exists pgcrypto;

create table if not exists public.royalty_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  schema_version text not null default 'royalty_statement.v0.1',
  correlation_id text not null,
  source text not null,
  report_month text not null,
  imported_at timestamptz not null,
  importer text not null default 'ui',
  file_name text,
  file_hash text not null,
  parsing_status text not null,
  parsing_errors text[] not null default '{}',
  line_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists royalty_statements_user_created_idx on public.royalty_statements (user_id, created_at desc);
create index if not exists royalty_statements_user_month_idx on public.royalty_statements (user_id, report_month);

alter table public.royalty_statements enable row level security;

drop policy if exists "royalty_statements_select_own" on public.royalty_statements;
create policy "royalty_statements_select_own"
  on public.royalty_statements for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "royalty_statements_insert_own" on public.royalty_statements;
create policy "royalty_statements_insert_own"
  on public.royalty_statements for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "royalty_statements_update_own" on public.royalty_statements;
create policy "royalty_statements_update_own"
  on public.royalty_statements for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


create table if not exists public.royalty_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  statement_id uuid not null references public.royalty_statements(id) on delete cascade,

  row_index int not null,
  raw_row_hash text not null,
  created_at timestamptz not null,

  parsing_status text not null,
  status text not null,
  warnings text[] not null default '{}',
  warning_codes text[] not null default '{}',
  error_details text,

  number_format text not null default 'auto',

  source text not null,
  report_month text not null,
  imported_at timestamptz not null,

  dsp text,
  territory text,

  isrc text,
  upc text,
  release_title text,
  track_title text,
  artist_name text,

  quantity double precision,

  original_currency text not null,
  gross_amount_original double precision,
  net_amount_original double precision,

  fx_base_currency text not null default 'USD',
  fx_source text not null default 'ECB',
  fx_rate double precision,
  fx_timestamp timestamptz,

  net_amount_base double precision
);

create index if not exists royalty_lines_statement_idx on public.royalty_lines (statement_id, row_index);
create index if not exists royalty_lines_user_status_idx on public.royalty_lines (user_id, status);
create index if not exists royalty_lines_user_isrc_idx on public.royalty_lines (user_id, isrc);

alter table public.royalty_lines enable row level security;

drop policy if exists "royalty_lines_select_own" on public.royalty_lines;
create policy "royalty_lines_select_own"
  on public.royalty_lines for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "royalty_lines_insert_own" on public.royalty_lines;
create policy "royalty_lines_insert_own"
  on public.royalty_lines for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "royalty_lines_update_own" on public.royalty_lines;
create policy "royalty_lines_update_own"
  on public.royalty_lines for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

