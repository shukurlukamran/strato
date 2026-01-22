# Remaining Features Implementation Guide

This document outlines the code changes needed to complete the remaining features:

## 1. Country Elimination Logic

**Location:** `src/app/api/turn/route.ts` (after line 449)

**Insert this code after city transfer:**

```typescript
// Check for country elimination (defender has 0 cities left)
const remainingCitiesRes = await supabase
  .from("cities")
  .select("id")
  .eq("country_id", defenderId)
  .eq("game_id", gameId);

if (remainingCitiesRes.data && remainingCitiesRes.data.length === 0) {
  // Country eliminated - transfer all remaining assets to victor
  const attackerStats = state.data.countryStatsByCountryId[attackerId];
  const defenderStats = state.data.countryStatsByCountryId[defenderId];
  
  if (attackerStats && defenderStats) {
    // Transfer remaining budget
    attackerStats.budget += defenderStats.budget;
    defenderStats.budget = 0;
    
    // Transfer remaining resources
    for (const [resource, amount] of Object.entries(defenderStats.resources)) {
      attackerStats.resources[resource] = (attackerStats.resources[resource] || 0) + amount;
      defenderStats.resources[resource] = 0;
    }
    
    // Transfer remaining military equipment
    for (const [equipment, amount] of Object.entries(defenderStats.militaryEquipment || {})) {
      attackerStats.militaryEquipment[equipment] = (attackerStats.militaryEquipment[equipment] || 0) + (amount as number);
    }
    
    state.withUpdatedStats(attackerId, attackerStats);
    state.withUpdatedStats(defenderId, defenderStats);
    
    // Create elimination event
    combatEvents.push({
      type: "action.military.elimination",
      message: `💀 ${defenderCountry.name} has been eliminated by ${attackerCountry.name}! All remaining assets transferred.`,
      data: {
        eliminatedId: defenderId,
        victorId: attackerId,
        eliminatedName: defenderCountry.name,
        victorName: attackerCountry.name,
      }
    });
    
    // Check win condition (only 1 country remaining)
    const allCountriesWithCities = await supabase
      .from("cities")
      .select("country_id")
      .eq("game_id", gameId);
    
    if (allCountriesWithCities.data) {
      const uniqueCountryIds = new Set(allCountriesWithCities.data.map(c => c.country_id));
      if (uniqueCountryIds.size === 1) {
        // Game over - only one country left
        await supabase
          .from("games")
          .update({ status: "finished" })
          .eq("id", gameId);
        
        combatEvents.push({
          type: "game.victory",
          message: `🏆 ${attackerCountry.name} has conquered the world! Game Over.`,
          data: {
            victorId: attackerId,
            victorName: attackerCountry.name,
          }
        });
      }
    }
    
    console.log(`[Combat] ${defenderCountry.name} eliminated by ${attackerCountry.name}`);
  }
}
```

## 2. Action Panel Military Section

**Location:** `src/components/game/ActionPanel.tsx`

Add new Military section after the existing military recruitment section (around line 240).

## 3. Visual Indicators for Cities Under Attack

**Location:** `src/components/game/Map.tsx`

Add visual indicators:
- Pulsing red border for cities under attack
- Highlight neighboring enemy cities on hover

## 4. History Message Enhancements

**Location:** `src/app/api/military/attack/route.ts` and `src/app/api/turn/route.ts`

Add attack initiation event when attack is submitted (not just resolved).

## Notes

- All code should be added to existing files
- Make sure to handle edge cases (no cities, already eliminated, etc.)
- Test thoroughly after implementation
