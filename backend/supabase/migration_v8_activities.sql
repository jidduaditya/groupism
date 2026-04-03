-- V8: Activity categories + detail text
ALTER TABLE budget_preferences
  ADD COLUMN IF NOT EXISTS activity_categories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activity_details text;
