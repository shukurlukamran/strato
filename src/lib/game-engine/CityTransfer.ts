import type { City } from "@/types/city";
import type { CountryStats } from "@/types/country";
import type { GameState } from "./GameState";

/**
 * CityTransfer - Handles city ownership transfers after combat
 * 
 * When a city is captured:
 * 1. Update city's countryId to winner
 * 2. Recalculate country stats (winner gains, loser loses)
 * 3. Check for country elimination
 */
export class CityTransfer {
  /**
   * Transfer a city from one country to another
   * Updates both countries' stats (resources, population)
   */
  static transferCity(
    city: City,
    fromCountryId: string,
    toCountryId: string,
    state: GameState
  ): { 
    updatedCity: City; 
    fromStats: CountryStats; 
    toStats: CountryStats;
    fromEliminated: boolean;
  } {
    const fromStats = state.data.countryStatsByCountryId[fromCountryId];
    const toStats = state.data.countryStatsByCountryId[toCountryId];
    
    if (!fromStats || !toStats) {
      throw new Error("Country stats not found for city transfer");
    }
    
    // Update city ownership
    const updatedCity: City = {
      ...city,
      countryId: toCountryId,
      isUnderAttack: false, // Clear attack status
    };
    
    // Remove resources and population from original owner
    const updatedFromStats: CountryStats = {
      ...fromStats,
      population: fromStats.population - city.population,
      resources: this.subtractResources(fromStats.resources, city.perTurnResources),
    };
    
    // Add resources and population to new owner
    const updatedToStats: CountryStats = {
      ...toStats,
      population: toStats.population + city.population,
      resources: this.addResources(toStats.resources, city.perTurnResources),
    };
    
    // Check if loser still has cities (elimination check happens in turn processing)
    // We don't check here since we need to query the database for remaining cities
    
    return {
      updatedCity,
      fromStats: updatedFromStats,
      toStats: updatedToStats,
      fromEliminated: false, // Will be checked by turn processor
    };
  }
  
  /**
   * Add resources together
   */
  private static addResources(
    base: Record<string, number>,
    toAdd: Record<string, number>
  ): Record<string, number> {
    const result = { ...base };
    for (const [resource, amount] of Object.entries(toAdd)) {
      result[resource] = (result[resource] || 0) + amount;
    }
    return result;
  }
  
  /**
   * Subtract resources
   */
  private static subtractResources(
    base: Record<string, number>,
    toSubtract: Record<string, number>
  ): Record<string, number> {
    const result = { ...base };
    for (const [resource, amount] of Object.entries(toSubtract)) {
      result[resource] = Math.max(0, (result[resource] || 0) - amount);
    }
    return result;
  }
}
