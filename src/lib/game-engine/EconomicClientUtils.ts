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

export type PopulationGrowthBreakdownForDisplay = {
  population: number;
  capacity: number;
  isOvercrowded: boolean;
  baseRate: number;
  baseGrowth: number;
  overcrowdingGrowthMultiplier: number;
  baseGrowthAfterOvercrowding: number;
  foodCurrent: number;
  foodProduced: number;
  foodConsumed: number;
  foodAfterConsumption: number;
  foodBonusRate: number;
  foodBonus: number;
  starvationThreshold: number;
  foodRatio: number;
  starvationPenalty: number;
  totalGrowthBeforeCap: number;
  growthCap: number;
  growthAfterCap: number;
  growthRatePercent: number;
};

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
 * Calculate population growth rate + breakdown (client-side).
 * Mirrors `EconomicEngine.calculateConsumption` + `EconomicEngine.calculatePopulationChange`.
 *
 * Note: This is an estimate shown in tooltips; it assumes next turn production matches current production.
 */
export function calculatePopulationGrowthBreakdownForDisplay(
  country: Country,
  stats: CountryStats
): PopulationGrowthBreakdownForDisplay {
  const population = Number(stats.population || 0);
  const infraLevel = stats.infrastructureLevel || 0;
  const capacity =
    ECONOMIC_BALANCE.POPULATION.BASE_CAPACITY +
    infraLevel * ECONOMIC_BALANCE.POPULATION.CAPACITY_PER_INFRASTRUCTURE;
  const isOvercrowded = population > capacity;

  // Food production estimate (uses current production rules)
  const production = ResourceProduction.calculateProduction(country, stats);
  const foodProduced = Number(
    production.resources.find((r) => r.resourceId === "food")?.amount ?? 0
  );

  const foodCurrent = Number((stats.resources as any)?.food ?? 0);

  // Food consumption (mirrors EconomicEngine.calculateConsumption, INCLUDING overcrowding penalty)
  const populationUnits = population / 10000;
  const foodConsumptionBase =
    populationUnits * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
  const overcrowdingFoodMult = isOvercrowded
    ? ECONOMIC_BALANCE.POPULATION.OVERCROWDING_FOOD_PENALTY
    : 1.0;
  const foodConsumed = Math.ceil(foodConsumptionBase * overcrowdingFoodMult);

  const foodAfterProduction = foodCurrent + foodProduced;
  const foodAfterConsumption = Math.max(0, foodAfterProduction - foodConsumed);

  // Base growth (2%), with overcrowding growth penalty if over capacity
  const baseRate = ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE;
  const baseGrowth = population * baseRate;
  const overcrowdingGrowthMultiplier = isOvercrowded
    ? ECONOMIC_BALANCE.POPULATION.OVERCROWDING_GROWTH_PENALTY
    : 1.0;
  const baseGrowthAfterOvercrowding = baseGrowth * overcrowdingGrowthMultiplier;

  // Food surplus bonus (mirrors EconomicEngine: uses remaining food after consumption)
  const foodBonusRate =
    Math.floor(foodAfterConsumption / 100) *
    ECONOMIC_BALANCE.POPULATION.FOOD_SURPLUS_GROWTH_BONUS;
  const foodBonus = foodAfterConsumption > 0 ? foodBonusRate * population : 0;

  // Starvation penalty (mirrors EconomicEngine starvation check)
  const requiredFood =
    (population / 10000) * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
  const foodRatio = foodConsumed > 0 ? foodConsumed / requiredFood : 0;
  const starvationThreshold = ECONOMIC_BALANCE.POPULATION.STARVATION_THRESHOLD;
  const starvationPenalty =
    foodRatio < starvationThreshold ? Math.floor(population * 0.03) : 0;

  const totalGrowthBeforeCap =
    baseGrowthAfterOvercrowding + foodBonus - starvationPenalty;

  // Growth cap (150% of base growth)
  const growthCap =
    population *
    ECONOMIC_BALANCE.POPULATION.GROWTH_CAP_MULTIPLIER *
    ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE;
  const growthAfterCap = Math.min(totalGrowthBeforeCap, growthCap);

  const growthRatePercent =
    population > 0 ? (growthAfterCap / population) * 100 : 0;

  return {
    population,
    capacity,
    isOvercrowded,
    baseRate,
    baseGrowth,
    overcrowdingGrowthMultiplier,
    baseGrowthAfterOvercrowding,
    foodCurrent,
    foodProduced,
    foodConsumed,
    foodAfterConsumption,
    foodBonusRate,
    foodBonus,
    starvationThreshold,
    foodRatio,
    starvationPenalty,
    totalGrowthBeforeCap,
    growthCap,
    growthAfterCap,
    growthRatePercent,
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
 * Supports unlimited tech levels with adjusted cost scaling after level 5
 */
export function calculateResearchCostForDisplay(stats: CountryStats): { cost: number; reductionPercent: number } {
  const techLevel = Math.floor(Number(stats.technologyLevel));
  const profileTechCostMultiplier = getProfileTechCostModifier(stats.resourceProfile);
  const researchSpeedBonus = Math.min(techLevel * ECONOMIC_BALANCE.TECHNOLOGY.RESEARCH_SPEED_BONUS_PER_LEVEL, ECONOMIC_BALANCE.TECHNOLOGY.MAX_RESEARCH_SPEED_BONUS);
  
  // Cost scaling: levels 0-5 use exponential, levels 6+ use gentler scaling
  let baseCost: number;
  if (techLevel <= 5) {
    baseCost = ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, techLevel);
  } else {
    // After level 5: baseCost = 1097.5 × 1.20^(level - 5)
    // Level 5 cost: 500 × 1.30^5 = 1,857
    // Level 6: 1097.5 × 1.20^1 = 1,317
    // Level 7: 1097.5 × 1.20^2 = 1,580
    // Level 10: 1097.5 × 1.20^5 = 2,730
    // Level 20: 1097.5 × 1.20^15 = 26,000
    const level5Cost = ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, 5);
    baseCost = level5Cost * Math.pow(1.20, techLevel - 5);
  }
  
  const cost = Math.floor(baseCost * profileTechCostMultiplier * (1 - researchSpeedBonus));
  
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
