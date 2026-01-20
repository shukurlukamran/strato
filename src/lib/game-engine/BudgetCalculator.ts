/**
 * Budget Calculator
 * Handles all budget/treasury calculations including revenue and expenses.
 * 
 * REDESIGN: Technology no longer affects tax revenue.
 * Infrastructure provides tax collection efficiency bonus.
 */

import type { Country, CountryStats } from '@/types/country';
import { ECONOMIC_BALANCE } from './EconomicBalance';
import { 
  getProfileTaxModifier, 
  getProfileTradeModifier 
} from './ProfileModifiers';
import { ResourceProduction } from './ResourceProduction';

export interface BudgetBreakdown {
  taxRevenue: number;
  tradeRevenue: number;
  resourceRevenue: number;
  totalRevenue: number;
  
  maintenanceCost: number;
  militaryUpkeep: number;
  infrastructureCost: number;
  totalExpenses: number;
  
  netBudget: number;
  
  // NEW: Additional info for display
  isOvercrowded?: boolean;
  populationCapacity?: number;
}

export class BudgetCalculator {
  /**
   * Calculate total budget generation for the turn
   */
  static calculateBudget(
    country: Country,
    stats: CountryStats,
    activeDealsValue: number = 0
  ): BudgetBreakdown {
    // REVENUE
    const taxRevenue = this.calculateTaxRevenue(stats);
    const tradeRevenue = this.calculateTradeRevenue(activeDealsValue, stats);
    const resourceRevenue = this.calculateResourceRevenue(stats);
    const totalRevenue = taxRevenue + tradeRevenue + resourceRevenue;
    
    // EXPENSES
    const maintenanceCost = this.calculateMaintenanceCost(stats);
    const militaryUpkeep = this.calculateMilitaryUpkeep(stats);
    const infraLevel = stats.infrastructureLevel || 0;
    const infrastructureCost = this.calculateInfrastructureCost(infraLevel);
    const totalExpenses = maintenanceCost + militaryUpkeep + infrastructureCost;
    
    // NEW: Population capacity info
    const populationCapacity = this.calculatePopulationCapacity(infraLevel);
    const isOvercrowded = stats.population > populationCapacity;
    
    return {
      taxRevenue,
      tradeRevenue,
      resourceRevenue,
      totalRevenue,
      maintenanceCost,
      militaryUpkeep,
      infrastructureCost,
      totalExpenses,
      netBudget: totalRevenue - totalExpenses,
      isOvercrowded,
      populationCapacity,
    };
  }
  
  /**
   * Calculate trade capacity (max deals per turn) based on infrastructure
   */
  static calculateTradeCapacity(infraLevel: number): number {
    return ECONOMIC_BALANCE.INFRASTRUCTURE.BASE_TRADE_CAPACITY + 
           (infraLevel * ECONOMIC_BALANCE.INFRASTRUCTURE.TRADE_CAPACITY_PER_LEVEL);
  }
  
  /**
   * Get population capacity (public method for use elsewhere)
   */
  static getPopulationCapacity(infraLevel: number): number {
    return this.calculatePopulationCapacity(infraLevel);
  }
  
  /**
   * Tax revenue from population
   * REDESIGN: Tech no longer affects tax. Only infrastructure and profile matter.
   */
  private static calculateTaxRevenue(stats: CountryStats): number {
    const populationUnits = stats.population / 10000;
    const baseTax = populationUnits * ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN;
    
    // Infrastructure efficiency (tax collection)
    const infraLevel = stats.infrastructureLevel || 0;
    const infraEfficiency = 1 + (infraLevel * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_TAX_EFFICIENCY);
    
    // Population capacity penalty (overcrowding reduces tax efficiency)
    const capacity = this.calculatePopulationCapacity(infraLevel);
    const isOvercrowded = stats.population > capacity;
    const capacityPenalty = isOvercrowded ? ECONOMIC_BALANCE.POPULATION.OVERCROWDING_TAX_PENALTY : 1.0;
    
    // Profile tax modifier
    const profileModifier = getProfileTaxModifier(stats.resourceProfile);
    
    return Math.floor(baseTax * infraEfficiency * capacityPenalty * profileModifier);
  }
  
  /**
   * Calculate population capacity based on infrastructure
   */
  private static calculatePopulationCapacity(infraLevel: number): number {
    return ECONOMIC_BALANCE.POPULATION.BASE_CAPACITY + 
           (infraLevel * ECONOMIC_BALANCE.POPULATION.CAPACITY_PER_INFRASTRUCTURE);
  }
  
  /**
   * Revenue from active trade deals
   * NEW: Infrastructure and profile provide trade efficiency bonuses
   */
  private static calculateTradeRevenue(
    activeDealsValue: number,
    stats?: CountryStats
  ): number {
    if (!activeDealsValue) return 0;
    
    let efficiency = 1.0;
    let profileBonus = 1.0;
    
    if (stats) {
      // Infrastructure provides trade efficiency
      const infraLevel = stats.infrastructureLevel || 0;
      efficiency = 1 + (infraLevel * ECONOMIC_BALANCE.INFRASTRUCTURE.TRADE_EFFICIENCY_PER_LEVEL);
      
      // Profile trade bonus
      profileBonus = getProfileTradeModifier(stats.resourceProfile);
    }
    
    const tradeValue = activeDealsValue * efficiency * profileBonus;
    return Math.floor(tradeValue * ECONOMIC_BALANCE.BUDGET.TRADE_INCOME_MULTIPLIER);
  }
  
  /**
   * Revenue from selling excess resources (future implementation)
   */
  private static calculateResourceRevenue(stats: CountryStats): number {
    // Placeholder: implement when resource market exists
    return 0;
  }
  
  /**
   * General maintenance costs
   */
  private static calculateMaintenanceCost(stats: CountryStats): number {
    const totalBudget = stats.budget || 0;
    return Math.floor(totalBudget * ECONOMIC_BALANCE.CONSUMPTION.MAINTENANCE_COST_MULTIPLIER);
  }
  
  /**
   * Military upkeep costs
   */
  private static calculateMilitaryUpkeep(stats: CountryStats): number {
    const militaryStrength = stats.militaryStrength || 0;
    return militaryStrength * ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH;
  }
  
  /**
   * Infrastructure maintenance
   */
  private static calculateInfrastructureCost(infraLevel: number): number {
    return infraLevel * ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL;
  }
}
