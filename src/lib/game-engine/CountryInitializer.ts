/**
 * Country Initializer
 * Creates fair, randomized starting conditions for countries
 * Ensures all countries start with equal total value but different stat distributions
 */

import { ResourceProfileManager, ResourceProfile } from './ResourceProfile';

export interface StartingProfile {
  population: number;
  budget: number;
  technologyLevel: number;
  infrastructureLevel: number;
  militaryStrength: number;
  resources: Record<string, number>;
  resourceProfile: ResourceProfile;
}

export const STAT_VALUES = {
  // How much each unit of a stat is "worth" in credits
  POPULATION_PER_10K: 50,        // 10k pop = 50 credits value
  BUDGET: 1,                      // 1 credit = 1 credit value
  TECHNOLOGY_LEVEL: 2000,         // 1 tech level = 2000 credits value
  INFRASTRUCTURE_LEVEL: 1500,     // 1 infra level = 1500 credits value
  MILITARY_STRENGTH_PER_10: 150,  // 10 military strength = 150 credits value
  FOOD_PER_100: 20,               // 100 food = 20 credits value
  IRON_PER_10: 30,                // 10 iron = 30 credits value
} as const;

export const STARTING_RANGES = {
  TOTAL_VALUE: 15000,             // All countries start with equivalent value
  POPULATION: { min: 80000, max: 150000 },      // 80k-150k pop
  BUDGET: { min: 3000, max: 8000 },             // $3k-8k
  TECHNOLOGY: { min: 0, max: 2 },               // Level 0-2
  INFRASTRUCTURE: { min: 0, max: 2 },           // Level 0-2
  MILITARY: { min: 20, max: 60 },               // 20-60 strength
  FOOD: { min: 200, max: 500 },                 // 200-500 food
} as const;

export class CountryInitializer {
  /**
   * Generate fair random starting stats WITH resource specialization
   * All countries have equal total value but different distributions
   */
  static generateRandomStart(seed?: string, preassignedProfile?: ResourceProfile): StartingProfile {
    const rng = this.createSeededRNG(seed);
    
    // Use preassigned profile or assign one
    const resourceProfile = preassignedProfile || ResourceProfileManager.assignRandomProfile(seed);
    
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      // Randomly generate stats within ranges
      const population = this.randomInt(rng, 
        STARTING_RANGES.POPULATION.min, 
        STARTING_RANGES.POPULATION.max, 
        10000 // Round to nearest 10k
      );
      
      const technologyLevel = this.randomInt(rng, 
        STARTING_RANGES.TECHNOLOGY.min, 
        STARTING_RANGES.TECHNOLOGY.max
      );
      
      const infrastructureLevel = this.randomInt(rng, 
        STARTING_RANGES.INFRASTRUCTURE.min, 
        STARTING_RANGES.INFRASTRUCTURE.max
      );
      
      const militaryStrength = this.randomInt(rng, 
        STARTING_RANGES.MILITARY.min, 
        STARTING_RANGES.MILITARY.max, 
        10 // Round to nearest 10
      );
      
      const food = this.randomInt(rng,
        STARTING_RANGES.FOOD.min,
        STARTING_RANGES.FOOD.max,
        50 // Round to nearest 50
      );
      
      // Calculate value consumed so far
      const consumedValue = 
        (population / 10000) * STAT_VALUES.POPULATION_PER_10K +
        technologyLevel * STAT_VALUES.TECHNOLOGY_LEVEL +
        infrastructureLevel * STAT_VALUES.INFRASTRUCTURE_LEVEL +
        (militaryStrength / 10) * STAT_VALUES.MILITARY_STRENGTH_PER_10 +
        (food / 100) * STAT_VALUES.FOOD_PER_100;
      
      // Remaining value goes to budget and other resources
      const remainingValue = STARTING_RANGES.TOTAL_VALUE - consumedValue;
      
      // Check if remaining value is within budget range
      const minBudget = STARTING_RANGES.BUDGET.min;
      const maxBudget = STARTING_RANGES.BUDGET.max;
      
      if (remainingValue >= minBudget && remainingValue <= maxBudget * 2) {
        // Valid distribution found
        const budget = Math.min(remainingValue * 0.7, maxBudget);
        const resourceValue = remainingValue - budget;
        
        // Distribute remaining value to base resources
        const baseResources = this.distributeResourceValue(rng, resourceValue, food);
        
        // Apply resource profile to starting resources
        const profiledResources = ResourceProfileManager.applyProfileToStartingResources(
          baseResources,
          resourceProfile
        );
        
        return {
          population,
          budget: Math.floor(budget),
          technologyLevel,
          infrastructureLevel,
          militaryStrength,
          resources: profiledResources,
          resourceProfile,
        };
      }
    }
    
