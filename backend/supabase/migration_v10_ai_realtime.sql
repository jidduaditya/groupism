-- V10: Add AI tables to Realtime publication so budget_estimates,
-- travel_windows, and group_insights changes broadcast to all clients.
ALTER PUBLICATION supabase_realtime ADD TABLE budget_estimates;
ALTER PUBLICATION supabase_realtime ADD TABLE travel_windows;
ALTER PUBLICATION supabase_realtime ADD TABLE group_insights;
