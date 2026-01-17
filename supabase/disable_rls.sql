-- Disable Row Level Security on game tables for testing
-- Run this in Supabase SQL Editor

-- This will allow all operations to work without RLS blocking them
ALTER TABLE games DISABLE ROW LEVEL SECURITY;
ALTER TABLE countries DISABLE ROW LEVEL SECURITY;
ALTER TABLE country_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE actions DISABLE ROW LEVEL SECURITY;
ALTER TABLE diplomacy_chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE deals DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('games', 'countries', 'country_stats', 'actions', 'diplomacy_chats', 'chat_messages', 'deals');
