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
 * - Expects EFFECTIVE STRENGTH inputs (tech bonuses already applied by caller)
 * - Defender terrain advantage (20% bonus applied during combat resolution)
 * - Probabilistic outcomes with strength-based chances
 * - Both sides take losses (winner loses less)
 * - Losses are converted back to raw military units (divided by tech multiplier)
 *   to ensure high-tech nations don't lose disproportionately many units
 * 
 * IMPORTANT: 
 * - attackerStrength and defenderStrength should be EFFECTIVE (tech-boosted)
 * - Losses returned are in RAW MILITARY UNITS for subtraction from militaryStrength
 */
export class CombatResolver {
  private static readonly DEFENSE_BONUS = 1.2; // 20% bonus for defender
  private static readonly SIGMOID_STEEPNESS = 2.5;
  
  /**
   * Resolve combat between attacker and defender
   * Returns combat result including winner and losses
   * 
   * IMPORTANT: attackerStrength and defenderStrength are expected to be ALREADY EFFECTIVE
   * (i.e., tech bonuses already applied by AttackModal/DefenseModal/DefenseAI)
   */
  static resolveCombat(
    attackerStrength: number,
    defenderStrength: number,
    attackerStats: CountryStats,
    defenderStats: CountryStats
  ): CombatResult {
    // FIXED: Do NOT re-apply tech bonuses since attackerStrength/defenderStrength 
    // are already effective strengths (tech-boosted) from the UI/AI
    const attackerEffective = attackerStrength;
    const defenderEffective = defenderStrength;
    
    // Add defense bonus (defenders have terrain advantage)
    const adjustedDefender = defenderEffective * this.DEFENSE_BONUS;
    
    // Calculate strength ratio
    const ratio = attackerEffective / adjustedDefender;
    
    // Determine winner (with some randomness for unpredictability)
    const baseChance = this.strengthRatioToWinChance(ratio);
    const random = Math.random();
    const attackerWins = random < baseChance;
    
    // Calculate losses (both sides lose troops)
    // Losses are calculated as percentage of allocated effective strength, 
    // then converted back to raw military units by dividing by tech effectiveness
    // This ensures high-tech nations don't lose disproportionately many units
    
    const attackerTechMultiplier = 1 + ((attackerStats.technologyLevel || 0) * 0.20);
    const defenderTechMultiplier = 1 + ((defenderStats.technologyLevel || 0) * 0.20);
    
    let attackerEffectiveLosses: number;
    let defenderEffectiveLosses: number;
    
    if (attackerWins) {
      // Attacker wins: loses 20-40% of allocated strength
      attackerEffectiveLosses = attackerStrength * (0.2 + Math.random() * 0.2);
      // Defender loses 40-70% of allocated strength
      defenderEffectiveLosses = defenderStrength * (0.4 + Math.random() * 0.3);
    } else {
      // Defender wins: attacker loses 50-80%
      attackerEffectiveLosses = attackerStrength * (0.5 + Math.random() * 0.3);
      // Defender loses 20-40%
      defenderEffectiveLosses = defenderStrength * (0.2 + Math.random() * 0.2);
    }
    
    // Convert effective losses to raw unit losses
    // (divide by tech multiplier to get raw units)
    const attackerLosses = Math.floor(attackerEffectiveLosses / attackerTechMultiplier);
    const defenderLosses = Math.floor(defenderEffectiveLosses / defenderTechMultiplier);
    
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
