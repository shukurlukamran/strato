/**
 * Rule-Based AI Decision Engine
 * Makes deterministic decisions based on economic analysis, resource profiles, and game state
 * Designed to be cost-free (no LLM calls) while making intelligent decisions
 */

import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import type { CountryStats } from "@/types/country";
import type { AIPersonality } from "./Personality";
import { ActionResolver } from "@/lib/game-engine/ActionResolver";
import { BudgetCalculator } from "@/lib/game-engine/BudgetCalculator";
import { ResourceProduction } from "@/lib/game-engine/ResourceProduction";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import type { ResourceProfile } from "@/lib/game-engine/ResourceProfile";
import { MilitaryCalculator } from "@/lib/game-engine/MilitaryCalculator";

export interface EconomicAnalysis {
  // Budget health
  currentBudget: number;
  netIncome: number;
  turnsUntilBankrupt: number | null;
  canAffordInfrastructure: boolean;
  canAffordResearch: boolean;
  canAffordMilitary: boolean;

  // Investment ROI
  infrastructureROI: number; // Turns to break even
  researchROI: number;

  // Resource health
  foodBalance: number; // Production - consumption
  foodTurnsRemaining: number | null; // Turns until starvation
  hasResourceSurplus: boolean;

  // Strategic situation
  militaryStrength: number; // Raw military strength
  effectiveMilitaryStrength: number; // Combat-effective strength (with tech bonuses)
  militaryDeficit: number; // Difference from recommended strength
  isUnderDefended: boolean;
  averageNeighborEffectiveStrength: number;
}

export interface DecisionWeights {
  researchPriority: number;      // 0-1 (1 = highest priority)
  infrastructurePriority: number;
  militaryPriority: number;
  economicSafetyBuffer: number;  // Minimum budget to maintain
}

export class RuleBasedAI {
  /**
   * Analyze country's economic situation and capabilities
   */
  static analyzeEconomicSituation(
    state: GameStateSnapshot,
    countryId: string,
    stats: CountryStats
  ): EconomicAnalysis {
    const country = state.countries.find(c => c.id === countryId);
    if (!country) {
      throw new Error(`Country ${countryId} not found`);
    }

    // Calculate budget breakdown
    const budgetBreakdown = BudgetCalculator.calculateBudget(country, stats, 0);
    
    // Calculate resource production
    const production = ResourceProduction.calculateProduction(country, stats);
    const foodProduced = production.resources.find(r => r.resourceId === 'food')?.amount || 0;
    const foodConsumed = (stats.population / 10000) * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
    const foodBalance = foodProduced - foodConsumed;
    const currentFood = stats.resources.food || 0;
    
    // Calculate investment costs
    const researchCost = ActionResolver.calculateResearchCost(stats.technologyLevel);
    const infraCost = ActionResolver.calculateInfrastructureCost(stats.infrastructureLevel || 0);
    const militaryRecruitCost = ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT; // 50 per strength point (standardized)
    
    // Calculate affordability (with safety buffer)
    const safetyBuffer = Math.max(500, budgetBreakdown.totalExpenses * 2);
    const availableBudget = stats.budget - safetyBuffer;
    
    // Calculate ROI for investments
    const infrastructureROI = this.calculateInfrastructureROI(stats, infraCost);
    const researchROI = this.calculateResearchROI(stats, researchCost);
    
    // Calculate military situation (use effective strength for accurate threat assessment)
    const neighbors = this.getNeighbors(state, countryId);
    const ourEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(stats);
    const avgNeighborEffectiveStrength = neighbors.length > 0
      ? neighbors.reduce((sum, n) => sum + MilitaryCalculator.calculateEffectiveMilitaryStrength(n), 0) / neighbors.length
      : ourEffectiveStrength;

    const recommendedMilitaryStrength = Math.max(
      50, // Minimum defense
      avgNeighborEffectiveStrength * 0.7, // 70% of neighbor effective average
      stats.population / 2000 // Scale with population
    );

    const militaryDeficit = recommendedMilitaryStrength - ourEffectiveStrength;
    
    // Calculate turns until bankruptcy (if negative income)
    const turnsUntilBankrupt = budgetBreakdown.netBudget < 0
      ? Math.floor(stats.budget / Math.abs(budgetBreakdown.netBudget))
      : null;
    
    // Calculate turns until starvation
    const foodTurnsRemaining = foodBalance < 0
      ? Math.floor(currentFood / Math.abs(foodBalance))
      : null;
    
    return {
      currentBudget: stats.budget,
      netIncome: budgetBreakdown.netBudget,
      turnsUntilBankrupt,
      canAffordInfrastructure: availableBudget >= infraCost,
      canAffordResearch: availableBudget >= researchCost,
      canAffordMilitary: availableBudget >= militaryRecruitCost,
      infrastructureROI,
      researchROI,
      foodBalance,
      foodTurnsRemaining,
      hasResourceSurplus: this.hasResourceSurplus(stats),
      militaryStrength: stats.militaryStrength,
      effectiveMilitaryStrength: ourEffectiveStrength,
      militaryDeficit,
      isUnderDefended: militaryDeficit > 20,
      averageNeighborEffectiveStrength: avgNeighborEffectiveStrength,
    };
  }

