/**
 * Economic Balance Configuration
 * Centralized constants for all economic calculations.
 * Adjust these values to tune game balance without changing core logic.
 */

export const ECONOMIC_BALANCE = {
  // Budget Generation
  BUDGET: {
    BASE_TAX_PER_CITIZEN: 5,           // Base tax income per population unit (10k pop)
    TECHNOLOGY_TAX_MULTIPLIER: 0.15,    // +15% per tech level
    MAX_TAX_MULTIPLIER: 3.0,           // Cap at 300% of base
    INFRASTRUCTURE_BONUS: 0.1,         // +10% per infrastructure level
    TRADE_INCOME_MULTIPLIER: 0.05,     // 5% of total trade value
  },
  
  // Resource Production
  PRODUCTION: {
    BASE_FOOD_PER_POP: 0.8,            // Each 10k pop produces 8 food
    BASE_INDUSTRIAL_OUTPUT: 5,          // Base industrial production
    TECH_PRODUCTION_MULTIPLIER: 0.2,   // +20% per tech level
    INFRASTRUCTURE_MULTIPLIER: 0.15,   // +15% per infrastructure level
    POPULATION_EFFICIENCY: 0.7,        // Population work efficiency (0-1)
    RESOURCE_EXTRACTION_RATE: 10,      // Base extraction per turn
  },
  
  // Resource Consumption
  CONSUMPTION: {
    FOOD_PER_10K_POPULATION: 5,        // Food consumed per 10k pop
    MAINTENANCE_COST_MULTIPLIER: 0.05, // 5% of budget for maintenance
    MILITARY_UPKEEP_PER_STRENGTH: 2,   // Budget cost per military strength point
  },
  
  // Technology Effects
  TECHNOLOGY: {
    LEVEL_0_MULTIPLIER: 1.0,
    LEVEL_1_MULTIPLIER: 1.3,
    LEVEL_2_MULTIPLIER: 1.7,
    LEVEL_3_MULTIPLIER: 2.2,
    LEVEL_4_MULTIPLIER: 3.0,
    LEVEL_5_MULTIPLIER: 4.0,
  },
  
  // Population Growth
  POPULATION: {
    GROWTH_RATE_BASE: 0.02,            // 2% base growth per turn
    FOOD_SURPLUS_GROWTH_BONUS: 0.01,   // +1% per 100 surplus food
    GROWTH_CAP_MULTIPLIER: 1.5,        // Max 150% of base growth
    STARVATION_THRESHOLD: 0.8,         // Below 80% food = population decline
  },
  
  // Infrastructure
  INFRASTRUCTURE: {
    BUILD_COST_BASE: 1000,             // Base cost to increase infrastructure
    BUILD_COST_MULTIPLIER: 1.5,        // Cost increases 1.5x per level
    MAINTENANCE_COST_PER_LEVEL: 50,    // Budget cost per infrastructure level
  }
} as const;
