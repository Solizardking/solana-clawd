-- Neon/Postgres table for install and Box/agent tracking.
-- Apply manually in the Neon SQL editor or through a private migration runner.
-- Do not commit database URLs, passwords, or API keys.

create table if not exists public.agent_install_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null check (event in ('install', 'agent_install', 'box_install', 'gateway_install')),
  source text not null default 'github',
  package_name text not null default 'solana-clawd',
  target text not null default 'unknown',
  version text not null default 'unknown',
  git_ref text not null default 'unknown',
  installer text not null default 'unknown',
  runtime text not null default 'unknown',
  platform text not null default 'unknown',
  node_version text not null default 'unknown',
  user_agent text not null default 'unknown',
  ip_hash text not null default 'unknown'
);

create index if not exists agent_install_events_created_at_idx
  on public.agent_install_events (created_at desc);

create index if not exists agent_install_events_event_idx
  on public.agent_install_events (event);