  /**
   * Calculate decision weights based on personality and situation
   */
  static calculateDecisionWeights(
    analysis: EconomicAnalysis,
    personality: AIPersonality,
    resourceProfile?: ResourceProfile
  ): DecisionWeights {
    let researchPriority = 0.3;
    let infrastructurePriority = 0.3;
    let militaryPriority = 0.2;
    
    // CRISIS RESPONSE (override normal priorities)
    
    // Food crisis - highest priority
    if (analysis.foodTurnsRemaining !== null && analysis.foodTurnsRemaining < 5) {
      // Emergency: focus on infrastructure/research to boost food production
      infrastructurePriority = 0.7;
      researchPriority = 0.2;
      militaryPriority = 0.1;
    }
    
    // Bankruptcy crisis
    if (analysis.turnsUntilBankrupt !== null && analysis.turnsUntilBankrupt < 3) {
      // Emergency: minimize spending, focus on economy
      infrastructurePriority = 0.2;
      researchPriority = 0.1;
      militaryPriority = 0.05;
    }
    
    // Military crisis
    if (analysis.isUnderDefended && analysis.militaryDeficit > 30) {
      militaryPriority = 0.6;
      infrastructurePriority = 0.2;
      researchPriority = 0.2;
    }
    
    // NORMAL PRIORITIES (adjust based on situation)
    
    // Technology advantage assessment
    if (analysis.researchROI < 40 && analysis.canAffordResearch) {
      researchPriority += 0.2; // Good ROI, prioritize tech
    }
    
    // Infrastructure advantage assessment
    if (analysis.infrastructureROI < 30 && analysis.canAffordInfrastructure) {
      infrastructurePriority += 0.2; // Excellent ROI, prioritize infra
    }
    
    // Long-term investment focus (if wealthy)
    if (analysis.currentBudget > 10000 && analysis.netIncome > 500) {
      researchPriority += 0.15; // Rich countries invest in tech
      infrastructurePriority += 0.15;
    }
    
    // Resource profile influence
    if (resourceProfile) {
      if (resourceProfile.name === "Agricultural Hub" || resourceProfile.name === "Trade Hub") {
        // Food-rich nations can afford more military/tech
        militaryPriority += 0.1;
        researchPriority += 0.1;
        infrastructurePriority -= 0.05;
      } else if (resourceProfile.name === "Mining Empire" || resourceProfile.name === "Industrial Powerhouse") {
        // Industrial nations need food security infrastructure
        infrastructurePriority += 0.15;
      } else if (resourceProfile.name === "Tech Innovator") {
        // Tech-focused nations double down on research
        researchPriority += 0.2;
      }
    }
    
    // PERSONALITY INFLUENCE (subtle adjustments)
    
    // Aggressive personality -> more military
    militaryPriority += personality.aggression * 0.15;
    
    // Risk-tolerant -> more research (long-term)
    researchPriority += personality.riskTolerance * 0.1;
    
    // Normalize weights to 0-1 range
    researchPriority = Math.max(0, Math.min(1, researchPriority));
    infrastructurePriority = Math.max(0, Math.min(1, infrastructurePriority));
    militaryPriority = Math.max(0, Math.min(1, militaryPriority));
    
    // Calculate economic safety buffer (higher when in danger)
    let economicSafetyBuffer = 1000;
    if (analysis.turnsUntilBankrupt !== null) {
      economicSafetyBuffer = Math.max(2000, analysis.currentBudget * 0.3);
    }
    if (analysis.netIncome > 0) {
      economicSafetyBuffer = Math.max(500, analysis.netIncome * 3);
    }
    
    return {
      researchPriority,
      infrastructurePriority,
      militaryPriority,
      economicSafetyBuffer,
    };
  }

