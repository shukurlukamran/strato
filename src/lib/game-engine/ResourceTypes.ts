/**
 * Resource Type System
 * Defines all resource types, categories, and provides a registry for resource management.
 */

export enum ResourceCategory {
  STRATEGIC = 'strategic',
  ECONOMIC = 'economic',
  BASIC = 'basic',
  INDUSTRIAL = 'industrial'
}

export interface ResourceDefinition {
  id: string;
  name: string;
  category: ResourceCategory;
  baseValue: number;              // Base monetary value
  productionDifficulty: number;   // 0.1-1.0, affects production rates
  storageDecay: number;           // % lost per turn if not consumed
  tradeable: boolean;
  description: string;
}

export interface ResourceAmount {
  resourceId: string;
  amount: number;
}

/**
 * Registry for managing resource definitions
 */
export class ResourceRegistry {
  private static resources: Map<string, ResourceDefinition> = new Map();
  
  static registerResource(resource: ResourceDefinition): void {
    this.resources.set(resource.id, resource);
  }
  
  static getResource(id: string): ResourceDefinition | undefined {
    return this.resources.get(id);
  }
  
  static getAllResources(): ResourceDefinition[] {
    return Array.from(this.resources.values());
  }
  
  static getResourcesByCategory(category: ResourceCategory): ResourceDefinition[] {
    return Array.from(this.resources.values()).filter(r => r.category === category);
  }
  
  /**
   * Calculate total monetary value of a resource amount
   */
  static getResourceValue(id: string, amount: number): number {
    const resource = this.getResource(id);
    if (!resource) return 0;
    return resource.baseValue * amount;
  }
}

// Initialize default resources (8 resources total - 2 per category)
export const DEFAULT_RESOURCES: ResourceDefinition[] = [
  // BASIC Resources (2)
  {
    id: 'food',
    name: 'Food',
    category: ResourceCategory.BASIC,
    baseValue: 2,
    productionDifficulty: 0.3,
    storageDecay: 0.1, // 10% spoils per turn
    tradeable: true,
    description: 'Essential for population survival and growth. Consumed by population each turn.'
  },
  {
    id: 'timber',
    name: 'Timber',
    category: ResourceCategory.BASIC,
    baseValue: 3,
    productionDifficulty: 0.4,
    storageDecay: 0,
    tradeable: true,
    description: 'Basic construction material. Required for all infrastructure levels and early military.'
  },
  
  // STRATEGIC Resources (2)
  {
    id: 'iron',
    name: 'Iron',
    category: ResourceCategory.STRATEGIC,
    baseValue: 10,
    productionDifficulty: 0.6,
    storageDecay: 0,
    tradeable: true,
    description: 'Core military resource. Required for all military recruitment and steel production.'
  },
  {
    id: 'oil',
    name: 'Oil',
    category: ResourceCategory.STRATEGIC,
    baseValue: 15,
    productionDifficulty: 0.7,
    storageDecay: 0,
    tradeable: true,
    description: 'Advanced military and energy. Required for tech 2+ military and high-level infrastructure.'
  },
  
  // ECONOMIC Resources (2)
  {
    id: 'gold',
    name: 'Gold',
    category: ResourceCategory.ECONOMIC,
    baseValue: 20,
    productionDifficulty: 0.5,
    storageDecay: 0,
    tradeable: true,
    description: 'Luxury goods and diplomatic influence. High-value trade commodity for diplomacy.'
  },
  {
    id: 'copper',
    name: 'Copper',
    category: ResourceCategory.ECONOMIC,
    baseValue: 5,
    productionDifficulty: 0.3,
    storageDecay: 0,
    tradeable: true,
    description: 'Research and trade. Required for technology research (all levels) and industrial applications.'
  },
  
  // INDUSTRIAL Resources (2)
  {
    id: 'steel',
    name: 'Steel',
    category: ResourceCategory.INDUSTRIAL,
    baseValue: 12,
    productionDifficulty: 0.7,
    storageDecay: 0,
    tradeable: true,
    description: 'Advanced construction and military. Required for tech upgrades, infrastructure 2+, and advanced military.'
  },
  {
    id: 'coal',
    name: 'Coal',
    category: ResourceCategory.INDUSTRIAL,
    baseValue: 6,
    productionDifficulty: 0.5,
    storageDecay: 0,
    tradeable: true,
    description: 'Energy and production. Required for research, infrastructure 2+, and industrial production boost.'
  }
];

// Register all default resources
DEFAULT_RESOURCES.forEach(resource => {
  ResourceRegistry.registerResource(resource);
});
