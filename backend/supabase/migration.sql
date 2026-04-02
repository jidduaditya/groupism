-- Triphaus database schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ─── Trips ───────────────────────────────────────────────────────────────────
create table if not exists trips (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  join_token      text not null unique,
  organiser_token text not null,
  budget_min      numeric,
  budget_max      numeric,
  travel_from     date,
  travel_to       date,
  deadline        date,
  created_at      timestamptz not null default now()
);

-- join_token unique constraint already creates an index

-- ─── Trip Members ────────────────────────────────────────────────────────────
create table if not exists trip_members (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips (id) on delete cascade,
  display_name    text not null,
  member_token    text not null,
  is_organiser    boolean not null default false,
  has_confirmed   boolean not null default false,
  confirmed_at    timestamptz,
  joined_at       timestamptz not null default now()
);

create index idx_trip_members_trip on trip_members (trip_id);
create index idx_trip_members_token on trip_members (trip_id, member_token);

-- ─── Destination Options ─────────────────────────────────────────────────────
create table if not exists destination_options (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips (id) on delete cascade,
  name                text not null,
  tagline             text,
  pros                jsonb default '[]'::jsonb,
  cons                jsonb default '[]'::jsonb,
  best_for            text,
  estimated_cost_min  numeric,
  estimated_cost_max  numeric,
  source              text not null default 'manual', -- 'manual' or 'ai'
  created_at          timestamptz not null default now()
);

create index idx_destination_options_trip on destination_options (trip_id);

-- ─── Destination Votes ───────────────────────────────────────────────────────
-- One vote per member per trip (they pick one destination)
create table if not exists destination_votes (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references trips (id) on delete cascade,
  destination_id  uuid not null references destination_options (id) on delete cascade,
  member_id       uuid not null references trip_members (id) on delete cascade,
  created_at      timestamptz not null default now(),

  unique (trip_id, member_id)
);

create index idx_destination_votes_dest on destination_votes (destination_id);

-- ─── Nudge Log ───────────────────────────────────────────────────────────────
create table if not exists nudge_log (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references trips (id) on delete cascade,
  target_member_id  uuid not null references trip_members (id) on delete cascade,
  sent_at           timestamptz not null default now()
);

create index idx_nudge_log_trip on nudge_log (trip_id, sent_at);
