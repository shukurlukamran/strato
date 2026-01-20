/**
 * Resource Production System
 * Handles all resource generation logic based on population, technology, and infrastructure.
 * Includes resource profile specialization modifiers.
 */

import type { Country, CountryStats } from '@/types/country';
import { ECONOMIC_BALANCE } from './EconomicBalance';
import { ResourceRegistry, ResourceAmount } from './ResourceTypes';
import { ResourceProfileManager } from './ResourceProfile';

export interface ProductionOutput {
  resources: ResourceAmount[];
  productionSummary: {
    baseProduction: number;
    technologyBonus: number;
    infrastructureBonus: number;
    totalProduction: number;
  };
}

export class ResourceProduction {
  /**
   * Calculate all resource production for a country this turn
   * Includes resource profile specialization modifiers
   * REDESIGN: Infrastructure no longer affects production. Only tech and profile matter.
   */
  static calculateProduction(
    country: Country,
    stats: CountryStats
  ): ProductionOutput {
    // Calculate base multiplier (tech only - infra removed from production)
    const techMultiplier = this.getTechnologyMultiplier(stats.technologyLevel);
    const totalMultiplier = techMultiplier;
    
    // Calculate BASE production (without profile modifiers)
    const baseProductionMap: Record<string, number> = {};
    
    // BASIC RESOURCES
    const basicResources = this.produceBasicResources(stats, totalMultiplier);
    basicResources.forEach(r => baseProductionMap[r.resourceId] = r.amount);
    
    // STRATEGIC RESOURCES (from deposits/mines)
    const strategicResources = this.produceStrategicResources(stats, totalMultiplier);
    strategicResources.forEach(r => baseProductionMap[r.resourceId] = r.amount);
    
    // INDUSTRIAL RESOURCES
    const industrialResources = this.produceIndustrialResources(stats, totalMultiplier);
    industrialResources.forEach(r => baseProductionMap[r.resourceId] = r.amount);
    
    // ECONOMIC RESOURCES (trade-focused)
    const economicResources = this.produceEconomicResources(stats, totalMultiplier);
    economicResources.forEach(r => baseProductionMap[r.resourceId] = r.amount);
    
    // Apply resource profile modifiers if profile exists
    const resourceProfile = stats.resourceProfile;
    let finalProductionMap = baseProductionMap;
    
    if (resourceProfile) {
      finalProductionMap = ResourceProfileManager.applyProfileToProduction(
        baseProductionMap,
        resourceProfile
      );
    }
    
    // Convert back to ResourceAmount array
    const production: ResourceAmount[] = [];
    for (const [resourceId, amount] of Object.entries(finalProductionMap)) {
      production.push({ resourceId, amount });
    }
    
    return {
      resources: production,
      productionSummary: {
        baseProduction: this.calculateBaseProduction(stats),
        technologyBonus: (techMultiplier - 1) * 100,
        infrastructureBonus: 0, // Infrastructure no longer affects production
        totalProduction: this.calculateTotalProduction(production),
      }
    };
  }
  
  /**
   * Food production based on population
   */
  private static produceBasicResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    const populationUnits = stats.population / 10000; // Per 10k population
    
    return [
      {
        resourceId: 'food',
        amount: Math.floor(
          populationUnits * 
          ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP * 
          multiplier
        )
      },
      {
        resourceId: 'water',
        amount: Math.floor(populationUnits * 0.5 * multiplier)
      },
      {
        resourceId: 'timber',
        amount: Math.floor(
          ECONOMIC_BALANCE.PRODUCTION.RESOURCE_EXTRACTION_RATE * 
          multiplier * 
          0.8
        )
      },
      {
        resourceId: 'stone',
        amount: Math.floor(
          ECONOMIC_BALANCE.PRODUCTION.RESOURCE_EXTRACTION_RATE * 
          multiplier * 
          0.6
        )
      }
    ];
  }
  
  /**
   * Strategic resource extraction
   */
  private static produceStrategicResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    // Based on territory size and random deposits (simplified for now)
    const baseExtraction = ECONOMIC_BALANCE.PRODUCTION.RESOURCE_EXTRACTION_RATE;
    
    return [
      {
        resourceId: 'iron',
        amount: Math.floor(baseExtraction * multiplier * 0.7)
      },
      {
        resourceId: 'oil',
        amount: Math.floor(baseExtraction * multiplier * 0.5)
      },
      {
        resourceId: 'rare_earth',
        amount: Math.floor(baseExtraction * multiplier * 0.3)
      }
    ];
  }
  
  /**
   * Industrial production (requires basic resources as input)
   */
  private static produceIndustrialResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    const industrialOutput = ECONOMIC_BALANCE.PRODUCTION.BASE_INDUSTRIAL_OUTPUT;
    
    return [
      {
        resourceId: 'coal',
        amount: Math.floor(industrialOutput * multiplier * 0.8)
      },
      {
        resourceId: 'steel',
        amount: Math.floor(industrialOutput * multiplier * 0.5) // Requires iron
      },
      {
        resourceId: 'aluminum',
        amount: Math.floor(industrialOutput * multiplier * 0.4)
      }
    ];
  }
  
  /**
   * Economic resources (luxury/trade goods)
   */
  private static produceEconomicResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    return [
      {
        resourceId: 'gold',
        amount: Math.floor(5 * multiplier * 0.3)
      },
      {
        resourceId: 'gems',
        amount: Math.floor(3 * multiplier * 0.2)
      }
    ];
  }
  
  /**
   * Apply resource decay (spoilage, etc.)
   */
  static applyDecay(currentResources: ResourceAmount[]): ResourceAmount[] {
    return currentResources.map(resource => {
      const definition = ResourceRegistry.getResource(resource.resourceId);
      if (!definition || definition.storageDecay === 0) {
        return resource;
      }
      
      return {
        resourceId: resource.resourceId,
        amount: Math.floor(resource.amount * (1 - definition.storageDecay))
      };
    });
  }
  
  /**
   * Technology multiplier (public for use in other systems)
   */
  static getTechnologyMultiplier(techLevel: number): number {
    const multipliers = ECONOMIC_BALANCE.TECHNOLOGY;
    const level = Math.min(Math.max(0, Math.floor(techLevel)), 5);
    const key = `LEVEL_${level}_MULTIPLIER` as keyof typeof multipliers;
    return multipliers[key] || 1.0;
  }
  
  private static calculateBaseProduction(stats: CountryStats): number {
    return (stats.population / 10000) * ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP;
  }
  
  private static calculateTotalProduction(resources: ResourceAmount[]): number {
    return resources.reduce((total, resource) => {
      const value = ResourceRegistry.getResourceValue(resource.resourceId, resource.amount);
      return total + value;
    }, 0);
  }
}
