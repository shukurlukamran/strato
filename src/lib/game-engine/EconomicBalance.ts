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
    BASE_TAX_PER_CITIZEN: 22,          // Base tax income per population unit (10k pop) - INCREASED +22% for faster economy
    INFRASTRUCTURE_TAX_EFFICIENCY: 0.15, // +15% tax collection per infrastructure level
    TRADE_INCOME_MULTIPLIER: 0.20,     // 20% of total trade value per turn - INCREASED +33% for faster economy
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
    MAINTENANCE_COST_MULTIPLIER: 0.005, // 0.5% of budget for maintenance - REDUCED from 1%
    MILITARY_UPKEEP_PER_STRENGTH: 0.5, // Budget cost per military strength point - REDUCED from 0.8
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
    BUILD_COST_BASE: 600,              // Base cost - REDUCED for easier early game
    BUILD_COST_MULTIPLIER: 1.25,       // Cost multiplier - REDUCED from 1.30 for smoother scaling
    MAINTENANCE_COST_PER_LEVEL: 25,    // Budget cost per infrastructure level - REDUCED from 35
    
    // NEW: Trade capacity
    BASE_TRADE_CAPACITY: 2,            // Base number of deals per turn
    TRADE_CAPACITY_PER_LEVEL: 1,       // +1 deal per infrastructure level
    TRADE_EFFICIENCY_PER_LEVEL: 0.10,  // +10% trade value per infrastructure level
  },
  
  // Military
  MILITARY: {
    COST_PER_STRENGTH_POINT: 30,       // Standard cost per military strength point - REDUCED -25% for faster economy
    RECRUIT_AMOUNT_STANDARD: 15,       // Standard recruitment amount per action - INCREASED +50% for faster armies
    RECRUIT_COST_STANDARD: 450,        // Standard cost (30 * 15 = 450)
  },
  
  // Upgrade Costs (Accelerated for faster gameplay)
  UPGRADES: {
    TECH_BASE_COST: 500,               // Base cost for technology upgrade - REDUCED -29% for faster economy
    TECH_COST_MULTIPLIER: 1.30,        // Cost increases per level
    
    INFRA_BASE_COST: 450,              // Base cost for infrastructure upgrade - REDUCED -25% for faster economy
    INFRA_COST_MULTIPLIER: 1.25,       // Cost increases per level
  },
  
  // Resource Costs (8-resource system)
  RESOURCE_COSTS: {
    // Resource shortage penalty
    SHORTAGE_COST_PENALTY_PER_RESOURCE: 0.4, // +40% budget cost per missing resource type - REDUCED -20%
    MAX_SHORTAGE_PENALTY: 2.5,                // Maximum 2.5x cost when missing resources - REDUCED from 3.0
    
    // Note: Actual resource requirements are calculated in ResourceCost.ts
    // These constants are kept for reference but not actively used
  }
} as const;
