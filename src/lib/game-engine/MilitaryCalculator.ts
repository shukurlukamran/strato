/**
 * Military Calculator
 * Handles military-related calculations including effectiveness, costs, and power
 */

import type { CountryStats } from '@/types/country';
import { ECONOMIC_BALANCE } from './EconomicBalance';
import { getProfileMilitaryCostModifier, getProfileMilitaryEffectivenessModifier } from './ProfileModifiers';

export class MilitaryCalculator {
  /**
   * Calculate effective military strength (includes tech bonus)
   * This is the actual combat power of the military
   */
  static calculateEffectiveMilitaryStrength(stats: CountryStats): number {
    const baseStrength = stats.militaryStrength || 0;
    const techLevel = stats.technologyLevel || 0;
    
    // Technology provides military effectiveness bonus
    const techEffectiveness = 1 + (techLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL);
    
    // Profile modifier (future use - currently most are 1.0)
    const profileModifier = getProfileMilitaryEffectivenessModifier(stats.resourceProfile);
    
    const effectiveStrength = baseStrength * techEffectiveness * profileModifier;
    return Math.floor(effectiveStrength);
  }
  
  /**
   * Calculate military effectiveness multiplier only (for display)
   */
  static calculateMilitaryEffectivenessMultiplier(stats: CountryStats): number {
    const techLevel = stats.technologyLevel || 0;
    const techEffectiveness = 1 + (techLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL);
    const profileModifier = getProfileMilitaryEffectivenessModifier(stats.resourceProfile);
    
    return techEffectiveness * profileModifier;
  }
  
  /**
   * Calculate military recruitment cost with tech and profile modifiers
   */
  static calculateRecruitmentCost(
    amount: number,
    stats: CountryStats
  ): number {
    const baseCostPerPoint = ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT;
    const techLevel = stats.technologyLevel || 0;
    
    // Technology reduces military costs
    const techReduction = Math.min(
      ECONOMIC_BALANCE.TECHNOLOGY.MAX_MILITARY_COST_REDUCTION,
      techLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_COST_REDUCTION_PER_LEVEL
    );
    const techCostMultiplier = 1 - techReduction;
    
    // Profile cost modifier
    const profileModifier = getProfileMilitaryCostModifier(stats.resourceProfile);
    
    const finalCostPerPoint = baseCostPerPoint * techCostMultiplier * profileModifier;
    return Math.floor(amount * finalCostPerPoint);
  }
  
  /**
   * Calculate military upkeep cost (per turn)
   */
  static calculateMilitaryUpkeep(militaryStrength: number): number {
    return militaryStrength * ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH;
  }
  
  /**
   * Get military effectiveness bonus percentage from tech (for display)
   */
  static getTechMilitaryBonus(techLevel: number): number {
    return techLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL * 100;
  }
  
  /**
   * Get military cost reduction percentage from tech (for display)
   */
  static getTechCostReduction(techLevel: number): number {
    const reduction = Math.min(
      ECONOMIC_BALANCE.TECHNOLOGY.MAX_MILITARY_COST_REDUCTION,
      techLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_COST_REDUCTION_PER_LEVEL
    );
    return reduction * 100;
  }
}