  /**
   * Decide if should invest in research this turn
   */
  static shouldInvestInResearch(
    stats: CountryStats,
    analysis: EconomicAnalysis,
    weights: DecisionWeights
  ): boolean {
    // Never research if can't afford or in crisis
    if (!analysis.canAffordResearch) return false;
    if (analysis.turnsUntilBankrupt !== null && analysis.turnsUntilBankrupt < 5) return false;
    if (analysis.foodTurnsRemaining !== null && analysis.foodTurnsRemaining < 3) return false;
    
    // No cap on tech level - unlimited upgrades supported
    
    // Research if high priority and good ROI
    if (weights.researchPriority > 0.5 && analysis.researchROI < 50) {
      return true;
    }
    
    // Research if very good ROI and affordable
    if (analysis.researchROI < 30 && analysis.currentBudget > weights.economicSafetyBuffer * 2) {
      return true;
    }
    
    // Research if wealthy and tech is low
    if (stats.technologyLevel < 3 && analysis.currentBudget > 5000) {
      return true;
    }
    
    return false;
  }

  /**
   * Decide if should invest in infrastructure this turn
   */
  static shouldInvestInInfrastructure(
    stats: CountryStats,
    analysis: EconomicAnalysis,
    weights: DecisionWeights
  ): boolean {
    // Never build if can't afford or in bankruptcy crisis
    if (!analysis.canAffordInfrastructure) return false;
    if (analysis.turnsUntilBankrupt !== null && analysis.turnsUntilBankrupt < 5) return false;
    
    const infraLevel = stats.infrastructureLevel || 0;
    
    // Don't build if infrastructure is already very high
    if (infraLevel >= 10) return false;
    
    // HIGH PRIORITY: Food crisis (infrastructure boosts production)
    if (analysis.foodTurnsRemaining !== null && analysis.foodTurnsRemaining < 10) {
      return true;
    }
    
    // Build if high priority and good ROI
    if (weights.infrastructurePriority > 0.5 && analysis.infrastructureROI < 40) {
      return true;
    }
    
    // Build if excellent ROI
    if (analysis.infrastructureROI < 25 && analysis.currentBudget > weights.economicSafetyBuffer * 1.5) {
      return true;
    }
    
    // Build if infrastructure is low compared to tech
    if (infraLevel < stats.technologyLevel && analysis.currentBudget > 3000) {
      return true;
    }
    
    return false;
  }

  /**
   * Decide how much military to recruit this turn
   * Uses standardized cost: 50 budget per strength point (same as player)
   */
  static decideMilitaryRecruitment(
    stats: CountryStats,
    analysis: EconomicAnalysis,
    weights: DecisionWeights
  ): number {
    // Never recruit if can't afford or in crisis
    if (!analysis.canAffordMilitary) return 0;
    if (analysis.turnsUntilBankrupt !== null && analysis.turnsUntilBankrupt < 5) return 0;
    if (analysis.foodTurnsRemaining !== null && analysis.foodTurnsRemaining < 5) return 0;
    
    // Calculate affordable recruitment using STANDARDIZED cost
    const costPerStrength = ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT; // 50
    const availableBudget = analysis.currentBudget - weights.economicSafetyBuffer;
    const maxAffordable = Math.floor(availableBudget / costPerStrength);
    
    // Calculate desired recruitment based on deficit
    let desiredRecruitment = 0;
    
    // CRISIS: Urgent military need
    if (analysis.militaryDeficit > 50) {
      desiredRecruitment = Math.min(30, analysis.militaryDeficit / 2);
    }
    // HIGH PRIORITY: Significant deficit
    else if (analysis.militaryDeficit > 20) {
      desiredRecruitment = Math.min(20, analysis.militaryDeficit / 2);
    }
    // NORMAL: Small deficit  
    else if (analysis.militaryDeficit > 5) {
      desiredRecruitment = Math.min(10, analysis.militaryDeficit);
    }
    
    // Scale by priority weight
    desiredRecruitment = Math.floor(desiredRecruitment * weights.militaryPriority);
    
    // Clamp to affordable amount
    const finalRecruitment = Math.min(desiredRecruitment, maxAffordable);
    
    // Round to multiples of 5 for cleaner numbers (optional, but nice)
    const rounded = Math.floor(finalRecruitment / 5) * 5;
    
    return Math.max(0, rounded);
  }

