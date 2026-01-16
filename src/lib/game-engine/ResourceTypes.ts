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

// Initialize default resources
export const DEFAULT_RESOURCES: ResourceDefinition[] = [
  // BASIC Resources
  {
    id: 'food',
    name: 'Food',
    category: ResourceCategory.BASIC,
    baseValue: 2,
    productionDifficulty: 0.3,
    storageDecay: 0.1, // 10% spoils per turn
    tradeable: true,
    description: 'Essential for population growth and maintenance'
  },
  {
    id: 'water',
    name: 'Water',
    category: ResourceCategory.BASIC,
    baseValue: 1,
    productionDifficulty: 0.2,
    storageDecay: 0.05,
    tradeable: true,
    description: 'Population health, agriculture'
  },
  {
    id: 'timber',
    name: 'Timber',
    category: ResourceCategory.BASIC,
    baseValue: 3,
    productionDifficulty: 0.4,
    storageDecay: 0,
    tradeable: true,
    description: 'Construction, basic production'
  },
  {
    id: 'stone',
    name: 'Stone',
    category: ResourceCategory.BASIC,
    baseValue: 4,
    productionDifficulty: 0.5,
    storageDecay: 0,
    tradeable: true,
    description: 'Infrastructure, fortifications'
  },
  
  // STRATEGIC Resources
  {
    id: 'iron',
    name: 'Iron',
    category: ResourceCategory.STRATEGIC,
    baseValue: 10,
    productionDifficulty: 0.6,
    storageDecay: 0,
    tradeable: true,
    description: 'Required for military equipment production'
  },
  {
    id: 'oil',
    name: 'Oil',
    category: ResourceCategory.STRATEGIC,
    baseValue: 15,
    productionDifficulty: 0.7,
    storageDecay: 0,
    tradeable: true,
    description: 'Advanced military units, energy'
  },
  {
    id: 'uranium',
    name: 'Uranium',
    category: ResourceCategory.STRATEGIC,
    baseValue: 50,
    productionDifficulty: 0.9,
    storageDecay: 0,
    tradeable: false,
    description: 'Nuclear capabilities (future)'
  },
  {
    id: 'rare_earth',
    name: 'Rare Earth',
    category: ResourceCategory.STRATEGIC,
    baseValue: 25,
    productionDifficulty: 0.8,
    storageDecay: 0,
    tradeable: true,
    description: 'Advanced technology research'
  },
  
  // ECONOMIC Resources
  {
    id: 'gold',
    name: 'Gold',
    category: ResourceCategory.ECONOMIC,
    baseValue: 20,
    productionDifficulty: 0.5,
    storageDecay: 0,
    tradeable: true,
    description: 'Luxury goods, diplomatic influence'
  },
  {
    id: 'silver',
    name: 'Silver',
    category: ResourceCategory.ECONOMIC,
    baseValue: 8,
    productionDifficulty: 0.4,
    storageDecay: 0,
    tradeable: true,
    description: 'Currency backing, trade bonus'
  },
  {
    id: 'gems',
    name: 'Gems',
    category: ResourceCategory.ECONOMIC,
    baseValue: 30,
    productionDifficulty: 0.6,
    storageDecay: 0,
    tradeable: true,
    description: 'High-value trade commodity'
  },
  {
    id: 'copper',
    name: 'Copper',
    category: ResourceCategory.ECONOMIC,
    baseValue: 5,
    productionDifficulty: 0.3,
    storageDecay: 0,
    tradeable: true,
    description: 'Industrial applications'
  },
  
  // INDUSTRIAL Resources
  {
    id: 'coal',
    name: 'Coal',
    category: ResourceCategory.INDUSTRIAL,
    baseValue: 6,
    productionDifficulty: 0.5,
    storageDecay: 0,
    tradeable: true,
    description: 'Energy generation, production boost'
  },
  {
    id: 'steel',
    name: 'Steel',
    category: ResourceCategory.INDUSTRIAL,
    baseValue: 12,
    productionDifficulty: 0.7,
    storageDecay: 0,
    tradeable: true,
    description: 'Advanced construction, military'
  },
  {
    id: 'aluminum',
    name: 'Aluminum',
    category: ResourceCategory.INDUSTRIAL,
    baseValue: 9,
    productionDifficulty: 0.6,
    storageDecay: 0,
    tradeable: true,
    description: 'Aircraft, modern equipment'
  },
  {
    id: 'electronics',
    name: 'Electronics',
    category: ResourceCategory.INDUSTRIAL,
    baseValue: 18,
    productionDifficulty: 0.8,
    storageDecay: 0,
    tradeable: true,
    description: 'Modern technology'
  }
];

// Register all default resources
DEFAULT_RESOURCES.forEach(resource => {
  ResourceRegistry.registerResource(resource);
});
