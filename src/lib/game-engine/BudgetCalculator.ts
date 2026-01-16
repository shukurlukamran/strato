/**
 * Budget Calculator
 * Handles all budget/treasury calculations including revenue and expenses.
 */

import type { Country, CountryStats } from '@/types/country';
import { ECONOMIC_BALANCE } from './EconomicBalance';

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
    const tradeRevenue = this.calculateTradeRevenue(activeDealsValue);
    const resourceRevenue = this.calculateResourceRevenue(stats);
    const totalRevenue = taxRevenue + tradeRevenue + resourceRevenue;
    
    // EXPENSES
    const maintenanceCost = this.calculateMaintenanceCost(stats);
    const militaryUpkeep = this.calculateMilitaryUpkeep(stats);
    const infraLevel = stats.infrastructureLevel || 0;
    const infrastructureCost = this.calculateInfrastructureCost(infraLevel);
    const totalExpenses = maintenanceCost + militaryUpkeep + infrastructureCost;
    
    return {
      taxRevenue,
      tradeRevenue,
      resourceRevenue,
      totalRevenue,
      maintenanceCost,
      militaryUpkeep,
      infrastructureCost,
      totalExpenses,
      netBudget: totalRevenue - totalExpenses
    };
  }
  
  /**
   * Tax revenue from population
   */
  private static calculateTaxRevenue(stats: CountryStats): number {
    const populationUnits = stats.population / 10000;
    const baseTax = populationUnits * ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN;
    
    // Technology bonus
    const techBonus = 1 + (stats.technologyLevel * ECONOMIC_BALANCE.BUDGET.TECHNOLOGY_TAX_MULTIPLIER);
    const techMultiplier = Math.min(techBonus, ECONOMIC_BALANCE.BUDGET.MAX_TAX_MULTIPLIER);
    
    // Infrastructure bonus
    const infraLevel = stats.infrastructureLevel || 0;
    const infraBonus = 1 + (infraLevel * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_BONUS);
    
    return Math.floor(baseTax * techMultiplier * infraBonus);
  }
  
  /**
   * Revenue from active trade deals
   */
  private static calculateTradeRevenue(activeDealsValue: number): number {
    return Math.floor(activeDealsValue * ECONOMIC_BALANCE.BUDGET.TRADE_INCOME_MULTIPLIER);
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
