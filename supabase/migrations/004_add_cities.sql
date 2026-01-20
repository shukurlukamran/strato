-- Migration: Add cities table
-- Description: Creates the cities table for storing city data within countries

-- Create cities table
CREATE TABLE IF NOT EXISTS cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  size FLOAT NOT NULL DEFAULT 1.0,
  border_path TEXT NOT NULL,
  per_turn_resources JSONB NOT NULL DEFAULT '{}',
  population INTEGER NOT NULL DEFAULT 0,
  is_under_attack BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT cities_game_fk FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT cities_country_fk FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE,
  CONSTRAINT cities_size_check CHECK (size > 0 AND size <= 3.0),
  CONSTRAINT cities_position_x_check CHECK (position_x >= 0 AND position_x <= 100),
  CONSTRAINT cities_position_y_check CHECK (position_y >= 0 AND position_y <= 80),
  CONSTRAINT cities_population_check CHECK (population >= 0)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country_id);
CREATE INDEX IF NOT EXISTS idx_cities_game ON cities(game_id);
CREATE INDEX IF NOT EXISTS idx_cities_under_attack ON cities(is_under_attack) WHERE is_under_attack = TRUE;

-- Add comment
COMMENT ON TABLE cities IS 'Stores cities within countries, each with resources and population portions';
COMMENT ON COLUMN cities.border_path IS 'SVG path string defining the city boundaries within country territory';
COMMENT ON COLUMN cities.per_turn_resources IS 'JSON object containing resource type -> amount mapping for per-turn generation';
COMMENT ON COLUMN cities.size IS 'Relative size multiplier for visual representation (0.5 - 2.0)';
