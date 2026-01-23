-- Migration: Simplify resource system to 8 resources
-- Removes: water, stone, uranium, rare_earth, silver, gems, aluminum, electronics
-- Keeps: food, timber, iron, oil, gold, copper, steel, coal
-- 
-- This migration consolidates deleted resources into kept resources using conversion ratios
-- to preserve game balance while simplifying the system.

-- Step 1: Update existing country_stats resources (consolidate deleted resources)
UPDATE country_stats
SET resources = jsonb_strip_nulls(jsonb_build_object(
  'food', COALESCE((resources->>'food')::numeric, 0) + COALESCE((resources->>'water')::numeric, 0) * 0.5,
  'timber', COALESCE((resources->>'timber')::numeric, 0) + COALESCE((resources->>'stone')::numeric, 0) * 0.3,
  'iron', COALESCE((resources->>'iron')::numeric, 0),
  'oil', COALESCE((resources->>'oil')::numeric, 0) + COALESCE((resources->>'uranium')::numeric, 0) * 2.0,
  'gold', COALESCE((resources->>'gold')::numeric, 0) + COALESCE((resources->>'silver')::numeric, 0) * 0.4 + COALESCE((resources->>'gems')::numeric, 0) * 0.6,
  'copper', COALESCE((resources->>'copper')::numeric, 0) + COALESCE((resources->>'rare_earth')::numeric, 0) * 0.8,
  'steel', COALESCE((resources->>'steel')::numeric, 0) + COALESCE((resources->>'aluminum')::numeric, 0) * 0.7 + COALESCE((resources->>'electronics')::numeric, 0) * 0.5,
  'coal', COALESCE((resources->>'coal')::numeric, 0)
))
WHERE resources IS NOT NULL;

-- Step 2: Update cities per_turn_resources similarly
UPDATE cities
SET per_turn_resources = jsonb_strip_nulls(jsonb_build_object(
  'food', COALESCE((per_turn_resources->>'food')::numeric, 0) + COALESCE((per_turn_resources->>'water')::numeric, 0) * 0.5,
  'timber', COALESCE((per_turn_resources->>'timber')::numeric, 0) + COALESCE((per_turn_resources->>'stone')::numeric, 0) * 0.3,
  'iron', COALESCE((per_turn_resources->>'iron')::numeric, 0),
  'oil', COALESCE((per_turn_resources->>'oil')::numeric, 0) + COALESCE((per_turn_resources->>'uranium')::numeric, 0) * 2.0,
  'gold', COALESCE((per_turn_resources->>'gold')::numeric, 0) + COALESCE((per_turn_resources->>'silver')::numeric, 0) * 0.4 + COALESCE((per_turn_resources->>'gems')::numeric, 0) * 0.6,
  'copper', COALESCE((per_turn_resources->>'copper')::numeric, 0) + COALESCE((per_turn_resources->>'rare_earth')::numeric, 0) * 0.8,
  'steel', COALESCE((per_turn_resources->>'steel')::numeric, 0) + COALESCE((per_turn_resources->>'aluminum')::numeric, 0) * 0.7 + COALESCE((per_turn_resources->>'electronics')::numeric, 0) * 0.5,
  'coal', COALESCE((per_turn_resources->>'coal')::numeric, 0)
))
WHERE per_turn_resources IS NOT NULL;

-- Step 3: Update resource_profile modifiers to only reference 8 resources
-- Remove modifiers for deleted resources
UPDATE country_stats
SET resource_profile = (
  SELECT jsonb_build_object(
    'name', resource_profile->>'name',
    'description', resource_profile->>'description',
    'modifiers', (
      SELECT jsonb_agg(modifier)
      FROM jsonb_array_elements(resource_profile->'modifiers') modifier
      WHERE modifier->>'resourceId' IN ('food', 'timber', 'iron', 'oil', 'gold', 'copper', 'steel', 'coal')
    )
  )
)
WHERE resource_profile IS NOT NULL;

-- Step 4: Add index for common resource queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_country_stats_resources_gin 
ON country_stats USING gin(resources);

-- Step 5: Add comment documenting the 8-resource system
COMMENT ON COLUMN country_stats.resources IS 
'Resource stockpiles (8 resources): food, timber, iron, oil, gold, copper, steel, coal. 
Basic (food, timber) = survival/construction. 
Strategic (iron, oil) = military. 
Economic (gold, copper) = diplomacy/trade/research. 
Industrial (steel, coal) = tech/advanced construction.';

-- Step 6: Verify migration - check that all resources are now in the 8-resource set
DO $$
DECLARE
  invalid_resources jsonb;
BEGIN
  -- Check country_stats
  SELECT jsonb_agg(DISTINCT key) INTO invalid_resources
  FROM country_stats,
  jsonb_each(resources)
  WHERE key NOT IN ('food', 'timber', 'iron', 'oil', 'gold', 'copper', 'steel', 'coal');
  
  IF invalid_resources IS NOT NULL THEN
    RAISE WARNING 'Found invalid resources in country_stats: %', invalid_resources;
  END IF;
  
  -- Check cities
  SELECT jsonb_agg(DISTINCT key) INTO invalid_resources
  FROM cities,
  jsonb_each(per_turn_resources)
  WHERE key NOT IN ('food', 'timber', 'iron', 'oil', 'gold', 'copper', 'steel', 'coal');
  
  IF invalid_resources IS NOT NULL THEN
    RAISE WARNING 'Found invalid resources in cities: %', invalid_resources;
  END IF;
  
  RAISE NOTICE 'Migration 005_simplify_resources completed successfully';
END $$;
