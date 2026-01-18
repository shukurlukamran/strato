/**
 * Resource Specialization System
 * Countries have natural advantages in certain resources (like real-world geography)
 * while maintaining overall balance through trade-offs
 */

export interface ResourceModifier {
  resourceId: string;
  multiplier: number;  // 0.5 = 50% production, 1.5 = 150% production
  startingBonus: number; // Extra starting stockpile
}

export interface ResourceProfile {
  name: string;
  description: string;
  modifiers: ResourceModifier[];
}

export const RESOURCE_PROFILES: ResourceProfile[] = [
  {
    name: "Oil Kingdom",
    description: "Rich in oil deposits, lacks precious metals",
    modifiers: [
      { resourceId: 'oil', multiplier: 2.5, startingBonus: 150 },           // 250% oil production
      { resourceId: 'coal', multiplier: 1.5, startingBonus: 80 },           // 150% coal
      { resourceId: 'gold', multiplier: 0.4, startingBonus: -10 },          // 40% gold (penalty)
      { resourceId: 'gems', multiplier: 0.3, startingBonus: -5 },           // 30% gems (penalty)
    ]
  },
  
  {
    name: "Agriculture",
    description: "Fertile lands, abundant food and timber",
    modifiers: [
      { resourceId: 'food', multiplier: 1.8, startingBonus: 300 },          // 180% food
      { resourceId: 'timber', multiplier: 2.0, startingBonus: 150 },        // 200% timber
      { resourceId: 'water', multiplier: 1.6, startingBonus: 100 },         // 160% water
      { resourceId: 'iron', multiplier: 0.5, startingBonus: -30 },          // 50% iron (penalty)
      { resourceId: 'steel', multiplier: 0.4, startingBonus: -15 },         // 40% steel (penalty)
    ]
  },
  
  {
    name: "Mining Empire",
    description: "Rich in iron, stone, and rare earth minerals",
    modifiers: [
      { resourceId: 'iron', multiplier: 2.2, startingBonus: 120 },          // 220% iron
      { resourceId: 'stone', multiplier: 2.0, startingBonus: 100 },         // 200% stone
      { resourceId: 'rare_earth', multiplier: 2.5, startingBonus: 40 },     // 250% rare earth
      { resourceId: 'food', multiplier: 0.6, startingBonus: -100 },         // 60% food (penalty)
      { resourceId: 'timber', multiplier: 0.5, startingBonus: -50 },        // 50% timber (penalty)
    ]
  },
  
  {
    name: "Technological Hub",
    description: "Advanced industry, rich in aluminum and electronics components",
    modifiers: [
      { resourceId: 'aluminum', multiplier: 2.3, startingBonus: 80 },       // 230% aluminum
      { resourceId: 'steel', multiplier: 1.8, startingBonus: 60 },          // 180% steel
      { resourceId: 'rare_earth', multiplier: 1.6, startingBonus: 25 },     // 160% rare earth
      { resourceId: 'coal', multiplier: 0.6, startingBonus: -30 },          // 60% coal (penalty)
      { resourceId: 'oil', multiplier: 0.5, startingBonus: -20 },           // 50% oil (penalty)
    ]
  },
  
  {
    name: "Precious Metals Trader",
    description: "Abundant gold, gems, and luxury resources",
    modifiers: [
      { resourceId: 'gold', multiplier: 3.0, startingBonus: 60 },           // 300% gold
      { resourceId: 'gems', multiplier: 3.5, startingBonus: 35 },           // 350% gems
      { resourceId: 'iron', multiplier: 0.6, startingBonus: -25 },          // 60% iron (penalty)
      { resourceId: 'coal', multiplier: 0.5, startingBonus: -25 },          // 50% coal (penalty)
    ]
  },
  
  {
    name: "Balanced Nation",
    description: "No major resource advantages or disadvantages",
    modifiers: [
      { resourceId: 'food', multiplier: 1.1, startingBonus: 50 },           // 110% food (slight bonus)
      { resourceId: 'iron', multiplier: 1.1, startingBonus: 10 },           // 110% iron (slight bonus)
      { resourceId: 'gold', multiplier: 0.9, startingBonus: -5 },           // 90% gold (slight penalty)
    ]
  },
  
  {
    name: "Industrial Complex",
    description: "Coal and steel production powerhouse",
    modifiers: [
      { resourceId: 'coal', multiplier: 2.5, startingBonus: 150 },          // 250% coal
      { resourceId: 'steel', multiplier: 2.2, startingBonus: 80 },          // 220% steel
      { resourceId: 'iron', multiplier: 1.5, startingBonus: 60 },           // 150% iron
      { resourceId: 'food', multiplier: 0.7, startingBonus: -80 },          // 70% food (penalty)
      { resourceId: 'water', multiplier: 0.6, startingBonus: -40 },         // 60% water (penalty)
    ]
  },
  
  {
    name: "Coastal Trading Hub",
    description: "Diverse resources from trade routes",
    modifiers: [
      { resourceId: 'water', multiplier: 1.8, startingBonus: 120 },         // 180% water
      { resourceId: 'food', multiplier: 1.4, startingBonus: 100 },          // 140% food (fishing)
      { resourceId: 'gold', multiplier: 1.5, startingBonus: 30 },           // 150% gold (trade)
      { resourceId: 'rare_earth', multiplier: 0.5, startingBonus: -10 },    // 50% rare earth (penalty)
      { resourceId: 'stone', multiplier: 0.6, startingBonus: -40 },         // 60% stone (penalty)
    ]
  }
];

