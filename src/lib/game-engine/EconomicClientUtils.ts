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
