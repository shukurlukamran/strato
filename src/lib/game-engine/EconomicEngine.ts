/**
 * Economic Engine Orchestrator
 * Main integration point for all economic calculations.
 * Processes resource production, budget generation, consumption, and population changes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Country, CountryStats } from '@/types/country';
import { ResourceProduction, ProductionOutput } from './ResourceProduction';
import { BudgetCalculator, BudgetBreakdown } from './BudgetCalculator';
import { ResourceRegistry, ResourceAmount } from './ResourceTypes';
import { ECONOMIC_BALANCE } from './EconomicBalance';

export interface EconomicUpdateResult {
  countryId: string;
  budgetChange: number;
  budgetBreakdown: BudgetBreakdown;
  resourcesProduced: ResourceAmount[];
  resourcesConsumed: ResourceAmount[];
  populationChange: number;
  eventMessages: string[];
}

export class EconomicEngine {
  /**
   * Process full economic turn for a country
   */
  static async processEconomicTurn(
    supabase: SupabaseClient<any>,
    country: Country,
    stats: CountryStats,
    activeDealsValue: number = 0
  ): Promise<EconomicUpdateResult> {
    const eventMessages: string[] = [];
    
    // 1. Calculate resource production
    const productionResult = ResourceProduction.calculateProduction(country, stats);
    
    // 2. Calculate budget
    const budgetBreakdown = BudgetCalculator.calculateBudget(
      country,
      stats,
      activeDealsValue
    );
    
    // 3. Calculate resource consumption
    const consumption = this.calculateConsumption(stats);
    
    // 4. Update resources (production - consumption - decay)
    const currentResources = this.parseResources(stats.resources);
    const updatedResources = this.updateResources(
      currentResources,
      productionResult.resources,
      consumption
    );
    
    // Apply decay
    const finalResources = ResourceProduction.applyDecay(updatedResources);
    
    // 5. Calculate population change
    const foodConsumed = consumption.find(r => r.resourceId === 'food')?.amount || 0;
    const foodProduced = productionResult.resources.find(r => r.resourceId === 'food')?.amount || 0;
    const currentFood = this.getResourceAmount(currentResources, 'food');
    const foodAfterProduction = currentFood + foodProduced;
    const foodAfterConsumption = Math.max(0, foodAfterProduction - foodConsumed);
    const foodBalance = foodAfterConsumption;
    
    const populationChange = this.calculatePopulationChange(stats, foodBalance, foodConsumed);
    
    // Add event messages
    if (populationChange > 0) {
      eventMessages.push(`Population grew by ${populationChange.toLocaleString()}`);
    } else if (populationChange < 0) {
      eventMessages.push(`Population declined by ${Math.abs(populationChange).toLocaleString()} due to food shortage`);
    }
    
    if (budgetBreakdown.netBudget > 0) {
      eventMessages.push(`Treasury increased by $${budgetBreakdown.netBudget.toLocaleString()}`);
    } else if (budgetBreakdown.netBudget < 0) {
      eventMessages.push(`Treasury decreased by $${Math.abs(budgetBreakdown.netBudget).toLocaleString()}`);
    }
    
    // 6. Save to database
    await this.saveEconomicUpdates(supabase, country.id, country.name, stats.turn, {
      budgetChange: budgetBreakdown.netBudget,
      resources: finalResources,
      populationChange,
      stats
    });
    
    return {
      countryId: country.id,
      budgetChange: budgetBreakdown.netBudget,
      budgetBreakdown,
      resourcesProduced: productionResult.resources,
      resourcesConsumed: consumption,
      populationChange,
      eventMessages
    };
  }
  
  /**
   * Calculate resource consumption
   * NEW: Overcrowding increases food consumption
   */
  private static calculateConsumption(stats: CountryStats): ResourceAmount[] {
    const populationUnits = stats.population / 10000;
    let foodConsumption = populationUnits * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
    
    // NEW: Overcrowding increases food consumption
    const infraLevel = stats.infrastructureLevel || 0;
    const capacity = ECONOMIC_BALANCE.POPULATION.BASE_CAPACITY + 
                    (infraLevel * ECONOMIC_BALANCE.POPULATION.CAPACITY_PER_INFRASTRUCTURE);
    const isOvercrowded = stats.population > capacity;
    
    if (isOvercrowded) {
      foodConsumption = foodConsumption * ECONOMIC_BALANCE.POPULATION.OVERCROWDING_FOOD_PENALTY;
    }
    
    return [
      {
        resourceId: 'food',
        amount: Math.ceil(foodConsumption)
      },
      // Add other consumptions as needed
    ];
  }
  
  /**
   * Update resource stockpiles
   */
  private static updateResources(
    current: ResourceAmount[],
    produced: ResourceAmount[],
    consumed: ResourceAmount[]
  ): ResourceAmount[] {
    const resourceMap = new Map<string, number>();
    
    // Start with current
    current.forEach(r => resourceMap.set(r.resourceId, r.amount));
    
    // Add production
    produced.forEach(r => {
      const existing = resourceMap.get(r.resourceId) || 0;
      resourceMap.set(r.resourceId, existing + r.amount);
    });
    
    // Subtract consumption
    consumed.forEach(r => {
      const existing = resourceMap.get(r.resourceId) || 0;
      resourceMap.set(r.resourceId, Math.max(0, existing - r.amount));
    });
    
    return Array.from(resourceMap.entries()).map(([resourceId, amount]) => ({
      resourceId,
      amount
    }));
  }
  
  /**
   * Calculate population growth/decline
   * NEW: Includes overcrowding penalty when population exceeds capacity
   */
  private static calculatePopulationChange(
    stats: CountryStats,
    foodBalance: number,
    foodConsumed: number
  ): number {
    let baseGrowth = stats.population * ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE;
    
    // NEW: Overcrowding penalty (reduces growth when over capacity)
    const infraLevel = stats.infrastructureLevel || 0;
    const capacity = ECONOMIC_BALANCE.POPULATION.BASE_CAPACITY + 
                    (infraLevel * ECONOMIC_BALANCE.POPULATION.CAPACITY_PER_INFRASTRUCTURE);
    const isOvercrowded = stats.population > capacity;
    
    if (isOvercrowded) {
      baseGrowth = baseGrowth * ECONOMIC_BALANCE.POPULATION.OVERCROWDING_GROWTH_PENALTY;
    }
    
    // Food surplus bonus
    const foodBonus = foodBalance > 0 
      ? Math.floor(foodBalance / 100) * ECONOMIC_BALANCE.POPULATION.FOOD_SURPLUS_GROWTH_BONUS * stats.population
      : 0;
    
    // Starvation penalty
    const requiredFood = stats.population / 10000 * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
    const foodRatio = foodConsumed > 0 ? foodConsumed / requiredFood : 0;
    const starvationPenalty = foodRatio < ECONOMIC_BALANCE.POPULATION.STARVATION_THRESHOLD
      ? Math.floor(stats.population * 0.03) // 3% decline
      : 0;
    
    const totalGrowth = baseGrowth + foodBonus - starvationPenalty;
    const cappedGrowth = Math.min(
      totalGrowth,
      stats.population * ECONOMIC_BALANCE.POPULATION.GROWTH_CAP_MULTIPLIER * ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE
    );
    
    return Math.floor(cappedGrowth);
  }
  
  /**
   * Save economic updates to database
   */
  private static async saveEconomicUpdates(
    supabase: SupabaseClient<any>,
    countryId: string,
    countryName: string,
    turn: number,
    updates: {
      budgetChange: number;
      resources: ResourceAmount[];
      populationChange: number;
      stats: CountryStats;
    }
  ): Promise<void> {
    const newBudget = (updates.stats.budget || 0) + updates.budgetChange;
    const newPopulation = updates.stats.population + updates.populationChange;
    
    // Convert ResourceAmount[] to Record<string, number>
    const resourcesRecord: Record<string, number> = {};
    updates.resources.forEach(r => {
      resourcesRecord[r.resourceId] = r.amount;
    });
    
    // Update the stats for the current turn
    // Preserve infrastructure_level if it exists
    const infraLevel = updates.stats.infrastructureLevel ?? 0;
    
    console.log(`[EconomicEngine] Updating stats for ${countryName} (${countryId}), turn ${turn}:`, {
      oldBudget: updates.stats.budget,
      newBudget,
      budgetChange: updates.budgetChange,
      oldPopulation: updates.stats.population,
      newPopulation,
      populationChange: updates.populationChange,
      oldResources: updates.stats.resources,
      newResources: resourcesRecord
    });
    
    const { error } = await supabase
      .from('country_stats')
      .update({
        budget: newBudget,
        population: newPopulation,
        infrastructure_level: infraLevel,
        resources: resourcesRecord
      })
      .eq('country_id', countryId)
      .eq('turn', turn);
    
    if (error) {
      console.error('[EconomicEngine] Failed to save economic updates:', error);
      throw error;
    }
    
    console.log(`[EconomicEngine] ✓ Stats updated successfully for ${countryName} (${countryId}), turn ${turn}`);
  }
  
  private static parseResources(resources: Record<string, number>): ResourceAmount[] {
    if (!resources) return [];
    return Object.entries(resources).map(([resourceId, amount]) => ({
      resourceId,
      amount: Number(amount) || 0
    }));
  }
  
  private static getResourceAmount(resources: ResourceAmount[], resourceId: string): number {
    return resources.find(r => r.resourceId === resourceId)?.amount || 0;
  }
}
