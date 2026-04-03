-- V7: Per-member budget columns on budget_preferences
ALTER TABLE budget_preferences
  ADD COLUMN IF NOT EXISTS trip_budget_min numeric,
  ADD COLUMN IF NOT EXISTS trip_budget_max numeric;
