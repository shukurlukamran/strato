# Resource Specialization System

## Overview

The Resource Specialization System gives each country natural advantages in certain resources (similar to real-world geography) while maintaining overall balance through trade-offs. Countries with oil bonuses have mineral penalties, agricultural powerhouses lack industrial capacity, etc.

## Implementation

### 1. Core Components

**File: `src/lib/game-engine/ResourceProfile.ts`**

- **8 Resource Profiles** with unique specializations:
  - Oil Kingdom (2.5x oil, 0.4x gold)
  - Agricultural Powerhouse (1.8x food, 0.5x iron)
  - Mining Empire (2.2x iron, 0.6x food)
  - Technological Hub (2.3x aluminum, 0.5x oil)
  - Precious Metals Trader (3.0x gold, 0.6x iron)
  - Balanced Nation (slight bonuses across the board)
  - Industrial Complex (2.5x coal, 0.7x food)
  - Coastal Trading Hub (1.8x water, 0.5x rare earth)

- **ResourceProfileManager** handles:
  - Profile assignment (randomized or deterministic)
  - Production modifiers (0.3x to 3.5x multipliers)
  - Starting resource bonuses/penalties
  - Balance validation

### 2. Integration Points

**CountryInitializer** (`src/lib/game-engine/CountryInitializer.ts`):
- Assigns unique profiles to each country (no duplicates in small games)
- Applies profile modifiers to starting resources
- Ensures diverse profiles across countries

**ResourceProduction** (`src/lib/game-engine/ResourceProduction.ts`):
- Applies profile multipliers during per-turn production
- Base production → Tech/Infra multipliers → **Profile multipliers** → Final production

**CountryStats** (`src/types/country.ts`):
- Added `resourceProfile?: ResourceProfile` field
- Stored in database as JSONB

### 3. Database Migration

**File: `supabase/migrations/003_add_resource_profiles.sql`**

```sql
ALTER TABLE country_stats 
ADD COLUMN IF NOT EXISTS resource_profile JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_country_stats_resource_profile_name 
ON country_stats((resource_profile->>'name'));
```

### 4. Game Creation

**File: `src/app/api/game/route.ts`**

- Uses `CountryInitializer.generateMultipleProfiles()` for diverse profiles
- Stores profiles in database with each country's stats
- Profiles persist across turns

## How It Works

### Starting Resources

1. **Base Generation**: Country gets randomized starting stats (population, budget, tech, etc.)
2. **Base Resources**: Resources distributed based on remaining value budget
3. **Profile Applied**: Starting bonuses/penalties applied to resources

Example (Oil Kingdom):
- Base oil: 30 → +150 bonus → **180 starting oil**
- Base gold: 15 → -10 penalty → **5 starting gold**

### Per-Turn Production

1. **Base Production**: Calculated from population, tech, infrastructure
2. **Profile Multipliers**: Applied to base production

Example (Agricultural Powerhouse):
- Base food: 100 → ×1.8 → **180 food/turn**
- Base iron: 10 → ×0.5 → **5 iron/turn**

### Balance Maintenance

- **Trade-offs**: High bonuses come with penalties
- **Total Value**: All profiles aim for similar total production value (±15%)
- **Diversity**: No duplicate profiles in games with 6 countries
- **Deterministic**: Seeded RNG ensures reproducibility

## Profile Examples

### Oil Kingdom
```typescript
{
  name: "Oil Kingdom",
  description: "Rich in oil deposits, lacks precious metals",
  modifiers: [
    { resourceId: 'oil', multiplier: 2.5, startingBonus: 150 },
    { resourceId: 'coal', multiplier: 1.5, startingBonus: 80 },
    { resourceId: 'gold', multiplier: 0.4, startingBonus: -10 },
    { resourceId: 'gems', multiplier: 0.3, startingBonus: -5 },
  ]
}
```

**Strategy**: Sell surplus oil, trade for gold/gems

### Agricultural Powerhouse
```typescript
{
  name: "Agricultural Powerhouse",
  description: "Fertile lands, abundant food and timber",
  modifiers: [
    { resourceId: 'food', multiplier: 1.8, startingBonus: 300 },
    { resourceId: 'timber', multiplier: 2.0, startingBonus: 150 },
    { resourceId: 'water', multiplier: 1.6, startingBonus: 100 },
    { resourceId: 'iron', multiplier: 0.5, startingBonus: -30 },
    { resourceId: 'steel', multiplier: 0.4, startingBonus: -15 },
  ]
}
```

**Strategy**: Rapid population growth, trade food for iron/steel

### Mining Empire
```typescript
{
  name: "Mining Empire",
  description: "Rich in iron, stone, and rare earth minerals",
  modifiers: [
    { resourceId: 'iron', multiplier: 2.2, startingBonus: 120 },
    { resourceId: 'stone', multiplier: 2.0, startingBonus: 100 },
    { resourceId: 'rare_earth', multiplier: 2.5, startingBonus: 40 },
    { resourceId: 'food', multiplier: 0.6, startingBonus: -100 },
    { resourceId: 'timber', multiplier: 0.5, startingBonus: -50 },
  ]
}
```

**Strategy**: Military/tech dominance, must import food

## Gameplay Impact

### Strategic Depth
- Countries must specialize and trade
- Natural alliances form (food exporters + mineral exporters)
- Resource scarcity creates tension

### Balance Verification
- `validateProfileBalance()` ensures fairness
- All profiles tested for 30+ turn viability
- Total production value within ±15% tolerance

### Trade Importance
- No country is fully self-sufficient
- Profiles encourage diplomatic relationships
- Resource trading becomes crucial

## Testing

**File: `__tests__/game/BalanceValidation.test.ts`**

Tests verify:
- All profiles survive 30 turns
- Random starts have equal total value
- Food production > consumption
- Budget remains positive
- Profile diversity in multi-country games

## Future Enhancements

1. **Dynamic Profiles**: Profiles change based on conquered territory
2. **Profile Upgrades**: Invest to improve weak resource production
3. **Special Buildings**: Unique structures per profile (Oil Refinery, Farm Complex)
4. **Profile Synergies**: Bonuses for trading with complementary profiles
5. **Resource Discovery**: Find new deposits, shift profile bonuses

## API Usage

```typescript
// Generate single profile
const profile = ResourceProfileManager.assignRandomProfile('seed-123');

// Generate diverse profiles for game
const profiles = ResourceProfileManager.assignProfilesForGame(6, 'game-seed');

// Apply to production
const modifiedProduction = ResourceProfileManager.applyProfileToProduction(
  baseProduction,
  profile
);

// Validate balance
const validation = ResourceProfileManager.validateProfileBalance(
  profile,
  baseProduction,
  resourceValues
);
```

## Summary

The Resource Specialization System adds strategic depth by giving each country unique advantages and disadvantages, encouraging trade and diplomacy while maintaining overall balance. Countries must leverage their strengths and mitigate weaknesses through international cooperation.
