import type { CountryStats } from "@/types/country";
import { MilitaryCalculator } from "./MilitaryCalculator";

export interface CombatResult {
  attackerWins: boolean;
  attackerLosses: number;
  defenderLosses: number;
  attackerEffective: number;
  defenderEffective: number;
}

/**
 * CombatResolver - Resolves combat between attacker and defender
 * 
 * Features:
 * - Tech-based effectiveness bonuses
 * - Defender terrain advantage (20% bonus)
 * - Probabilistic outcomes with strength-based chances
 * - Both sides take losses (winner loses less)
 */
export class CombatResolver {
  private static readonly DEFENSE_BONUS = 1.2; // 20% bonus for defender
  private static readonly SIGMOID_STEEPNESS = 2.5;
  
  /**
   * Resolve combat between attacker and defender
   * Returns combat result including winner and losses
   */
  static resolveCombat(
    attackerStrength: number,
    defenderStrength: number,
    attackerStats: CountryStats,
    defenderStats: CountryStats
  ): CombatResult {
    // Calculate effective strengths (with tech bonuses)
    const attackerEffective = MilitaryCalculator.calculateEffectiveMilitaryStrength({
      ...attackerStats,
      militaryStrength: attackerStrength
    });
    
    const defenderEffective = MilitaryCalculator.calculateEffectiveMilitaryStrength({
      ...defenderStats,
      militaryStrength: defenderStrength
    });
    
    // Add defense bonus (defenders have terrain advantage)
    const adjustedDefender = defenderEffective * this.DEFENSE_BONUS;
    
    // Calculate strength ratio
    const ratio = attackerEffective / adjustedDefender;
    
    // Determine winner (with some randomness for unpredictability)
    const baseChance = this.strengthRatioToWinChance(ratio);
    const random = Math.random();
    const attackerWins = random < baseChance;
    
    // Calculate losses (both sides lose troops)
    // Loser loses more
    let attackerLosses: number;
    let defenderLosses: number;
    
    if (attackerWins) {
      // Attacker wins: loses 20-40% of allocated strength
      attackerLosses = Math.floor(
        attackerStrength * (0.2 + Math.random() * 0.2)
      );
      // Defender loses 40-70% of allocated strength
      defenderLosses = Math.floor(
        defenderStrength * (0.4 + Math.random() * 0.3)
      );
    } else {
      // Defender wins: attacker loses 50-80%
      attackerLosses = Math.floor(
        attackerStrength * (0.5 + Math.random() * 0.3)
      );
      // Defender loses 20-40%
      defenderLosses = Math.floor(
        defenderStrength * (0.2 + Math.random() * 0.2)
      );
    }
    
    return {
      attackerWins,
      attackerLosses,
      defenderLosses,
      attackerEffective,
      defenderEffective,
    };
  }
  
  /**
   * Convert strength ratio to win probability using sigmoid function
   * - ratio = 1.0 → 50% chance (equal strength)
   * - ratio = 2.0 → ~80% chance
   * - ratio = 0.5 → ~20% chance
   */
  private static strengthRatioToWinChance(ratio: number): number {
    if (ratio >= 3.0) return 0.95; // Cap at 95%
    if (ratio <= 0.33) return 0.05; // Floor at 5%
    
    // Sigmoid function: 1 / (1 + e^(-k * (x - 1)))
    return 1 / (1 + Math.exp(-this.SIGMOID_STEEPNESS * (ratio - 1)));
  }
}
