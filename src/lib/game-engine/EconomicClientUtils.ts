/**
 * Client-side Economic Utilities
 * Provides economic calculations for UI display without requiring database access.
 */

import type { Country, CountryStats } from '@/types/country';
import { ResourceProduction, ProductionOutput } from './ResourceProduction';
import { BudgetCalculator, BudgetBreakdown } from './BudgetCalculator';
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
