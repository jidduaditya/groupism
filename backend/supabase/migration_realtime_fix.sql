-- migration_realtime_fix.sql
-- Safety-net: ensure ALL tables are in the supabase_realtime publication.
-- Idempotent — safe to re-run. Covers V3, V7, V10 in one pass.

DO $$
DECLARE
  _tables text[] := ARRAY[
    'trips',
    'trip_members',
    'destination_options',
    'destination_votes',
    'budget_preferences',
    'availability_slots',
    'budget_estimates',
    'travel_windows',
    'group_insights'
  ];
  _t text;
BEGIN
  FOREACH _t IN ARRAY _tables
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', _t);
      RAISE NOTICE 'Added % to supabase_realtime', _t;
    ELSE
      RAISE NOTICE '% already in supabase_realtime — skipped', _t;
    END IF;
  END LOOP;
END $$;
