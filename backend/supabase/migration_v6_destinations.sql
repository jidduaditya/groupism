-- V6: Add columns to destination_options for auto-save from AI summary
ALTER TABLE destination_options
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS nights integer,
  ADD COLUMN IF NOT EXISTS added_by_member_id uuid REFERENCES trip_members(id) ON DELETE SET NULL;
