import type { City } from "@/types/city";
import type { CountryStats } from "@/types/country";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { MilitaryCalculator } from "@/lib/game-engine/MilitaryCalculator";

/**
 * DefenseAI - Decides defensive allocations for AI countries under attack
 * 
 * Two modes:
 * 1. LLM-based: Used when Player attacks AI (more intelligent, unpredictable)
 * 2. Rule-based: Used for AI vs AI combat (faster, cheaper)
 */
export class DefenseAI {
  /**
   * Decide how much military strength to allocate for defense
   * 
   * @param state - Current game state
   * @param defendingCountryId - Country being attacked
   * @param targetCity - City under attack
   * @param attackingCountryId - Country attacking
   * @param useLLM - Whether to use LLM (true for Player vs AI, false for AI vs AI)
   * @returns Allocated defense strength
   */
  static async decideDefenseAllocation(
    state: GameStateSnapshot,
    defendingCountryId: string,
    targetCity: City,
    attackingCountryId: string,
    useLLM: boolean = false
  ): Promise<number> {
    const defenderStats = state.countryStatsByCountryId[defendingCountryId];
    const attackerStats = state.countryStatsByCountryId[attackingCountryId];
    
    if (!defenderStats || !attackerStats) {
      console.error(`[DefenseAI] Missing stats for defense decision`);
      return Math.floor(defenderStats?.militaryStrength * 0.5 || 0);
    }

    if (useLLM) {
      return this.llmDefenseDecision(
        state,
        targetCity,
        defenderStats,
        attackerStats
      );
    } else {
      return this.ruleBasedDefenseDecision(
        targetCity,
        defenderStats,
        attackerStats
      );
    }
  }

  /**
   * Rule-based defense decision (for AI vs AI combat)
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
    
    // Calculate city value relative to total country value
    const cityValue = this.calculateCityValue(city);
    const cityPopulationRatio = city.population / Math.max(1, defenderStats.population);
    
    // Base allocation based on city importance (20-70%)
    let baseAllocation = 0.2 + (cityPopulationRatio * 0.5);
    
    // Adjust based on attacker's total strength (using effective strength)
    const strengthRatio = attackerEffectiveStrength / defenderEffectiveStrength;
    
    if (strengthRatio > 2.0) {
      // Attacker is much stronger - commit more to defend
      baseAllocation += 0.2;
    } else if (strengthRatio < 0.5) {
      // Attacker is much weaker - can defend with less
      baseAllocation -= 0.1;
    }
    
    // Adjust based on tech level difference
    const techDiff = defenderStats.technologyLevel - attackerStats.technologyLevel;
    if (techDiff > 2) {
      // We have tech advantage - can use less
      baseAllocation -= 0.1;
    } else if (techDiff < -2) {
      // They have tech advantage - need more
      baseAllocation += 0.1;
    }
    
    // Clamp to reasonable range (30-80%)
    const finalAllocation = Math.max(0.3, Math.min(0.8, baseAllocation));
    
    return Math.floor(defenderEffectiveStrength * finalAllocation);
  }

  /**
   * LLM-based defense decision (for Player vs AI combat)
   * AI does NOT know the player's allocation - this is fair
   */
  private static async llmDefenseDecision(
    state: GameStateSnapshot,
    city: City,
    defenderStats: CountryStats,
    attackerStats: CountryStats
  ): Promise<number> {
    const prompt = this.buildDefensePrompt(city, defenderStats, attackerStats, state);
    
    try {
      const response = await this.callLLM(prompt);
      const percentage = this.parseDefensePercentage(response);
      
      // Convert percentage to actual effective strength
      const defenderEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(defenderStats);
      const allocatedStrength = Math.floor(defenderEffectiveStrength * (percentage / 100));
      
      console.log(`[DefenseAI LLM] Defending ${city.name}: ${percentage}% (${allocatedStrength} effective strength)`);
      
      return allocatedStrength;
    } catch (error) {
      console.error(`[DefenseAI LLM] Failed to get LLM decision, falling back to rule-based:`, error);
      return this.ruleBasedDefenseDecision(city, defenderStats, attackerStats);
    }
  }

  /**
   * Build prompt for LLM defense decision
   */
  private static buildDefensePrompt(
    city: City,
    defenderStats: CountryStats,
    attackerStats: CountryStats,
    state: GameStateSnapshot
  ): string {
    const defenderCountry = state.countries.find(c => c.id === city.countryId);
    const attackerCountry = state.countries.find(c => c.id === attackerStats.countryId);
    
    const defenderEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(defenderStats);
    const attackerEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(attackerStats);
    
    const resourceList = Object.entries(city.perTurnResources)
      .map(([resource, amount]) => `${resource}: ${amount}/turn`)
      .join(", ");

    return `You are defending your city from an enemy attack. You must decide what percentage of your military to commit to defense.

YOUR COUNTRY: ${defenderCountry?.name || "Unknown"}
- Total Military Strength: ${defenderEffectiveStrength} (effective strength with tech bonuses)
- Technology Level: ${defenderStats.technologyLevel}
- Budget: $${defenderStats.budget.toLocaleString()}
- Population: ${defenderStats.population.toLocaleString()}

CITY UNDER ATTACK: ${city.name}
- Population: ${city.population.toLocaleString()}
- Resources: ${resourceList || "None"}
- Strategic Value: ${this.calculateCityValue(city).toFixed(0)} points

ATTACKER: ${attackerCountry?.name || "Unknown"}
- Total Military Strength: ${attackerEffectiveStrength} (effective strength with tech bonuses)
- Technology Level: ${attackerStats.technologyLevel}
- Note: You do NOT know how much strength they allocated for this attack

IMPORTANT CONSIDERATIONS:
1. This city represents ${((city.population / defenderStats.population) * 100).toFixed(1)}% of your population
2. Losing this city means losing its resources and population permanently
3. You need to balance defending this city vs keeping reserves for other threats
4. Committing too much leaves other cities vulnerable
5. Committing too little risks losing this city

DECISION REQUIRED:
Respond with ONLY a number between 30 and 90 representing the percentage of your military to commit.
(Minimum 30% to have a fighting chance, maximum 90% to keep reserves)

Your decision:`;
  }

  /**
   * Call LLM API (uses Google Gemini)
   */
  private static async callLLM(prompt: string): Promise<string> {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY not configured");
    }

    // Use Gemini 2.5 Flash (matches existing LLM usage in codebase)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100,
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    return text.trim();
  }

  /**
   * Parse defense percentage from LLM response
   */
  private static parseDefensePercentage(response: string): number {
    // Extract first number from response
    const match = response.match(/\d+/);
    const percentage = match ? parseInt(match[0]) : 50;
    
    // Clamp to valid range (30-90%)
    return Math.max(30, Math.min(90, percentage));
  }

  /**
   * Calculate strategic value of a city
   */
  private static calculateCityValue(city: City): number {
    let value = 0;
    
    // Population value (1 point per 1000 population)
    value += city.population / 1000;
    
    // Resource value (weighted by resource importance)
    const resourceValues: Record<string, number> = {
      oil: 15,
      uranium: 20,
      raremetals: 18,
      gems: 12,
      coal: 10,
      iron: 10,
      food: 8,
      wood: 6,
    };
    
    for (const [resource, amount] of Object.entries(city.perTurnResources)) {
      const weight = resourceValues[resource.toLowerCase()] || 10;
      value += amount * weight;
    }
    
    return value;
  }
}