    // Fallback to balanced default if random generation fails
    console.warn('Failed to generate random start after max attempts, using balanced default');
    return this.getBalancedDefault();
  }
  
  /**
   * Distribute remaining credit value across resources randomly
   */
  private static distributeResourceValue(
    rng: () => number,
    totalValue: number,
    existingFood: number
  ): Record<string, number> {
    const resources: Record<string, number> = {
      food: existingFood,
      water: 0,
      timber: 0,
      stone: 0,
      iron: 0,
      oil: 0,
      rare_earth: 0,
      gold: 0,
      gems: 0,
      coal: 0,
      steel: 0,
      aluminum: 0,
    };
    
    // Define resource value weights (strategic resources worth more)
    const resourceTypes = [
      { id: 'water', valuePerUnit: 0.1, weight: 2 },
      { id: 'timber', valuePerUnit: 0.2, weight: 2 },
      { id: 'stone', valuePerUnit: 0.3, weight: 2 },
      { id: 'iron', valuePerUnit: 3.0, weight: 3 },      // Strategic
      { id: 'oil', valuePerUnit: 4.0, weight: 2 },       // Strategic
      { id: 'rare_earth', valuePerUnit: 8.0, weight: 1 }, // Rare
      { id: 'gold', valuePerUnit: 5.0, weight: 1 },      // Valuable
      { id: 'gems', valuePerUnit: 6.0, weight: 1 },      // Valuable
      { id: 'coal', valuePerUnit: 1.5, weight: 2 },
      { id: 'steel', valuePerUnit: 3.5, weight: 2 },
      { id: 'aluminum', valuePerUnit: 2.5, weight: 2 },
    ];
    
    // Randomly allocate value to resources based on weights
    let remainingValue = totalValue;
    
    for (const resourceType of resourceTypes) {
      if (remainingValue <= 0) break;
      
      // Random allocation based on weight
      const allocation = rng() * resourceType.weight * (remainingValue / 10);
      const amount = Math.floor(allocation / resourceType.valuePerUnit);
      
      resources[resourceType.id] = Math.max(0, amount);
      remainingValue -= amount * resourceType.valuePerUnit;
    }
    
    return resources;
  }
  
  /**
   * Get balanced default starting profile
   */
  private static getBalancedDefault(): StartingProfile {
    // Use "Balanced Nation" profile as default
    const balancedProfile = ResourceProfileManager.assignProfilesForGame(1, 'balanced')[0];
    
    return {
      population: 100000,
      budget: 5000,
      technologyLevel: 1,
      infrastructureLevel: 1,
      militaryStrength: 40,
      resources: {
        food: 300,
        water: 150,
        timber: 100,
        stone: 80,
        iron: 50,
        oil: 30,
        rare_earth: 10,
        gold: 15,
        gems: 8,
        coal: 40,
        steel: 25,
        aluminum: 20,
      },
      resourceProfile: balancedProfile,
    };
  }
  
  /**
   * Create seeded RNG for deterministic randomization
   */
  private static createSeededRNG(seed?: string): () => number {
    if (!seed) {
      return Math.random;
    }
    
    // Simple seeded RNG (mulberry32 algorithm)
    let seedValue = 0;
    for (let i = 0; i < seed.length; i++) {
      seedValue = ((seedValue << 5) - seedValue) + seed.charCodeAt(i);
      seedValue = seedValue & seedValue;
    }
    
    return function() {
      seedValue = (seedValue * 9301 + 49297) % 233280;
      return seedValue / 233280;
    };
  }
  
  /**
   * Random integer within range, optionally rounded to nearest multiple
   */
  private static randomInt(
    rng: () => number, 
    min: number, 
    max: number, 
    roundTo: number = 1
  ): number {
    const value = Math.floor(rng() * (max - min + 1)) + min;
    return Math.round(value / roundTo) * roundTo;
  }
  
  /**
   * Validate that starting profile is fair and playable
   */
  static validateProfile(profile: StartingProfile): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // Check food sustainability (at least 5 turns of food)
    const foodConsumptionPerTurn = (profile.population / 10000) * 5;
    if (profile.resources.food < foodConsumptionPerTurn * 5) {
      issues.push(`Insufficient starting food: ${profile.resources.food} (needs ${foodConsumptionPerTurn * 5})`);
    }
    
    // Check budget can cover at least 10 turns of expenses
    const estimatedExpenses = 
      Math.floor(profile.budget * 0.01) + // Maintenance
      profile.militaryStrength * 0.8 +    // Military upkeep
      profile.infrastructureLevel * 20;    // Infrastructure cost
    
    if (profile.budget < estimatedExpenses * 10) {
      issues.push(`Budget too low for sustainable operations: ${profile.budget} (needs ${estimatedExpenses * 10})`);
    }
    
    // Check population is reasonable
    if (profile.population < 50000 || profile.population > 200000) {
      issues.push(`Population out of reasonable range: ${profile.population}`);
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Generate multiple country profiles ensuring variety
   * Ensures diverse resource profiles across countries
   */
  static generateMultipleProfiles(count: number, gameSeed?: string): StartingProfile[] {
    // Assign diverse resource profiles first (no duplicates in small games)
    const resourceProfiles = ResourceProfileManager.assignProfilesForGame(count, gameSeed);
    
    const profiles: StartingProfile[] = [];
    
    // Create a unique random component per country that won't collide
    // Use prime number multiplication to ensure different sequences
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
    
    for (let i = 0; i < count; i++) {
      // Create truly unique seed per country using multiple factors:
      // 1. Base game seed
      // 2. Country index with prime multiplication for sequence variation
      // 3. Random component that's different per index
      const randomComponent = Math.floor(Math.random() * 1000000);
      const primeMultiplier = primes[i % primes.length];
      const uniqueValue = (i * primeMultiplier * 1000) + randomComponent;
      
      const countrySeed = gameSeed 
        ? `${gameSeed}-c${i}-p${primeMultiplier}-r${uniqueValue}` 
        : `country-${i}-rand-${randomComponent}`;
      
      // Generate profile with preassigned resource profile
      const profile = this.generateRandomStart(countrySeed, resourceProfiles[i]);
      
      const validation = this.validateProfile(profile);
      if (!validation.isValid) {
        console.warn(`Country ${i} failed validation:`, validation.issues);
        // Use balanced default instead
        const defaultProfile = this.getBalancedDefault();
        defaultProfile.resourceProfile = resourceProfiles[i]; // Keep assigned profile
        // Re-apply profile to default
        defaultProfile.resources = ResourceProfileManager.applyProfileToStartingResources(
          defaultProfile.resources,
          resourceProfiles[i]
        );
        profiles.push(defaultProfile);
      } else {
        profiles.push(profile);
      }
    }
    
    return profiles;
  }
  
  /**
   * Calculate total value of a starting profile
   */
  static calculateProfileValue(profile: StartingProfile): number {
    let totalValue = 0;
    
    // Population value
    totalValue += (profile.population / 10000) * STAT_VALUES.POPULATION_PER_10K;
    
    // Budget value
    totalValue += profile.budget * STAT_VALUES.BUDGET;
    
    // Technology value
    totalValue += profile.technologyLevel * STAT_VALUES.TECHNOLOGY_LEVEL;
    
    // Infrastructure value
    totalValue += profile.infrastructureLevel * STAT_VALUES.INFRASTRUCTURE_LEVEL;
    
    // Military value
    totalValue += (profile.militaryStrength / 10) * STAT_VALUES.MILITARY_STRENGTH_PER_10;
    
    // Food value
    totalValue += (profile.resources.food / 100) * STAT_VALUES.FOOD_PER_100;
    
    // Other resource values (simplified)
    totalValue += (profile.resources.iron || 0) / 10 * STAT_VALUES.IRON_PER_10;
    
    return totalValue;
  }
}

