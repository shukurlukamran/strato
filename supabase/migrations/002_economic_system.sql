-- Economic System Migration
-- Adds infrastructure_level column and economic_events table

-- Add infrastructure_level column if it doesn't exist
ALTER TABLE country_stats 
ADD COLUMN IF NOT EXISTS infrastructure_level INTEGER DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_country_stats_economic 
ON country_stats(country_id, budget, population);

-- Ensure resources column is JSONB for flexibility (should already be, but ensure it)
-- This is a no-op if already JSONB, but ensures type consistency
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'country_stats' 
    AND column_name = 'resources'
    AND data_type != 'jsonb'
  ) THEN
    ALTER TABLE country_stats 
    ALTER COLUMN resources TYPE JSONB USING resources::JSONB;
  END IF;
END $$;

-- Add economic events table for tracking
CREATE TABLE IF NOT EXISTS economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- 'budget_update', 'resource_production', 'population_change'
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economic_events_country_turn 
ON economic_events(country_id, turn_number DESC);

CREATE INDEX IF NOT EXISTS idx_economic_events_game_turn 
ON economic_events(game_id, turn_number DESC);
