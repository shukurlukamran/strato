/**
 * Client-side Economic Utilities
 * Provides economic calculations for UI display without requiring database access.
 */

import type { Country, CountryStats } from '@/types/country';
import { ResourceProduction, ProductionOutput } from './ResourceProduction';
import { BudgetCalculator, BudgetBreakdown } from './BudgetCalculator';
import { MilitaryCalculator } from './MilitaryCalculator';
import { ResourceAmount } from './ResourceTypes';
import { ECONOMIC_BALANCE } from './EconomicBalance';
import { getProfileTechCostModifier, getProfileInfraCostModifier } from './ProfileModifiers';

/**
 * Calculate production output for display (client-side)
 */
export function calculateProductionForDisplay(
  country: Country,
  stats: CountryStats
): ProductionOutput {
  return ResourceProduction.calculateProduction(country, stats);
}

/**
 * Calculate budget breakdown for display (client-side)
 */
export function calculateBudgetForDisplay(
  country: Country,
  stats: CountryStats,
  activeDealsValue: number = 0
): BudgetBreakdown {
  return BudgetCalculator.calculateBudget(country, stats, activeDealsValue);
}

/**
 * Calculate resource consumption for display
 */
export function calculateConsumptionForDisplay(
  stats: CountryStats
): ResourceAmount[] {
  const populationUnits = stats.population / 10000;
  
  return [
    {
      resourceId: 'food',
      amount: Math.ceil(populationUnits * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION)
    }
  ];
}

/**
 * Convert Record<string, number> to ResourceAmount[]
 */
export function resourcesToArray(resources: Record<string, number>): ResourceAmount[] {
  return Object.entries(resources).map(([resourceId, amount]) => ({
    resourceId,
    amount: Number(amount) || 0
  }));
}

/**
 * Calculate effective military strength (for display)
 */
export function calculateEffectiveMilitaryStrength(stats: CountryStats): number {
  return MilitaryCalculator.calculateEffectiveMilitaryStrength(stats);
}

/**
 * Calculate military effectiveness multiplier (for display)
 */
export function calculateMilitaryEffectivenessMultiplier(stats: CountryStats): number {
  return MilitaryCalculator.calculateMilitaryEffectivenessMultiplier(stats);
}

/**
 * Calculate population capacity (for display)
 */
export function calculatePopulationCapacity(stats: CountryStats): {
  capacity: number;
  current: number;
  isOvercrowded: boolean;
  percentUsed: number;
} {
  const infraLevel = stats.infrastructureLevel || 0;
  const capacity = BudgetCalculator.getPopulationCapacity(infraLevel);
  const current = stats.population;
  const isOvercrowded = current > capacity;
  const percentUsed = (current / capacity) * 100;
  
  return {
    capacity,
    current,
    isOvercrowded,
    percentUsed: Math.min(percentUsed, 100),
  };
}

/**
 * Calculate trade capacity (for display)
 */
export function calculateTradeCapacity(stats: CountryStats): {
  maxDeals: number;
  infraLevel: number;
} {
  const infraLevel = stats.infrastructureLevel || 0;
  const maxDeals = BudgetCalculator.calculateTradeCapacity(infraLevel);
  
  return {
    maxDeals,
    infraLevel,
  };
}

/**
 * Calculate military recruitment cost (for display)
 */
export function calculateMilitaryRecruitmentCost(
  amount: number,
  stats: CountryStats
): number {
  return MilitaryCalculator.calculateRecruitmentCost(amount, stats);
}

/**
 * Calculate effective military strength for display
 */
export function calculateEffectiveMilitaryStrengthForDisplay(stats: CountryStats): number {
  return MilitaryCalculator.calculateEffectiveMilitaryStrength(stats);
}

/**
 * Calculate population capacity for display
 */
export function calculatePopulationCapacityForDisplay(stats: CountryStats): number {
  const infraLevel = stats.infrastructureLevel || 0;
  return ECONOMIC_BALANCE.POPULATION.BASE_CAPACITY + (infraLevel * ECONOMIC_BALANCE.POPULATION.CAPACITY_PER_INFRASTRUCTURE);
}

/**
 * Calculate trade capacity for display
 */
export function calculateTradeCapacityForDisplay(stats: CountryStats): number {
  const infraLevel = stats.infrastructureLevel || 0;
  return ECONOMIC_BALANCE.INFRASTRUCTURE.BASE_TRADE_CAPACITY + (infraLevel * ECONOMIC_BALANCE.INFRASTRUCTURE.TRADE_CAPACITY_PER_LEVEL);
}

/**
 * Calculate research cost for display with all modifiers
 */
export function calculateResearchCostForDisplay(stats: CountryStats): { cost: number; reductionPercent: number } {
  const techLevel = Math.floor(Number(stats.technologyLevel));
  const profileTechCostMultiplier = getProfileTechCostModifier(stats.resourceProfile);
  const researchSpeedBonus = Math.min(techLevel * ECONOMIC_BALANCE.TECHNOLOGY.RESEARCH_SPEED_BONUS_PER_LEVEL, ECONOMIC_BALANCE.TECHNOLOGY.MAX_RESEARCH_SPEED_BONUS);
  const cost = Math.floor(ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, techLevel) * profileTechCostMultiplier * (1 - researchSpeedBonus));
  
  return { cost, reductionPercent: researchSpeedBonus * 100 };
}

/**
 * Calculate infrastructure cost for display with all modifiers
 */
export function calculateInfrastructureCostForDisplay(stats: CountryStats): number {
  const infraLevel = stats.infrastructureLevel || 0;
  const profileInfraCostMultiplier = getProfileInfraCostModifier(stats.resourceProfile);
  return Math.floor(ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER, infraLevel) * profileInfraCostMultiplier);
}

/**
 * Calculate military recruitment cost for display with all modifiers
 */
export function calculateMilitaryRecruitmentCostForDisplay(stats: CountryStats, amount: number = ECONOMIC_BALANCE.MILITARY.RECRUIT_AMOUNT_STANDARD): { cost: number; reductionPercent: number } {
  const techLevel = stats.technologyLevel || 0;
  const techCostReduction = Math.min(
    ECONOMIC_BALANCE.TECHNOLOGY.MAX_MILITARY_COST_REDUCTION,
    techLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_COST_REDUCTION_PER_LEVEL
  );
  
  const cost = MilitaryCalculator.calculateRecruitmentCost(amount, stats);
  
  return { cost, reductionPercent: techCostReduction * 100 };
}
