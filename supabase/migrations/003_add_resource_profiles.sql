-- Add resource_profile column to country_stats
-- Resource profiles provide natural advantages/disadvantages in resource production

-- Add resource_profile column (JSONB to store profile data)
ALTER TABLE country_stats 
ADD COLUMN IF NOT EXISTS resource_profile JSONB DEFAULT NULL;

-- Create index for querying by profile name
CREATE INDEX IF NOT EXISTS idx_country_stats_resource_profile_name 
ON country_stats((resource_profile->>'name'));

-- Add comment explaining the column structure
COMMENT ON COLUMN country_stats.resource_profile IS 'Resource specialization profile with format: {"name": "Oil Kingdom", "description": "...", "modifiers": [{"resourceId": "oil", "multiplier": 2.5, "startingBonus": 150}, ...]}';

-- Example profile structure:
-- {
--   "name": "Oil Kingdom",
--   "description": "Rich in oil deposits, lacks precious metals",
--   "modifiers": [
--     {"resourceId": "oil", "multiplier": 2.5, "startingBonus": 150},
--     {"resourceId": "coal", "multiplier": 1.5, "startingBonus": 80},
--     {"resourceId": "gold", "multiplier": 0.4, "startingBonus": -10},
--     {"resourceId": "gems", "multiplier": 0.3, "startingBonus": -5}
--   ]
-- }
