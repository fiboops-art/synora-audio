-- Synora Creators — YouTube connection v1
-- Server-side only. OAuth credentials must never be exposed to the client.

create table if not exists public.youtube_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists youtube_oauth_states_user_id_idx
  on public.youtube_oauth_states(user_id);

create table if not exists public.youtube_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_id text not null,
  channel_title text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists youtube_connections_channel_id_idx
  on public.youtube_connections(channel_id);

alter table public.youtube_oauth_states enable row level security;
alter table public.youtube_connections enable row level security;

-- Intentionally no client RLS policies.
-- These tables are accessed only by authenticated server routes
-- after validating the Synora user, using the service role.

comment on table public.youtube_connections is
  'Server-side YouTube OAuth connections for Synora Creators users. Tokens are encrypted before storage.';

comment on table public.youtube_oauth_states is
  'Short-lived one-time OAuth states binding a Google authorization flow to a Synora user.';