  /**
   * Calculate infrastructure investment ROI (turns to break even)
   */
  private static calculateInfrastructureROI(stats: CountryStats, cost: number): number {
    const currentLevel = stats.infrastructureLevel || 0;
    
    // Simulate revenue with current infra (NEW: Only infra affects tax, not tech!)
    const currentInfraBonus = 1 + (currentLevel * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_TAX_EFFICIENCY);
    const populationUnits = stats.population / 10000;
    const baseTax = populationUnits * ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN;
    const currentRevenue = Math.floor(baseTax * currentInfraBonus);
    
    // Simulate revenue with +1 infra
    const newInfraBonus = 1 + ((currentLevel + 1) * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_TAX_EFFICIENCY);
    const newRevenue = Math.floor(baseTax * newInfraBonus);
    
    // Calculate revenue increase per turn
    const revenueIncrease = newRevenue - currentRevenue;
    
    // Calculate maintenance cost increase
    const maintenanceCostIncrease = ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL;
    
    // Net benefit per turn
    const netBenefitPerTurn = revenueIncrease - maintenanceCostIncrease;
    
    if (netBenefitPerTurn <= 0) return Infinity;
    
    return Math.ceil(cost / netBenefitPerTurn);
  }

  /**
   * Calculate research investment ROI (turns to break even)
   * NEW: Tech affects production, not tax. ROI based on production value increase.
   */
  private static calculateResearchROI(stats: CountryStats, cost: number): number {
    // Get current and next tech multipliers (supports unlimited levels)
    const currentLevel = Math.floor(stats.technologyLevel);
    const nextLevel = currentLevel + 1;
    
    // Use ResourceProduction to get multipliers (handles unlimited levels)
    const currentMultiplier = ResourceProduction.getTechnologyMultiplier(currentLevel);
    const nextMultiplier = ResourceProduction.getTechnologyMultiplier(nextLevel);
    
    // Estimate production value increase (simplified - assume average resource value)
    const populationUnits = stats.population / 10000;
    const baseProduction = populationUnits * ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP;
    const averageResourceValue = 2; // Rough estimate: 1 food ≈ 2 credits value
    
    const currentProductionValue = baseProduction * currentMultiplier * averageResourceValue;
    const newProductionValue = baseProduction * nextMultiplier * averageResourceValue;
    const productionIncrease = newProductionValue - currentProductionValue;
    
    if (productionIncrease <= 0) return Infinity;
    
    return Math.ceil(cost / productionIncrease);
  }

  /**
   * Check if country has surplus resources to trade
   */
  private static hasResourceSurplus(stats: CountryStats): boolean {
    const resources = stats.resources;
    const foodAmount = resources.food || 0;
    const foodConsumption = (stats.population / 10000) * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
    
    // Has food surplus OR has valuable trading resources
    if (foodAmount > foodConsumption * 10) return true;
    if ((resources.oil || 0) > 100) return true;
    if ((resources.gold || 0) > 50) return true;
    if ((resources.steel || 0) > 50) return true; // Steel replaces rare_earth as advanced material
    
    return false;
  }

  /**
   * Get neighboring countries (simple distance calculation)
   */
  private static getNeighbors(state: GameStateSnapshot, countryId: string): CountryStats[] {
    const country = state.countries.find(c => c.id === countryId);
    if (!country) return [];
    
    // Find countries within "neighbor" distance (simplified)
    const neighborDistance = 200; // Adjust based on your map size
    
    const neighbors: CountryStats[] = [];
    for (const otherCountry of state.countries) {
      if (otherCountry.id === countryId) continue;
      
      const distance = Math.sqrt(
        Math.pow(country.positionX - otherCountry.positionX, 2) +
        Math.pow(country.positionY - otherCountry.positionY, 2)
      );
      
      if (distance < neighborDistance) {
        const stats = state.countryStatsByCountryId[otherCountry.id];
        if (stats) neighbors.push(stats);
      }
    }
    
    return neighbors;
  }
}
