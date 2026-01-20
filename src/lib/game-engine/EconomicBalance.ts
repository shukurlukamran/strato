/**
 * Economic Balance Configuration
 * Centralized constants for all economic calculations.
 * Adjust these values to tune game balance without changing core logic.
 * 
 * REDESIGN NOTES:
 * - Technology now focuses on production efficiency and military power
 * - Infrastructure now focuses on capacity and administration
 * - Both are distinct and complementary
 */

export const ECONOMIC_BALANCE = {
  // Budget Generation
  BUDGET: {
    BASE_TAX_PER_CITIZEN: 12,          // Base tax income per population unit (10k pop) - REDUCED from 15
    INFRASTRUCTURE_TAX_EFFICIENCY: 0.12, // +12% tax collection per infrastructure level - CHANGED from 0.15
    TRADE_INCOME_MULTIPLIER: 0.10,     // 10% of total trade value per turn
  },
  
  // Resource Production
  PRODUCTION: {
    BASE_FOOD_PER_POP: 6.5,            // Each 10k pop produces 65 food
    BASE_INDUSTRIAL_OUTPUT: 5,          // Base industrial production
    POPULATION_EFFICIENCY: 1.0,        // Population work efficiency (0-1)
    RESOURCE_EXTRACTION_RATE: 10,      // Base extraction per turn
  },
  
  // Resource Consumption
  CONSUMPTION: {
    FOOD_PER_10K_POPULATION: 5,        // Food consumed per 10k pop
    MAINTENANCE_COST_MULTIPLIER: 0.01, // 1% of budget for maintenance
    MILITARY_UPKEEP_PER_STRENGTH: 0.8, // Budget cost per military strength point
  },
  
  // Technology Effects (Discrete multipliers for resource production)
  TECHNOLOGY: {
    LEVEL_0_MULTIPLIER: 1.0,
    LEVEL_1_MULTIPLIER: 1.25,          // CHANGED from 1.3 to 1.25
    LEVEL_2_MULTIPLIER: 1.6,           // CHANGED from 1.7 to 1.6
    LEVEL_3_MULTIPLIER: 2.0,           // CHANGED from 2.2 to 2.0
    LEVEL_4_MULTIPLIER: 2.5,           // CHANGED from 3.0 to 2.5
    LEVEL_5_MULTIPLIER: 3.0,           // CHANGED from 4.0 to 3.0
    
    // NEW: Military effectiveness bonus
    MILITARY_EFFECTIVENESS_PER_LEVEL: 0.20,  // +20% military power per tech level
    
    // NEW: Military recruitment cost reduction
    MILITARY_COST_REDUCTION_PER_LEVEL: 0.05, // -5% cost per level
    MAX_MILITARY_COST_REDUCTION: 0.25,        // Max -25% cost reduction
    
    // NEW: Research speed bonus (makes further research cheaper)
    RESEARCH_SPEED_BONUS_PER_LEVEL: 0.03,    // -3% cost per current level
    MAX_RESEARCH_SPEED_BONUS: 0.15,           // Max -15% research cost
  },
  
  // Population Growth & Capacity
  POPULATION: {
    GROWTH_RATE_BASE: 0.02,            // 2% base growth per turn
    FOOD_SURPLUS_GROWTH_BONUS: 0.01,   // +1% per 100 surplus food
    GROWTH_CAP_MULTIPLIER: 1.5,        // Max 150% of base growth
    STARVATION_THRESHOLD: 0.8,         // Below 80% food = population decline
    
    // NEW: Population capacity system
    BASE_CAPACITY: 200000,             // Starting population capacity
    CAPACITY_PER_INFRASTRUCTURE: 50000, // +50k capacity per infrastructure level
    OVERCROWDING_GROWTH_PENALTY: 0.50,  // Half growth when over capacity
    OVERCROWDING_TAX_PENALTY: 0.80,     // 20% tax penalty when overcrowded
    OVERCROWDING_FOOD_PENALTY: 1.10,    // 10% more food consumption when overcrowded
  },
  
  // Infrastructure
  INFRASTRUCTURE: {
    BUILD_COST_BASE: 700,              // Base cost - CHANGED from 1000
    BUILD_COST_MULTIPLIER: 1.30,       // Cost multiplier - CHANGED from 1.5
    MAINTENANCE_COST_PER_LEVEL: 35,    // Budget cost per infrastructure level - CHANGED from 20
    
    // NEW: Trade capacity
    BASE_TRADE_CAPACITY: 2,            // Base number of deals per turn
    TRADE_CAPACITY_PER_LEVEL: 1,       // +1 deal per infrastructure level
    TRADE_EFFICIENCY_PER_LEVEL: 0.10,  // +10% trade value per infrastructure level
  },
  
  // Military
  MILITARY: {
    COST_PER_STRENGTH_POINT: 50,       // Standard cost per military strength point
    RECRUIT_AMOUNT_STANDARD: 10,       // Standard recruitment amount per action
    RECRUIT_COST_STANDARD: 500,        // Standard cost (50 * 10 = 500)

    // Combat System
    ATTACK_BASE_COST: 100,             // Base economic cost for launching an attack
    ATTACK_COST_PER_STRENGTH: 2,       // Additional cost per military strength allocated
    COMBAT_CASUALTY_RATE: 0.15,        // Base casualty rate (15% of engaged forces)
    MAX_ATTACK_DISTANCE: 5,             // Maximum distance for city attacks
  },
  
  // Upgrade Costs
  UPGRADES: {
    TECH_BASE_COST: 800,               // Base cost for technology upgrade
    TECH_COST_MULTIPLIER: 1.35,        // Cost increases per level
    
    INFRA_BASE_COST: 700,              // Base cost for infrastructure upgrade  
    INFRA_COST_MULTIPLIER: 1.30,       // Cost increases per level
  }
} as const;
