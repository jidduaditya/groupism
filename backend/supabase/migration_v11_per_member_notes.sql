-- migration_v11_per_member_notes.sql
-- Move activity notes and anything-else from trip-level to per-member in budget_preferences.

ALTER TABLE budget_preferences ADD COLUMN IF NOT EXISTS activity_notes text;
ALTER TABLE budget_preferences ADD COLUMN IF NOT EXISTS anything_else text;
