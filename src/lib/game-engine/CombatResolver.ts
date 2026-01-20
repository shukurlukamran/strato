import type { City, CountryStats } from "@/types/country";
import { MilitaryCalculator } from "./MilitaryCalculator";
import { ECONOMIC_BALANCE } from "./EconomicBalance";

/**
 * Combat Resolution System
 * Handles military attacks between countries targeting cities
 */
export interface CombatResult {
  attackerCountryId: string;
  defenderCountryId: string;
  targetCityId: string;
  attackerMilitaryAllocated: number;
  defenderMilitaryAllocated: number;
  attackerCasualties: number;
  defenderCasualties: number;
  cityCaptured: boolean;
  combatLog: string[];
}

export class CombatResolver {
  /**
   * Resolve a military attack on a city
   */
  static resolveCombat(
    attackerStats: CountryStats,
    defenderStats: CountryStats,
    targetCity: City,
    attackerMilitaryPercentage: number, // 0-100
    defenderMilitaryPercentage: number, // 0-100
    isLiveResolution: boolean = false
  ): CombatResult {
    const combatLog: string[] = [];

    // Calculate effective military strengths allocated to this combat
    const attackerEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(attackerStats);
    const defenderEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(defenderStats);

    const attackerAllocatedStrength = Math.floor(attackerEffectiveStrength * (attackerMilitaryPercentage / 100));
    const defenderAllocatedStrength = Math.floor(defenderEffectiveStrength * (defenderMilitaryPercentage / 100));

    combatLog.push(`${attackerStats.id} attacks ${targetCity.name} with ${attackerAllocatedStrength} military strength`);
    combatLog.push(`${defenderStats.id} defends with ${defenderAllocatedStrength} military strength`);

    // Combat resolution using a modified Lanchester's square law
    // (square law favors concentrated forces)
    const attackerPower = Math.pow(attackerAllocatedStrength, 1.5);
    const defenderPower = Math.pow(defenderAllocatedStrength, 1.5);

    const totalPower = attackerPower + defenderPower;
    const attackerWinChance = attackerPower / totalPower;

    // Add some randomness (±15%)
    const randomFactor = 0.85 + Math.random() * 0.3;
    const adjustedWinChance = Math.max(0, Math.min(1, attackerWinChance * randomFactor));

    const attackerWins = Math.random() < adjustedWinChance;
    const cityCaptured = attackerWins;

    combatLog.push(`Combat intensity: ${attackerPower.toFixed(1)} vs ${defenderPower.toFixed(1)}`);
    combatLog.push(`Attacker win chance: ${(adjustedWinChance * 100).toFixed(1)}%`);

    if (attackerWins) {
      combatLog.push(`${attackerStats.id} captures ${targetCity.name}!`);
    } else {
      combatLog.push(`${defenderStats.id} successfully defends ${targetCity.name}`);
    }

    // Calculate casualties (military weakening)
    const baseCasualtyRate = ECONOMIC_BALANCE.MILITARY.COMBAT_CASUALTY_RATE;
    const totalStrengthEngaged = attackerAllocatedStrength + defenderAllocatedStrength;

    // Casualties scale with combat intensity
    const combatIntensity = Math.min(1, totalStrengthEngaged / Math.max(attackerEffectiveStrength, defenderEffectiveStrength));
    const casualtyMultiplier = 1 + combatIntensity * 0.5; // Up to 50% more casualties in intense combat

    let attackerCasualties = Math.floor(attackerAllocatedStrength * baseCasualtyRate * casualtyMultiplier);
    let defenderCasualties = Math.floor(defenderAllocatedStrength * baseCasualtyRate * casualtyMultiplier);

    // Winner takes fewer casualties
    if (attackerWins) {
      attackerCasualties = Math.floor(attackerCasualties * 0.7);
      defenderCasualties = Math.floor(defenderCasualties * 1.3);
    } else {
      defenderCasualties = Math.floor(defenderCasualties * 0.7);
      attackerCasualties = Math.floor(attackerCasualties * 1.3);
    }

    // Ensure casualties don't exceed allocated strength
    attackerCasualties = Math.min(attackerCasualties, attackerAllocatedStrength);
    defenderCasualties = Math.min(defenderCasualties, defenderAllocatedStrength);

    combatLog.push(`Attacker casualties: ${attackerCasualties}, Defender casualties: ${defenderCasualties}`);

    return {
      attackerCountryId: attackerStats.id,
      defenderCountryId: defenderStats.id,
      targetCityId: targetCity.id,
      attackerMilitaryAllocated: attackerAllocatedStrength,
      defenderMilitaryAllocated: defenderAllocatedStrength,
      attackerCasualties,
      defenderCasualties,
      cityCaptured,
      combatLog
    };
  }

