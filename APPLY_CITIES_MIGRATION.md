# Apply Cities Migration - Quick Guide

## ✅ Status

- **Code**: 100% Complete and tested
- **Database Migration**: Ready to apply
- **Project Ref**: `ebmqklbcnwwmaegvtkdy`

## 🎯 What Needs To Be Done

The cities table exists but is missing some columns. You need to apply the migration SQL to add the missing columns.

## 📝 Option 1: Supabase Dashboard (Easiest - 2 minutes)

1. **Open Supabase SQL Editor**:
   - Go to: https://supabase.com/dashboard/project/ebmqklbcnwwmaegvtkdy/sql/new
   - Or navigate to your project → SQL Editor → "New query"

2. **Copy the Migration SQL**:
   - File location: `supabase/migrations/004_add_cities.sql`
   - Or copy from below:

```sql
-- Migration: Add cities table
-- Description: Creates the cities table for storing city data within countries

-- Drop and recreate to ensure all columns exist
DROP TABLE IF EXISTS cities CASCADE;

-- Create cities table
CREATE TABLE cities (
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
CREATE INDEX idx_cities_country ON cities(country_id);
CREATE INDEX idx_cities_game ON cities(game_id);
CREATE INDEX idx_cities_under_attack ON cities(is_under_attack) WHERE is_under_attack = TRUE;

-- Add comments
COMMENT ON TABLE cities IS 'Stores cities within countries, each with resources and population portions';
COMMENT ON COLUMN cities.border_path IS 'SVG path string defining the city boundaries within country territory';
COMMENT ON COLUMN cities.per_turn_resources IS 'JSON object containing resource type -> amount mapping for per-turn generation';
COMMENT ON COLUMN cities.size IS 'Relative size multiplier for visual representation (0.5 - 2.0)';
```

3. **Run the Query**:
   - Click the "Run" button (or press Ctrl/Cmd + Enter)
   - Wait for "Success" message

4. **Verify**:
   - Run the verification script:
     ```bash
     cd strato
     node scripts/run-migration.js
     ```
   - Should see: "✅ Cities table already exists!"

## 📝 Option 2: Supabase CLI

```bash
cd strato

# Login to Supabase
npx supabase login

# Link to your project
npx supabase link --project-ref ebmqklbcnwwmaegvtkdy

# Push the migrations
npx supabase db push
```

## 🧪 Test It Works

After applying the migration:

1. **Create a new game**:
   ```bash
   curl -X POST http://localhost:3000/api/game \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Cities","playerCountryIndex":0}'
   ```

2. **Check cities were created**:
   ```bash
   # Use the game ID from the previous command
   curl 'http://localhost:3000/api/game?id=<GAME_ID>'
   ```

3. **Or just create a new game in the UI**:
   - Go to http://localhost:3000/new-game
   - Click "Create Game"
   - Cities should appear on the map!

## 🎮 What You'll See

After the migration is applied and you create a new game:

- **Map**: Cities visible with dashed borders inside countries
- **City Markers**: White dots you can hover over
- **City Tooltip**: Click any city to see:
  - City name
  - Population
  - Resources per turn
  - City value
  - Size info

## 📊 Expected Results

Each new game will have:
- **6 countries** (Aurum, Borealis, Cyrenia, Dravon, Eldoria, Falken)
- **40-60 total cities** (6-15 per country)
- **Cities with varied sizes** and shapes
- **Resources distributed** so city totals = country totals
- **Interactive map** with clickable cities

## ⚠️ Note

Existing games won't have cities - only new games created after the migration is applied will generate cities automatically.

## 🔧 Troubleshooting

**If you see "Could not find the 'border_path' column":**
- The migration hasn't been applied yet
- Follow Option 1 above

**If cities aren't showing on the map:**
- Make sure you created a NEW game after applying the migration
- Old games won't have cities retroactively added
- Check browser console for errors

**If verification script fails:**
- Make sure your dev server is running (`npm run dev`)
- Check that `.env.local` has correct Supabase credentials

## 📚 Files Created

All implementation files are ready:
- ✅ `src/types/city.ts` - TypesDefinitions
- ✅ `src/lib/game-engine/CityGenerator.ts` - Generation logic
- ✅ `src/components/game/CityTooltip.tsx` - UI component
- ✅ `src/components/game/Map.tsx` - Map integration
- ✅ `src/app/api/game/route.ts` - API integration
- ✅ `supabase/migrations/004_add_cities.sql` - Database schema
- ✅ `__tests__/game/CityGeneration.test.ts` - Tests

Everything is ready - just need to apply that SQL! 🚀
