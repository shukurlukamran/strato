/**
 * Client-side Resource Cost Display Utilities
 * Mirrors server-side ResourceCost logic for UI display purposes
 */

import type { CountryStats } from '@/types/country';
import { ResourceAmount } from './ResourceTypes';

/**
 * Client-side resource cost calculator for UI display
 * Matches the server-side logic in ResourceCost.ts
 */
export class ResourceCostClient {
  
  /**
   * Calculate and format military resource requirements for display
   */
  static getMilitaryResourceCost(
    amount: number,
    stats: CountryStats
  ): { costs: ResourceAmount[]; formatted: string; canAfford: boolean; missing: ResourceAmount[] } {
    const techLevel = Math.floor(stats.technologyLevel);
    const baseRequirement = amount / 10;
    
    const costs: ResourceAmount[] = [];
    
    // TECH 0-1: Basic military
    if (techLevel <= 1) {
      costs.push(
        { resourceId: 'iron', amount: Math.ceil(baseRequirement * 6) },
        { resourceId: 'timber', amount: Math.ceil(baseRequirement * 4) }
      );
    }
    // TECH 2-3: Industrial military
    else if (techLevel <= 3) {
      costs.push(
        { resourceId: 'iron', amount: Math.ceil(baseRequirement * 3) },
        { resourceId: 'steel', amount: Math.ceil(baseRequirement * 4) },
        { resourceId: 'oil', amount: Math.ceil(baseRequirement * 2) }
      );
    }
    // TECH 4-5: Advanced military
    else {
      costs.push(
        { resourceId: 'steel', amount: Math.ceil(baseRequirement * 4) },
        { resourceId: 'oil', amount: Math.ceil(baseRequirement * 3) },
        { resourceId: 'iron', amount: Math.ceil(baseRequirement * 2) }
      );
    }
    
    const { canAfford, missing, formatted } = this.checkAffordability(costs, stats.resources);
    
    return { costs, formatted, canAfford, missing };
  }
  
  /**
   * Calculate and format research resource requirements for display
   */
  static getResearchResourceCost(
    stats: CountryStats
  ): { costs: ResourceAmount[]; formatted: string; canAfford: boolean; missing: ResourceAmount[] } {
    const currentTechLevel = Math.floor(stats.technologyLevel);
    const costs: ResourceAmount[] = [];
    
    // TECH 0-1: Basic research
    if (currentTechLevel <= 1) {
      costs.push(
        { resourceId: 'copper', amount: 10 },
        { resourceId: 'coal', amount: 8 }
      );
    }
    // TECH 2-3: Advanced research
    else if (currentTechLevel <= 3) {
      costs.push(
        { resourceId: 'copper', amount: 8 },
        { resourceId: 'coal', amount: 12 },
        { resourceId: 'steel', amount: 6 }
      );
    }
    // TECH 4-5: Cutting-edge research
    else {
      costs.push(
        { resourceId: 'steel', amount: 10 },
        { resourceId: 'coal', amount: 15 },
        { resourceId: 'copper', amount: 5 }
      );
    }
    
    const { canAfford, missing, formatted } = this.checkAffordability(costs, stats.resources);
    
    return { costs, formatted, canAfford, missing };
  }
  
  /**
   * Calculate and format infrastructure resource requirements for display
   */
  static getInfrastructureResourceCost(
    stats: CountryStats
  ): { costs: ResourceAmount[]; formatted: string; canAfford: boolean; missing: ResourceAmount[] } {
    const currentInfraLevel = stats.infrastructureLevel || 0;
    const costs: ResourceAmount[] = [];
    
    // All levels: Basic construction materials
    costs.push(
      { resourceId: 'timber', amount: 20 + (currentInfraLevel * 4) },
      { resourceId: 'coal', amount: 15 + (currentInfraLevel * 3) }
    );
    
    // Level 2+: Industrial construction
    if (currentInfraLevel >= 2) {
      costs.push(
        { resourceId: 'steel', amount: 12 + (currentInfraLevel * 2) }
      );
    }
    
    // Level 4+: Advanced construction
    if (currentInfraLevel >= 4) {
      costs.push(
        { resourceId: 'oil', amount: 5 }
      );
    }
    
    const { canAfford, missing, formatted } = this.checkAffordability(costs, stats.resources);
    
    return { costs, formatted, canAfford, missing };
  }
  
  /**
   * Check if resources can be afforded and format the display
   */
  private static checkAffordability(
    costs: ResourceAmount[],
    currentResources: Record<string, number>
  ): { canAfford: boolean; missing: ResourceAmount[]; formatted: string } {
    const missing: ResourceAmount[] = [];
    const parts: string[] = [];
    
    for (const cost of costs) {
      const available = currentResources[cost.resourceId] || 0;
      const resourceName = this.getResourceName(cost.resourceId);
      const icon = this.getResourceIcon(cost.resourceId);
      
      if (available < cost.amount) {
        missing.push({
          resourceId: cost.resourceId,
          amount: cost.amount - available
        });
        parts.push(`${icon} ${cost.amount} ${resourceName} ❌`);
      } else {
        parts.push(`${icon} ${cost.amount} ${resourceName} ✓`);
      }
    }
    
    const canAfford = missing.length === 0;
    const formatted = parts.join(', ');
    
    return { canAfford, missing, formatted };
  }
  
  /**
   * Calculate penalty multiplier for UI display
   */
  static calculatePenaltyMultiplier(missingCount: number): number {
    return Math.min(1.0 + (missingCount * 0.4), 2.5);
  }
  
  /**
   * Get resource display name (8-resource system)
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
  
  /**
   * Get resource icon (8-resource system)
   */
  private static getResourceIcon(resourceId: string): string {
    const icons: Record<string, string> = {
      'food': '🌾',
      'timber': '🪵',
      'iron': '⚙️',
      'oil': '🛢️',
      'gold': '🥇',
      'copper': '🔶',
      'steel': '🔩',
      'coal': '⚫'
    };
    return icons[resourceId] || '📦';
  }
}
