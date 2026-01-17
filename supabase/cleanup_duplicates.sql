-- Database Cleanup Script for Duplicate Records
-- Run this in your Supabase SQL Editor to fix corruption

-- ============================================
-- STEP 1: Check for duplicate game IDs
-- ============================================
SELECT 'Checking for duplicate game IDs...' as status;

SELECT id, COUNT(*) as duplicate_count
FROM games
GROUP BY id
HAVING COUNT(*) > 1;

-- ============================================
-- STEP 2: Show all games (for debugging)
-- ============================================
SELECT 'All games in database:' as status;

SELECT id, name, created_at, updated_at, current_turn, status
FROM games
ORDER BY created_at DESC;

-- ============================================
-- STEP 3: Check for duplicate country_stats
-- ============================================
SELECT 'Checking for duplicate country_stats...' as status;

SELECT country_id, turn, COUNT(*) as duplicate_count
FROM country_stats
GROUP BY country_id, turn
HAVING COUNT(*) > 1;

-- ============================================
-- STEP 4: Delete duplicate games (keep most recent)
-- ============================================
-- This will delete all duplicate games, keeping only the most recent one
-- based on created_at timestamp and ctid (row physical location)

SELECT 'Deleting duplicate games...' as status;

DELETE FROM games a
WHERE ctid NOT IN (
  SELECT MAX(ctid)
  FROM games b
  WHERE a.id = b.id
  GROUP BY b.id
);

-- ============================================
-- STEP 5: Delete duplicate country_stats (keep most recent)
-- ============================================
SELECT 'Deleting duplicate country_stats...' as status;

DELETE FROM country_stats a
WHERE ctid NOT IN (
  SELECT MAX(ctid)
  FROM country_stats b
  WHERE a.country_id = b.country_id AND a.turn = b.turn
  GROUP BY b.country_id, b.turn
);

-- ============================================
-- STEP 6: Verify cleanup
-- ============================================
SELECT 'Verification - Remaining games:' as status;

SELECT COUNT(*) as total_games,
       COUNT(DISTINCT id) as unique_game_ids
FROM games;

SELECT 'Verification - Remaining country_stats:' as status;

SELECT COUNT(*) as total_stats,
       COUNT(DISTINCT (country_id, turn)) as unique_country_turn_combos
FROM country_stats;

-- ============================================
-- STEP 7: Check RLS status (optional)
-- ============================================
SELECT 'Row Level Security status:' as status;

SELECT tablename, 
       rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('games', 'countries', 'country_stats', 'actions');

-- ============================================
-- OPTIONAL: If you want to disable RLS temporarily for testing
-- ============================================
-- Uncomment these lines if you suspect RLS is causing issues:
-- ALTER TABLE games DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE countries DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE country_stats DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE actions DISABLE ROW LEVEL SECURITY;

SELECT 'Cleanup complete!' as status;