/**
 * Country Archetypes - Optional Preset Profiles
 * Balanced alternatives to random generation
 */
export const COUNTRY_ARCHETYPES = {
  ECONOMIC_POWERHOUSE: {
    name: 'Economic Powerhouse',
    description: 'High population and advanced economy, weak military',
    profile: {
      population: 150000,      // High pop
      budget: 7000,            // High budget
      technologyLevel: 2,      // Advanced tech
      infrastructureLevel: 2,  // Good infrastructure
      militaryStrength: 20,    // Weak military
      resources: { 
        food: 500, 
        water: 200,
        timber: 120,
        stone: 100,
        iron: 20,
        oil: 15,
        rare_earth: 8,
        gold: 25,
        gems: 15,
        coal: 50,
        steel: 15,
        aluminum: 25,
      }
    }
  },
  
  MILITARY_EMPIRE: {
    name: 'Military Empire',
    description: 'Powerful military, lower economy and infrastructure',
    profile: {
      population: 120000,
      budget: 4000,            // Lower budget
      technologyLevel: 1,
      infrastructureLevel: 0,   // No infrastructure
      militaryStrength: 60,     // Strong military
      resources: { 
        food: 300,
        water: 120,
        timber: 80,
        stone: 100,
        iron: 80,
        oil: 45,
        rare_earth: 5,
        gold: 10,
        gems: 5,
        coal: 60,
        steel: 40,
        aluminum: 30,
      }
    }
  },
  
  TECHNOLOGICAL_LEADER: {
    name: 'Technological Leader',
    description: 'Advanced technology, moderate everything else',
    profile: {
      population: 90000,        // Lower pop
      budget: 5000,
      technologyLevel: 2,       // Max starting tech
      infrastructureLevel: 1,
      militaryStrength: 30,
      resources: { 
        food: 350,
        water: 140,
        timber: 90,
        stone: 70,
        iron: 40,
        oil: 35,
        rare_earth: 25,
        gold: 20,
        gems: 12,
        coal: 45,
        steel: 30,
        aluminum: 28,
      }
    }
  },
  
  BALANCED_NATION: {
    name: 'Balanced Nation',
    description: 'Well-rounded stats across all categories',
    profile: {
      population: 100000,
      budget: 5000,
      technologyLevel: 1,
      infrastructureLevel: 1,
      militaryStrength: 40,
      resources: { 
        food: 300,
        water: 150,
        timber: 100,
        stone: 80,
        iron: 50,
        oil: 30,
        rare_earth: 10,
        gold: 15,
        gems: 8,
        coal: 40,
        steel: 25,
        aluminum: 20,
      }
    }
  },
  
  DEVELOPING_NATION: {
    name: 'Developing Nation',
    description: 'Large population, low technology and infrastructure',
    profile: {
      population: 140000,       // High pop
      budget: 3500,             // Low budget
      technologyLevel: 0,       // No tech
      infrastructureLevel: 0,   // No infra
      militaryStrength: 35,
      resources: { 
        food: 400,
        water: 180,
        timber: 120,
        stone: 90,
        iron: 30,
        oil: 20,
        rare_earth: 5,
        gold: 8,
        gems: 3,
        coal: 30,
        steel: 10,
        aluminum: 12,
      }
    }
  }
} as const;
