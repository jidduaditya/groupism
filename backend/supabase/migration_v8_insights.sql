-- V8: Group AI insights
CREATE TABLE IF NOT EXISTS group_insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  vibe_summary    text,
  itinerary_notes text,
  friction_flags  jsonb,
  members_used    int,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id)
);
ALTER PUBLICATION supabase_realtime ADD TABLE group_insights;
