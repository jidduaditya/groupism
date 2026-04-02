-- V2 migration: budget preferences, availability, deadlines
-- Run this in the Supabase SQL Editor AFTER migration.sql

-- ─── Budget Preferences ─────────────────────────────────────────────────────
create table if not exists budget_preferences (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips (id) on delete cascade,
  member_id           uuid not null references trip_members (id) on delete cascade,
  accommodation_tier  text not null check (accommodation_tier in ('budget', 'mid', 'premium')),
  transport_pref      text not null check (transport_pref in ('bus_train', 'flight', 'self_drive')),
  dining_style        text not null check (dining_style in ('local_cheap', 'mixed', 'restaurants')),
  activities          text[] default '{}',
  daily_budget_min    numeric,
  daily_budget_max    numeric,
  notes               text,
  created_at          timestamptz not null default now(),

  unique (trip_id, member_id)
);

create index if not exists idx_budget_preferences_trip on budget_preferences (trip_id);

-- ─── Budget Estimates (AI-generated) ────────────────────────────────────────
create table if not exists budget_estimates (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips (id) on delete cascade,
  per_person_min      numeric not null,
  per_person_max      numeric not null,
  breakdown           jsonb not null default '{}'::jsonb,
  divergence_flags    jsonb not null default '[]'::jsonb,
  members_included    int not null default 0,
  created_at          timestamptz not null default now(),

  unique (trip_id)
);

-- ─── Availability Slots ─────────────────────────────────────────────────────
create table if not exists availability_slots (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  member_id   uuid not null references trip_members (id) on delete cascade,
  slot_date   date not null,
  tier        text not null check (tier in ('unavailable', 'free', 'could_work')),
  created_at  timestamptz not null default now(),

  unique (trip_id, member_id, slot_date)
);

create index if not exists idx_availability_slots_trip on availability_slots (trip_id);

-- ─── Travel Windows (AI-generated) ──────────────────────────────────────────
create table if not exists travel_windows (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  windows     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),

  unique (trip_id)
);

-- ─── Deadlines ──────────────────────────────────────────────────────────────
create table if not exists deadlines (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips (id) on delete cascade,
  item_type   text not null check (item_type in ('destination_vote', 'availability', 'budget_input', 'confirmation')),
  due_date    date not null,
  locked      boolean not null default false,
  created_at  timestamptz not null default now(),

  unique (trip_id, item_type)
);

create index if not exists idx_deadlines_trip on deadlines (trip_id);

-- ─── Realtime publications (idempotent) ─────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'budget_preferences'
  ) then
    alter publication supabase_realtime add table budget_preferences;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'availability_slots'
  ) then
    alter publication supabase_realtime add table availability_slots;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'deadlines'
  ) then
    alter publication supabase_realtime add table deadlines;
  end if;
end $$;
