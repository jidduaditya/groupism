-- V7: Ensure all trip-related tables are in Supabase Realtime publication
-- Run each separately; if a table is already in the publication, the statement will error
-- but that's safe — just skip it and run the next one.

ALTER PUBLICATION supabase_realtime ADD TABLE trips;
ALTER PUBLICATION supabase_realtime ADD TABLE trip_members;
ALTER PUBLICATION supabase_realtime ADD TABLE destination_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE destination_options;
ALTER PUBLICATION supabase_realtime ADD TABLE budget_preferences;
ALTER PUBLICATION supabase_realtime ADD TABLE availability_slots;
