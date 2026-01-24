/**
 * Action Pricing Module
 * Single source of truth for all action costs and resource requirements.
 * Ensures AI and player actions use identical pricing formulas.
 */

import type { CountryStats } from '@/types/country';
import { ResourceCost, type ResourceCostResult } from './ResourceCost';
import { ECONOMIC_BALANCE } from './EconomicBalance';
import { getProfileTechCostModifier, getProfileInfraCostModifier } from './ProfileModifiers';
import { MilitaryCalculator } from './MilitaryCalculator';
import type { ResourceProfile } from './ResourceProfile';

export interface ActionPricingResult {
  cost: number;
  requiredResources: ResourceAmount[];
  resourceCostInfo: ResourceCostResult;
}

export interface AttackPricingResult {
  cost: number;
}

export interface ResourceAmount {
  resourceId: string;
  amount: number;
}

/**
 * Action Pricing Calculator
 * Provides unified cost and resource requirement calculations for all game actions.
 */
export class ActionPricing {

  /**
   * Calculate research action pricing
   */
  static calculateResearchPricing(stats: CountryStats): ActionPricingResult {
    const techLevel = Math.floor(stats.technologyLevel);

    // Calculate resource requirements
    const requiredResources = ResourceCost.calculateResearchResourceCost(stats);
    const resourceCostInfo = ResourceCost.checkResourceAffordability(requiredResources, stats.resources || {});

    // Base cost with exponential growth for levels 0-5, gentler scaling for 6+
    let baseCost: number;
    if (techLevel <= 5) {
      baseCost = ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST *
                Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, techLevel);
    } else {
      // After level 5: baseCost = level5Cost × 1.20^(level - 5)
      const level5Cost = ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST *
                        Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, 5);
      baseCost = level5Cost * Math.pow(1.20, techLevel - 5);
    }

    // Profile modifier (e.g., Tech Hub gets 25% discount)
    const profileModifier = getProfileTechCostModifier(stats.resourceProfile);

    // Research speed bonus (higher tech makes further research slightly cheaper)
    const researchBonus = Math.min(
      ECONOMIC_BALANCE.TECHNOLOGY.MAX_RESEARCH_SPEED_BONUS,
      techLevel * ECONOMIC_BALANCE.TECHNOLOGY.RESEARCH_SPEED_BONUS_PER_LEVEL
    );
    const researchModifier = 1 - researchBonus;

    // Apply resource shortage penalty
    const resourcePenalty = resourceCostInfo.penaltyMultiplier;

    const cost = Math.floor(baseCost * profileModifier * researchModifier * resourcePenalty);

    return {
      cost,
      requiredResources,
      resourceCostInfo
    };
  }

  /**
   * Calculate infrastructure action pricing
   */
  static calculateInfrastructurePricing(stats: CountryStats): ActionPricingResult {
    const infraLevel = stats.infrastructureLevel || 0;

    // Calculate resource requirements
    const requiredResources = ResourceCost.calculateInfrastructureResourceCost(stats);
    const resourceCostInfo = ResourceCost.checkResourceAffordability(requiredResources, stats.resources || {});

    // Base cost with exponential growth
    const baseCost = ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST *
                    Math.pow(ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER, infraLevel);

    // Profile modifier (e.g., Industrial Complex gets 20% discount)
    const profileModifier = getProfileInfraCostModifier(stats.resourceProfile);

    // Apply resource shortage penalty
    const resourcePenalty = resourceCostInfo.penaltyMultiplier;

    const cost = Math.floor(baseCost * profileModifier * resourcePenalty);

    return {
      cost,
      requiredResources,
      resourceCostInfo
    };
  }

  /**
   * Calculate military recruitment action pricing
   */
  static calculateRecruitmentPricing(amount: number, stats: CountryStats): ActionPricingResult {
    // Calculate resource requirements
    const requiredResources = ResourceCost.calculateMilitaryResourceCost(amount, stats);
    const resourceCostInfo = ResourceCost.checkResourceAffordability(requiredResources, stats.resources || {});

    // Base cost calculation with tech and profile modifiers
    const baseCost = MilitaryCalculator.calculateRecruitmentCost(amount, stats);

    // Apply resource shortage penalty
    const resourcePenalty = resourceCostInfo.penaltyMultiplier;

    const cost = Math.floor(baseCost * resourcePenalty);

    return {
      cost,
      requiredResources,
      resourceCostInfo
    };
  }

  /**
   * Calculate attack action pricing
   * Note: Attacks don't require resources, only budget
   */
  static calculateAttackPricing(allocatedStrength: number): AttackPricingResult {
    // Phase 3 cost model: 100 + allocatedStrength * 10
    const cost = 100 + allocatedStrength * 10;

    return { cost };
  }

  /**
   * Unified interface for getting pricing for any action type
   */
  static getPricingForAction(
    actionType: 'research' | 'infrastructure' | 'military',
    stats: CountryStats,
    militaryAmount?: number
  ): ActionPricingResult {
    switch (actionType) {
      case 'research':
        return this.calculateResearchPricing(stats);
      case 'infrastructure':
        return this.calculateInfrastructurePricing(stats);
      case 'military':
        return this.calculateRecruitmentPricing(militaryAmount || 10, stats);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  /**
   * Check if a country can afford an action (budget only; resources optional but penalized)
   */
  static canAffordAction(result: ActionPricingResult, currentBudget: number): boolean {
    return currentBudget >= result.cost;
  }

  /**
   * Check if a country can afford an attack
   */
  static canAffordAttack(result: AttackPricingResult, currentBudget: number): boolean {
    return currentBudget >= result.cost;
  }

  /**
   * Apply action cost and resource deduction to stats
   * Returns updated stats (budget deducted, resources updated)
   */
  static applyActionCost(
    result: ActionPricingResult,
    currentStats: CountryStats
  ): CountryStats {
    const updatedStats = { ...currentStats };

    // Deduct budget
    updatedStats.budget = Math.max(0, currentStats.budget - result.cost);

    // Deduct resources if affordable
    if (result.resourceCostInfo.canAfford) {
      updatedStats.resources = ResourceCost.deductResources(
        currentStats.resources || {},
        result.requiredResources
      );
    }

    return updatedStats;
  }

  /**
   * Apply attack cost to stats
   * Returns updated stats (budget deducted)
   */
  static applyAttackCost(
    result: AttackPricingResult,
    currentStats: CountryStats
  ): CountryStats {
    const updatedStats = { ...currentStats };

    // Deduct budget
    updatedStats.budget = Math.max(0, currentStats.budget - result.cost);

    return updatedStats;
  }
}