  /**
   * Calculate attack cost (diplomatic, economic, etc.)
   */
  static calculateAttackCost(
    attackerStats: CountryStats,
    targetCity: City,
    militaryAllocated: number
  ): {
    economicCost: number;
    diplomaticPenalty: number;
    description: string;
  } {
    // Economic cost scales with military allocated and distance
    const baseCost = ECONOMIC_BALANCE.MILITARY.ATTACK_BASE_COST;
    const militaryCostMultiplier = militaryAllocated * ECONOMIC_BALANCE.MILITARY.ATTACK_COST_PER_STRENGTH;
    const economicCost = Math.floor(baseCost + militaryCostMultiplier);

    // Diplomatic penalty based on relationship and attack scale
    const diplomaticPenalty = Math.floor(militaryAllocated * 0.1); // 0.1 relationship points per strength point

    return {
      economicCost,
      diplomaticPenalty,
      description: `Attack costs ${economicCost} budget and reduces diplomatic relations by ${diplomaticPenalty} points`
    };
  }

  /**
   * Apply combat results to country stats
   */
  static applyCombatResults(
    result: CombatResult,
    attackerStats: CountryStats,
    defenderStats: CountryStats
  ): { attackerStats: CountryStats; defenderStats: CountryStats } {
    const updatedAttackerStats = {
      ...attackerStats,
      militaryStrength: Math.max(0, attackerStats.militaryStrength - result.attackerCasualties),
      // Reduce diplomatic relations
      diplomaticRelations: {
        ...attackerStats.diplomaticRelations,
        [result.defenderCountryId]: Math.max(
          -100,
          (attackerStats.diplomaticRelations[result.defenderCountryId] || 0) -
          CombatResolver.calculateAttackCost(attackerStats, { id: result.targetCityId } as City, result.attackerMilitaryAllocated).diplomaticPenalty
        )
      }
    };

    const updatedDefenderStats = {
      ...defenderStats,
      militaryStrength: Math.max(0, defenderStats.militaryStrength - result.defenderCasualties),
      // Reduce diplomatic relations
      diplomaticRelations: {
        ...defenderStats.diplomaticRelations,
        [result.attackerCountryId]: Math.max(
          -100,
          (defenderStats.diplomaticRelations[result.attackerCountryId] || 0) -
          CombatResolver.calculateAttackCost(attackerStats, { id: result.targetCityId } as City, result.attackerMilitaryAllocated).diplomaticPenalty
        )
      }
    };

    return {
      attackerStats: updatedAttackerStats,
      defenderStats: updatedDefenderStats
    };
  }

  /**
   * Check if a city can be attacked (neighboring city validation)
   */
  static canAttackCity(attackerCity: City, targetCity: City, maxDistance: number = 5): boolean {
    // Cities must belong to different countries
    if (attackerCity.countryId === targetCity.countryId) {
      return false;
    }

    // Cities must be within attack range
    const distance = Math.sqrt(
      Math.pow(attackerCity.positionX - targetCity.positionX, 2) +
      Math.pow(attackerCity.positionY - targetCity.positionY, 2)
    );

    return distance <= maxDistance;
  }
}