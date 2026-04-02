-- V5 migration: Couple model + missing fields
-- Run this in the Supabase SQL Editor

-- Couples table: links two members of the same trip as a couple unit
CREATE TABLE IF NOT EXISTS couples (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id_1  uuid NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  member_id_2  uuid REFERENCES trip_members(id) ON DELETE SET NULL,
  couple_name  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, member_id_1)
);

-- Add couple_id to tables that need couple-level aggregation
ALTER TABLE trip_members       ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE budget_preferences ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE availability_slots ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;
ALTER TABLE destination_votes  ADD COLUMN IF NOT EXISTS couple_id uuid REFERENCES couples(id) ON DELETE SET NULL;

-- Add couple_count to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS couple_count integer;

-- Partial unique index for couple-level voting (only when couple_id is set)
CREATE UNIQUE INDEX IF NOT EXISTS idx_destination_votes_couple
  ON destination_votes(trip_id, couple_id) WHERE couple_id IS NOT NULL;

-- Enable Realtime on couples table
ALTER PUBLICATION supabase_realtime ADD TABLE couples;
