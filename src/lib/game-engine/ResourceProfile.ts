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
      { resourceId: 'oil', multiplier: 2.5, startingBonus: 150 },
      { resourceId: 'coal', multiplier: 1.5, startingBonus: 80 },
      { resourceId: 'gold', multiplier: 0.4, startingBonus: -10 },
      { resourceId: 'copper', multiplier: 0.7, startingBonus: -5 },
    ]
  },
  
  {
    name: "Agricultural Hub",
    description: "Fertile lands, abundant food and timber",
    modifiers: [
      { resourceId: 'food', multiplier: 2.0, startingBonus: 300 },
      { resourceId: 'timber', multiplier: 1.8, startingBonus: 150 },
      { resourceId: 'iron', multiplier: 0.6, startingBonus: -30 },
      { resourceId: 'steel', multiplier: 0.5, startingBonus: -15 },
    ]
  },
  
  {
    name: "Mining Empire",
    description: "Rich in iron, copper, and steel production",
    modifiers: [
      { resourceId: 'iron', multiplier: 2.2, startingBonus: 120 },
      { resourceId: 'copper', multiplier: 1.8, startingBonus: 80 },
      { resourceId: 'steel', multiplier: 1.5, startingBonus: 60 },
      { resourceId: 'food', multiplier: 0.7, startingBonus: -100 },
      { resourceId: 'timber', multiplier: 0.6, startingBonus: -50 },
    ]
  },
  
  {
    name: "Tech Innovator",
    description: "Advanced industry, rich in copper and steel",
    modifiers: [
      { resourceId: 'copper', multiplier: 1.8, startingBonus: 60 },
      { resourceId: 'steel', multiplier: 1.6, startingBonus: 50 },
      { resourceId: 'coal', multiplier: 1.5, startingBonus: 40 },
      { resourceId: 'timber', multiplier: 0.8, startingBonus: -20 },
      { resourceId: 'oil', multiplier: 0.7, startingBonus: -15 },
    ]
  },
  
  {
    name: "Trade Hub",
    description: "Abundant gold and copper for commerce",
    modifiers: [
      { resourceId: 'gold', multiplier: 2.5, startingBonus: 60 },
      { resourceId: 'copper', multiplier: 2.0, startingBonus: 50 },
      { resourceId: 'food', multiplier: 1.3, startingBonus: 80 },
      { resourceId: 'iron', multiplier: 0.7, startingBonus: -25 },
      { resourceId: 'oil', multiplier: 0.6, startingBonus: -20 },
    ]
  },
  
  {
    name: "Balanced Nation",
    description: "No major resource advantages or disadvantages",
    modifiers: [
      { resourceId: 'food', multiplier: 1.1, startingBonus: 50 },
      { resourceId: 'iron', multiplier: 1.1, startingBonus: 10 },
      { resourceId: 'gold', multiplier: 0.9, startingBonus: -5 },
    ]
  },
  
  {
    name: "Industrial Powerhouse",
    description: "Coal and steel production powerhouse",
    modifiers: [
      { resourceId: 'coal', multiplier: 2.5, startingBonus: 150 },
      { resourceId: 'steel', multiplier: 2.3, startingBonus: 80 },
      { resourceId: 'iron', multiplier: 1.4, startingBonus: 60 },
      { resourceId: 'food', multiplier: 0.8, startingBonus: -80 },
      { resourceId: 'timber', multiplier: 0.7, startingBonus: -40 },
    ]
  },
  
  {
    name: "Military State",
    description: "Strong in iron and oil for military dominance",
    modifiers: [
      { resourceId: 'iron', multiplier: 2.0, startingBonus: 100 },
      { resourceId: 'oil', multiplier: 1.6, startingBonus: 60 },
      { resourceId: 'steel', multiplier: 1.4, startingBonus: 40 },
      { resourceId: 'gold', multiplier: 0.6, startingBonus: -20 },
      { resourceId: 'copper', multiplier: 0.7, startingBonus: -15 },
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
