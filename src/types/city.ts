export interface City {
  id: string;
  countryId: string;
  gameId: string;
  name: string;
  
  // Visual properties
  positionX: number;
  positionY: number;
  size: number; // Relative size (0.5 - 2.0)
  borderPath: string; // SVG path defining city borders
  
  // Economic properties
  perTurnResources: Record<string, number>; // e.g., { oil: 5, gems: 2, coal: 3 }
  population: number;
  
  // State
  isUnderAttack?: boolean;
  createdAt: string;
}

export interface CityStats {
  cityId: string;
  totalValue: number; // Calculated value for deal/attack decisions
  resourceDiversity: number; // Number of different resource types
}

/**
 * Helper to calculate the total value of a city
 * Used for AI decision-making and deal evaluation
 */
export function calculateCityValue(city: City): number {
  let value = 0;
  
  // Population value: 1 point per 1000 population
  value += city.population / 1000;
  
  // Resource value: weighted by resource type (8-resource system)
  // These weights should align with game balance
  const RESOURCE_VALUES: Record<string, number> = {
    food: 8,
    timber: 6,
    iron: 10,
    oil: 15,
    gold: 20,
    copper: 8,
    steel: 12,
    coal: 10,
  };
  
  for (const [resource, amount] of Object.entries(city.perTurnResources)) {
    const weight = RESOURCE_VALUES[resource] || 10;
    value += amount * weight;
  }
  
  return Math.floor(value);
}

/**
 * Calculate resource diversity (number of different resource types)
 */
export function calculateResourceDiversity(city: City): number {
  return Object.keys(city.perTurnResources).length;
}
