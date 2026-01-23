/**
 * Resource Cost System
 * Defines resource requirements for all game actions.
 * Makes resources meaningful by requiring them for military, research, and infrastructure.
 */

import type { CountryStats } from '@/types/country';
import { ResourceAmount } from './ResourceTypes';

export interface ResourceCostResult {
  required: ResourceAmount[];
  canAfford: boolean;
  missing: ResourceAmount[];
  shortage: boolean;      // True if missing ANY resources
  penaltyMultiplier: number; // Cost multiplier if resources are missing (1.0 = no penalty, 2.0 = double cost)
}

/**
 * Resource Cost Calculator
 * Determines what resources are needed for different actions based on tech level and action type
 */
export class ResourceCost {
  
  /**
   * Calculate resource requirements for military recruitment
   * Requirements scale with tech level to represent more advanced units
   * Simplified for 8-resource system
   */
  static calculateMilitaryResourceCost(
    amount: number,
    stats: CountryStats
  ): ResourceAmount[] {
    const techLevel = Math.floor(stats.technologyLevel);
    const baseRequirement = amount / 10; // Per 10 military strength
    
    const costs: ResourceAmount[] = [];
    
    // TECH 0-1: Basic military (iron weapons, timber for structures)
    if (techLevel <= 1) {
      costs.push(
        { resourceId: 'iron', amount: Math.ceil(baseRequirement * 6) },
        { resourceId: 'timber', amount: Math.ceil(baseRequirement * 4) }
      );
    }
    // TECH 2-3: Industrial military (steel equipment, oil for vehicles)
    else if (techLevel <= 3) {
      costs.push(
        { resourceId: 'iron', amount: Math.ceil(baseRequirement * 3) },
        { resourceId: 'steel', amount: Math.ceil(baseRequirement * 4) },
        { resourceId: 'oil', amount: Math.ceil(baseRequirement * 2) }
      );
    }
    // TECH 4-5: Advanced military (steel, oil, still needs iron)
    else {
      costs.push(
        { resourceId: 'steel', amount: Math.ceil(baseRequirement * 4) },
        { resourceId: 'oil', amount: Math.ceil(baseRequirement * 3) },
        { resourceId: 'iron', amount: Math.ceil(baseRequirement * 2) }
      );
    }
    
    return costs;
  }
  
  /**
   * Calculate resource requirements for technology research
   * Higher tech requires more advanced materials
   * Simplified for 8-resource system
   */
  static calculateResearchResourceCost(stats: CountryStats): ResourceAmount[] {
    const currentTechLevel = Math.floor(stats.technologyLevel);
    const costs: ResourceAmount[] = [];
    
    // TECH 0-1: Basic research (copper tools, coal energy)
    if (currentTechLevel <= 1) {
      costs.push(
        { resourceId: 'copper', amount: 10 },
        { resourceId: 'coal', amount: 8 }
      );
    }
    // TECH 2-3: Advanced research (copper, coal, steel)
    else if (currentTechLevel <= 3) {
      costs.push(
        { resourceId: 'copper', amount: 8 },
        { resourceId: 'coal', amount: 12 },
        { resourceId: 'steel', amount: 6 }
      );
    }
    // TECH 4-5: Cutting-edge research (steel, coal, copper)
    else {
      costs.push(
        { resourceId: 'steel', amount: 10 },
        { resourceId: 'coal', amount: 15 },
        { resourceId: 'copper', amount: 5 }
      );
    }
    
    return costs;
  }
  
  /**
   * Calculate resource requirements for infrastructure construction
   * Always requires building materials, more advanced levels need industrial resources
   * Simplified for 8-resource system
   */
  static calculateInfrastructureResourceCost(stats: CountryStats): ResourceAmount[] {
    const currentInfraLevel = stats.infrastructureLevel || 0;
    const costs: ResourceAmount[] = [];
    
    // All levels: Basic construction materials (timber, coal for energy)
    costs.push(
      { resourceId: 'timber', amount: 20 + (currentInfraLevel * 4) },
      { resourceId: 'coal', amount: 15 + (currentInfraLevel * 3) }
    );
    
    // Level 2+: Industrial construction (steel)
    if (currentInfraLevel >= 2) {
      costs.push(
        { resourceId: 'steel', amount: 12 + (currentInfraLevel * 2) }
      );
    }
    
    // Level 4+: Advanced construction (oil for energy infrastructure)
    if (currentInfraLevel >= 4) {
      costs.push(
        { resourceId: 'oil', amount: 5 }
      );
    }
    
    return costs;
  }
  
  /**
   * Check if a country can afford the resource cost
   * Returns detailed information about affordability and shortages
   */
  static checkResourceAffordability(
    required: ResourceAmount[],
    currentResources: Record<string, number>
  ): ResourceCostResult {
    const missing: ResourceAmount[] = [];
    let canAfford = true;
    
    for (const req of required) {
      const available = currentResources[req.resourceId] || 0;
      if (available < req.amount) {
        canAfford = false;
        missing.push({
          resourceId: req.resourceId,
          amount: req.amount - available
        });
      }
    }
    
    // Calculate penalty multiplier based on shortage severity
    // If you're missing resources, budget cost increases
    let penaltyMultiplier = 1.0;
    if (!canAfford) {
      // For each missing resource, add 40% penalty (can stack up to 2.5x cost)
      const missingCount = missing.length;
      penaltyMultiplier = Math.min(1.0 + (missingCount * 0.4), 2.5);
    }
    
    return {
      required,
      canAfford,
      missing,
      shortage: !canAfford,
      penaltyMultiplier
    };
  }
  
  /**
   * Deduct resources from country's stockpile
   * Returns updated resource record
   */
  static deductResources(
    currentResources: Record<string, number>,
    costs: ResourceAmount[]
  ): Record<string, number> {
    const updated = { ...currentResources };
    
    for (const cost of costs) {
      const current = updated[cost.resourceId] || 0;
      updated[cost.resourceId] = Math.max(0, current - cost.amount);
    }
    
    return updated;
  }
  
  /**
   * Get resource cost for an action type
   * Unified interface for all action types
   */
  static getResourceCostForAction(
    actionType: 'research' | 'infrastructure' | 'military',
    stats: CountryStats,
    militaryAmount?: number
  ): ResourceAmount[] {
    switch (actionType) {
      case 'research':
        return this.calculateResearchResourceCost(stats);
      case 'infrastructure':
        return this.calculateInfrastructureResourceCost(stats);
      case 'military':
        return this.calculateMilitaryResourceCost(militaryAmount || 10, stats);
      default:
        return [];
    }
  }
  
  /**
   * Format resource costs for display
   */
  static formatResourceCost(costs: ResourceAmount[]): string {
    if (costs.length === 0) return 'No resources required';
    
    return costs.map(c => `${c.amount}x ${this.getResourceName(c.resourceId)}`).join(', ');
  }
  
  /**
   * Get display name for a resource
   */
  private static getResourceName(resourceId: string): string {
    const names: Record<string, string> = {
      'food': 'Food',
      'timber': 'Timber',
      'iron': 'Iron',
      'oil': 'Oil',
      'gold': 'Gold',
      'copper': 'Copper',
      'steel': 'Steel',
      'coal': 'Coal'
    };
    return names[resourceId] || resourceId;
  }
}
