-- V6: Remove couple model entirely
ALTER TABLE trip_members         DROP COLUMN IF EXISTS couple_id;
ALTER TABLE budget_preferences   DROP COLUMN IF EXISTS couple_id;
ALTER TABLE availability_slots   DROP COLUMN IF EXISTS couple_id;
ALTER TABLE destination_votes    DROP COLUMN IF EXISTS couple_id;

DROP INDEX IF EXISTS idx_destination_votes_couple;
DROP TABLE IF EXISTS couples CASCADE;
