-- Add trips table to Realtime publication (idempotent)
-- Run this in the Supabase SQL Editor

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'trips'
  ) then
    alter publication supabase_realtime add table trips;
  end if;
end $$;
