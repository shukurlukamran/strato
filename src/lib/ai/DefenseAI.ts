import type { City } from "@/types/city";
import type { CountryStats } from "@/types/country";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { MilitaryCalculator } from "@/lib/game-engine/MilitaryCalculator";

/**
 * DefenseAI - Decides defensive allocations for AI countries under attack
 * 
 * Fully rule-based system with sophisticated randomization to provide
 * unpredictable yet strategic defense decisions without LLM API costs.
 */
export class DefenseAI {
  /**
   * Decide how much military strength to allocate for defense
   * 
   * @param state - Current game state
   * @param defendingCountryId - Country being attacked
   * @param targetCity - City under attack
   * @param attackingCountryId - Country attacking
   * @returns Allocated defense strength
   */
  static async decideDefenseAllocation(
    state: GameStateSnapshot,
    defendingCountryId: string,
    targetCity: City,
    attackingCountryId: string
  ): Promise<number> {
    const defenderStats = state.countryStatsByCountryId[defendingCountryId];
    const attackerStats = state.countryStatsByCountryId[attackingCountryId];
    
    if (!defenderStats || !attackerStats) {
      console.error(`[DefenseAI] Missing stats for defense decision`);
      return Math.floor(defenderStats?.militaryStrength * 0.5 || 0);
    }

    return this.ruleBasedDefenseDecision(
      targetCity,
      defenderStats,
      attackerStats
    );
  }

  /**
   * Sophisticated rule-based defense decision with randomization
   * Provides strategic and unpredictable defense without LLM costs
   */
  private static ruleBasedDefenseDecision(
    city: City,
    defenderStats: CountryStats,
    attackerStats: CountryStats
  ): number {
    // Use effective strength (includes tech bonuses)
    const defenderEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(defenderStats);
    const attackerEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(attackerStats);
    
    if (defenderEffectiveStrength < 10) {
      return defenderEffectiveStrength; // Use everything if very weak
    }
    
    // Calculate city strategic value
    const cityValue = this.calculateCityValue(city);
    const cityPopulationRatio = city.population / Math.max(1, defenderStats.population);
    
    // Base allocation based on city importance (20-70%)
    let baseAllocation = 0.2 + (cityPopulationRatio * 0.5);
    
    // Strategic adjustments based on attacker strength
    const strengthRatio = attackerEffectiveStrength / defenderEffectiveStrength;
    
    if (strengthRatio > 2.5) {
      // Attacker is overwhelmingly stronger - desperate defense
      baseAllocation += 0.25;
    } else if (strengthRatio > 1.8) {
      // Attacker is much stronger - commit heavily
      baseAllocation += 0.2;
    } else if (strengthRatio > 1.2) {
      // Attacker is stronger - defend solidly
      baseAllocation += 0.1;
    } else if (strengthRatio < 0.4) {
      // Attacker is much weaker - minimal defense needed
      baseAllocation -= 0.15;
    } else if (strengthRatio < 0.7) {
      // Attacker is weaker - conservative defense
      baseAllocation -= 0.08;
    }
    
    // Technology advantage considerations
    const techDiff = defenderStats.technologyLevel - attackerStats.technologyLevel;
    if (techDiff >= 3) {
      // Significant tech advantage - can use much less
      baseAllocation -= 0.15;
    } else if (techDiff >= 2) {
      // Good tech advantage - use less
      baseAllocation -= 0.1;
    } else if (techDiff === 1) {
      // Slight tech advantage - minor adjustment
      baseAllocation -= 0.05;
    } else if (techDiff <= -3) {
      // Significant tech disadvantage - need much more
      baseAllocation += 0.15;
    } else if (techDiff <= -2) {
      // Tech disadvantage - need more
      baseAllocation += 0.1;
    } else if (techDiff === -1) {
      // Slight tech disadvantage - minor adjustment
      baseAllocation += 0.05;
    }
    
    // Resource value consideration - defend high-value resource cities more
    const hasValuableResources = Object.entries(city.perTurnResources).some(
      ([resource, amount]) => 
        ['oil', 'gold', 'steel'].includes(resource.toLowerCase()) && amount > 3
    );
    if (hasValuableResources) {
      baseAllocation += 0.08;
    }
    
    // Budget consideration - if low on budget, might take more risks
    const budgetRatio = defenderStats.budget / Math.max(1, defenderStats.population * 0.1);
    if (budgetRatio < 0.5) {
      // Desperate economic situation - might over-commit or under-commit randomly
      const desperateRandom = Math.random();
      if (desperateRandom > 0.6) {
        baseAllocation += 0.1; // 40% chance: fight desperately to protect economy
      } else {
        baseAllocation -= 0.05; // 60% chance: conserve forces for later
      }
    }
    
    // RANDOMIZATION: Add strategic unpredictability (±8% variation)
    // This makes each defense decision unique and less predictable
    const randomFactor = (Math.random() - 0.5) * 0.16; // -0.08 to +0.08
    baseAllocation += randomFactor;
    
    // Personality-based variance: Some defenders are more aggressive/conservative
    // Use city ID as seed for consistency per city
    const citySeed = city.id.charCodeAt(0) % 10;
    const personalityAdjustment = (citySeed / 10 - 0.45) * 0.12; // -0.054 to +0.054
    baseAllocation += personalityAdjustment;
    
    // Clamp to reasonable tactical range (25-85%)
    const finalAllocation = Math.max(0.25, Math.min(0.85, baseAllocation));
    
    const allocatedStrength = Math.floor(defenderEffectiveStrength * finalAllocation);
    
    console.log(`[DefenseAI] Defending ${city.name}: ${(finalAllocation * 100).toFixed(1)}% (${allocatedStrength}/${defenderEffectiveStrength} effective strength) - Strategic factors: strength ratio ${strengthRatio.toFixed(2)}, tech diff ${techDiff}, city value ${cityValue.toFixed(0)}`);
    
    return allocatedStrength;
  }

  /**
   * Calculate strategic value of a city
   */
  private static calculateCityValue(city: City): number {
    let value = 0;
    
    // Population value (1 point per 1000 population)
    value += city.population / 1000;
    
    // Resource value (weighted by resource importance - 8-resource system)
    const resourceValues: Record<string, number> = {
      oil: 15,
      gold: 20,
      steel: 12,
      coal: 10,
      iron: 10,
      copper: 8,
      food: 8,
      timber: 6,
    };
    
    for (const [resource, amount] of Object.entries(city.perTurnResources)) {
      const weight = resourceValues[resource.toLowerCase()] || 10;
      value += amount * weight;
    }
    
    return value;
  }
}
