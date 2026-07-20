-- Lead Hunter schema. Run this once in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('yc', 'x_search', 'wellfound')),
  source_url text not null,
  name text,
  company text,
  company_domain text,
  email text,
  email_verified boolean not null default false,
  x_handle text,
  raw_text text not null default '',
  score int not null default 0,
  status text not null default 'new'
    check (status in ('new', 'enriched', 'enrichment_failed', 'queued', 'sent', 'replied', 'opted_out', 'dead')),
  channel text check (channel in ('email', 'x_dm')),
  created_at timestamptz not null default now(),
  last_contacted_at timestamptz
);

-- Never scrape-insert the exact same source item twice.
create unique index if not exists leads_source_url_unique on leads (source_url);

-- Never contact the same person twice even if two different scrapers found them.
create unique index if not exists leads_contact_unique
  on leads (coalesce(email, x_handle))
  where coalesce(email, x_handle) is not null;

create index if not exists leads_status_idx on leads (status);
create index if not exists leads_channel_status_idx on leads (channel, status);

-- Rolling log of send outcomes, used by the circuit breaker to decide when to
-- auto-pause a channel. One row per attempted send.
create table if not exists send_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'x_dm')),
  lead_id uuid references leads (id) on delete set null,
  outcome text not null check (outcome in ('sent', 'failed', 'negative_reply')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists send_events_channel_created_idx on send_events (channel, created_at desc);