export class ResourceProfileManager {
  /**
   * Assign a random resource profile to a country
   */
  static assignRandomProfile(seed?: string): ResourceProfile {
    const rng = this.createSeededRNG(seed);
    const index = Math.floor(rng() * RESOURCE_PROFILES.length);
    return RESOURCE_PROFILES[index];
  }
  
  /**
   * Ensure balanced distribution of profiles across multiple countries
   * (no duplicate profiles in small games)
   */
  static assignProfilesForGame(countryCount: number, gameSeed?: string): ResourceProfile[] {
    const profiles: ResourceProfile[] = [];
    const availableProfiles = [...RESOURCE_PROFILES];
    const rng = this.createSeededRNG(gameSeed);
    
    for (let i = 0; i < countryCount; i++) {
      if (availableProfiles.length === 0) {
        // Exhausted unique profiles, shuffle and reuse
        availableProfiles.push(...RESOURCE_PROFILES);
      }
      
      const index = Math.floor(rng() * availableProfiles.length);
      const profile = availableProfiles.splice(index, 1)[0];
      profiles.push(profile);
    }
    
    return profiles;
  }
  
  /**
   * Apply resource profile modifiers to base production
   */
  static applyProfileToProduction(
    baseProduction: Record<string, number>,
    profile: ResourceProfile
  ): Record<string, number> {
    const modified = { ...baseProduction };
    
    for (const modifier of profile.modifiers) {
      if (modified[modifier.resourceId] !== undefined) {
        modified[modifier.resourceId] = Math.floor(
          modified[modifier.resourceId] * modifier.multiplier
        );
      }
    }
    
    return modified;
  }
  
  /**
   * Apply resource profile to starting resources
   */
  static applyProfileToStartingResources(
    baseResources: Record<string, number>,
    profile: ResourceProfile
  ): Record<string, number> {
    const modified = { ...baseResources };
    
    for (const modifier of profile.modifiers) {
      const current = modified[modifier.resourceId] || 0;
      const adjusted = current + modifier.startingBonus;
      modified[modifier.resourceId] = Math.max(0, adjusted); // Don't go negative
    }
    
    return modified;
  }
  
  /**
   * Calculate total production value to verify balance
   */
  static calculateProductionValue(
    production: Record<string, number>,
    resourceValues: Record<string, number>
  ): number {
    let total = 0;
    for (const [resourceId, amount] of Object.entries(production)) {
      const value = resourceValues[resourceId] || 1;
      total += amount * value;
    }
    return total;
  }
  
  /**
   * Verify that profile maintains balance (total value within tolerance)
   */
  static validateProfileBalance(
    profile: ResourceProfile,
    baseProduction: Record<string, number>,
    resourceValues: Record<string, number>,
    tolerance: number = 0.15 // 15% tolerance
  ): { balanced: boolean; ratio: number } {
    const baseValue = this.calculateProductionValue(baseProduction, resourceValues);
    const modifiedProduction = this.applyProfileToProduction(baseProduction, profile);
    const modifiedValue = this.calculateProductionValue(modifiedProduction, resourceValues);
    
    const ratio = modifiedValue / baseValue;
    const balanced = ratio >= (1 - tolerance) && ratio <= (1 + tolerance);
    
    return { balanced, ratio };
  }
  
  private static createSeededRNG(seed?: string): () => number {
    if (!seed) {
      return Math.random;
    }
    
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
}
