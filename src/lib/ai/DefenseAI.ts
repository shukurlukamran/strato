import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CountryStats, City } from "@/types/country";

/**
 * Defense AI - Uses LLM to decide military allocation for defense
 * Called when AI countries are attacked by players (for fairness)
 */
export class DefenseAI {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("DefenseAI: GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY environment variable is not set.");
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }

  /**
   * Decide military allocation for defense against a player attack
   * IMPORTANT: Player's attack allocation is NOT revealed for fairness
   */
  async decideDefenseAllocation(
    defenderStats: CountryStats,
    targetCity: City,
    attackerCountryName: string
  ): Promise<number> {
    // If no LLM available, use rule-based fallback
    if (!this.model) {
      return this.ruleBasedDefenseAllocation(defenderStats, targetCity);
    }

    try {
      const prompt = this.buildDefensePrompt(defenderStats, targetCity, attackerCountryName);

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Parse the response to extract military percentage
      const percentage = this.parseDefenseDecision(text);

      // Validate the response (10-100%)
      if (percentage >= 10 && percentage <= 100) {
        return percentage;
      } else {
        console.warn(`DefenseAI: Invalid percentage ${percentage}, using fallback`);
        return this.ruleBasedDefenseAllocation(defenderStats, targetCity);
      }
    } catch (error) {
      console.error("DefenseAI: Error calling LLM:", error);
      return this.ruleBasedDefenseAllocation(defenderStats, targetCity);
    }
  }

  private buildDefensePrompt(
    defenderStats: CountryStats,
    targetCity: City,
    attackerCountryName: string
  ): string {
    const cityValue = this.calculateCityValue(targetCity);
    const militaryRatio = defenderStats.militaryStrength / Math.max(defenderStats.population / 10000, 1);

    return `You are the AI leader of ${defenderStats.id} defending against an attack from ${attackerCountryName} on your city ${targetCity.name}.

YOUR CURRENT SITUATION:
- Military Strength: ${defenderStats.militaryStrength} units
- Population: ${defenderStats.population.toLocaleString()}
- Budget: ${defenderStats.budget}
- Technology Level: ${defenderStats.technologyLevel}
- City Being Attacked: ${targetCity.name}
- City's Strategic Value: ${cityValue}/10 (resources + population importance)

STRATEGIC CONTEXT:
- Military-to-Population Ratio: ${militaryRatio.toFixed(2)} (higher = more militarized)
- Attacker's military allocation is UNKNOWN (for fairness)

DEFENSE DECISION:
You must decide what percentage of your military strength (10-100%) to allocate to defend this city.

Consider:
- How important is this city to your economy?
- How militarized is your nation?
- What's your overall strategic situation?
- Risk of over-committing forces

Respond with ONLY a percentage number between 10 and 100, followed by a brief rationale.

Example: "75% - This city is crucial to our resource production and we have sufficient forces to defend it strongly."`;
  }

  private parseDefenseDecision(text: string): number {
    // Extract the first percentage number from the response
    const percentageMatch = text.match(/(\d+)%/);
    if (percentageMatch) {
      return parseInt(percentageMatch[1], 10);
    }

    // Fallback: look for just a number
    const numberMatch = text.match(/(\d+)/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1], 10);
      if (num >= 10 && num <= 100) {
        return num;
      }
    }

    // If parsing fails, return rule-based fallback
    return 50;
  }

  private calculateCityValue(city: City): number {
    // Calculate strategic value of the city (0-10 scale)
    const resourceValue = Object.values(city.resourcesPerTurn).reduce((sum, amount) => sum + amount, 0);
    const populationValue = city.population / 10000; // Population in 10k units

    // Weight resources more heavily than population
    const totalValue = (resourceValue * 2) + populationValue;

    // Normalize to 0-10 scale (assuming max city value around 50)
    return Math.min(10, Math.max(1, Math.floor(totalValue / 5)));
  }

  private ruleBasedDefenseAllocation(defenderStats: CountryStats, targetCity: City): number {
    // Rule-based fallback when LLM is not available
    const cityValue = this.calculateCityValue(targetCity);
    const militaryRatio = defenderStats.militaryStrength / Math.max(defenderStats.population / 10000, 1);

    // Base allocation based on city value
    let baseAllocation = 40 + (cityValue * 3); // 40-70% based on city value

    // Adjust based on military ratio
    if (militaryRatio > 2) {
      baseAllocation += 10; // Well-militarized nations defend more aggressively
    } else if (militaryRatio < 0.5) {
      baseAllocation -= 10; // Weak militaries are more conservative
    }

    // Ensure within bounds
    return Math.max(20, Math.min(80, baseAllocation));
  }
}