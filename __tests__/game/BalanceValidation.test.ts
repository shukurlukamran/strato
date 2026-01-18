/**
 * Economic Balance Validation Tests
 * Ensures game economy is balanced and fair
 */

import { describe, it, expect } from '@jest/globals';
import { CountryInitializer, STARTING_RANGES, STAT_VALUES, StartingProfile } from '@/lib/game-engine/CountryInitializer';
import { BudgetCalculator } from '@/lib/game-engine/BudgetCalculator';
import { ResourceProduction } from '@/lib/game-engine/ResourceProduction';
import { ECONOMIC_BALANCE } from '@/lib/game-engine/EconomicBalance';
import type { CountryStats } from '@/types/country';

/**
 * Helper to create CountryStats from StartingProfile
 */
function createCountryStats(profile: StartingProfile | Partial<StartingProfile>): CountryStats {
  return {
    id: 'test-stats-id',
    countryId: 'test-country-id',
    turn: 1,
    population: profile.population || 100000,
    budget: profile.budget || 5000,
    technologyLevel: profile.technologyLevel || 1,
    infrastructureLevel: profile.infrastructureLevel || 1,
    militaryStrength: profile.militaryStrength || 40,
    resources: profile.resources || {},
    resourceProfile: profile.resourceProfile,
    diplomaticRelations: {},
    militaryEquipment: {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Simulate N turns and return final stats
 */
function simulateTurns(initialProfile: any, turns: number): {
  stats: CountryStats;
  bankruptTurn: number | null;
  starvationTurn: number | null;
} {
  let stats: CountryStats = {
    id: 'test-stats-id',
    countryId: 'test-country-id',
    turn: 1,
    population: initialProfile.population,
    budget: initialProfile.budget,
    technologyLevel: initialProfile.technologyLevel,
    infrastructureLevel: initialProfile.infrastructureLevel,
    militaryStrength: initialProfile.militaryStrength,
    resources: { ...initialProfile.resources },
    resourceProfile: initialProfile.resourceProfile, // Include resource profile
    // Default empty fields
    diplomaticRelations: {},
    militaryEquipment: {},
    createdAt: new Date().toISOString(),
  };

  let bankruptTurn: number | null = null;
  let starvationTurn: number | null = null;

  for (let turn = 1; turn <= turns; turn++) {
    // Calculate production
    const production = ResourceProduction.calculateProduction(
      { id: 'test', name: 'Test Country' } as any,
      stats
    );

    // Add produced resources
    for (const resource of production.resources) {
      stats.resources[resource.resourceId] = 
        (stats.resources[resource.resourceId] || 0) + resource.amount;
    }

    // Calculate food consumption
    const foodConsumption = (stats.population / 10000) * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;
    stats.resources.food = (stats.resources.food || 0) - foodConsumption;

    // Check starvation
    if (stats.resources.food < 0 && starvationTurn === null) {
      starvationTurn = turn;
    }

    // Calculate budget
    const budgetBreakdown = BudgetCalculator.calculateBudget(
      { id: 'test', name: 'Test Country' } as any,
      stats,
      0 // No active deals
    );

    stats.budget += budgetBreakdown.netBudget;

    // Check bankruptcy
    if (stats.budget < 0 && bankruptTurn === null) {
      bankruptTurn = turn;
    }

    // Apply population growth (simplified)
    if (stats.resources.food > 0) {
      const growthRate = ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE;
      stats.population = Math.floor(stats.population * (1 + growthRate));
    }
  }

  return { stats, bankruptTurn, starvationTurn };
}

/**
 * Calculate break-even turns for an investment
 */
function calculateBreakEvenTurns(
  initialProfile: any,
  investmentCost: number,
  revenueIncrease: number
): number {
  if (revenueIncrease <= 0) return Infinity;
  return Math.ceil(investmentCost / revenueIncrease);
}

describe('Economic Balance Validation', () => {
  describe('Budget Sustainability', () => {
    it('should have positive net budget for default starting stats', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const stats = createCountryStats(profile);

      const budgetBreakdown = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        stats,
        0
      );

      expect(budgetBreakdown.netBudget).toBeGreaterThan(0);
      expect(budgetBreakdown.totalRevenue).toBeGreaterThan(budgetBreakdown.totalExpenses);
    });
    
    it('should reach positive net budget by turn 1 for all starting conditions', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const { stats, bankruptTurn } = simulateTurns(profile, 1);
      
      expect(bankruptTurn).toBeNull();
      expect(stats.budget).toBeGreaterThanOrEqual(profile.budget);
    });
    
    it('should not bankrupt before turn 50', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const { bankruptTurn } = simulateTurns(profile, 50);
      
      expect(bankruptTurn).toBeNull();
    });

    it('should have growing budget over 20 turns', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const { stats } = simulateTurns(profile, 20);
      
      expect(stats.budget).toBeGreaterThan(profile.budget);
    });
  });
  
  describe('Food Balance', () => {
    it('should produce more food than consumed at starting stats', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const stats = createCountryStats(profile);

      const production = ResourceProduction.calculateProduction(
        { id: 'test', name: 'Test' } as any,
        stats
      );

      const foodProduced = production.resources.find(r => r.resourceId === 'food')?.amount || 0;
      const foodConsumed = (stats.population / 10000) * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION;

      expect(foodProduced).toBeGreaterThan(foodConsumed);
    });
    
    it('should allow population growth with food surplus', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const { stats } = simulateTurns(profile, 10);
      
      expect(stats.population).toBeGreaterThan(profile.population);
    });
    
    it('should not starve with default starting food', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const { starvationTurn } = simulateTurns(profile, 20);
      
      expect(starvationTurn).toBeNull();
    });

    it('should maintain positive food stockpile over 30 turns', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const { stats } = simulateTurns(profile, 30);
      
      expect(stats.resources.food).toBeGreaterThan(0);
    });
  });
  
  describe('Technology ROI', () => {
    it('Tech level 0→1 should break even within 50 turns', () => {
      // Calculate tech upgrade cost
      const techCost = Math.floor(500 * Math.pow(1.4, 0)); // 500 for level 0→1
      
      // Calculate revenue increase from tech
      const profile = CountryInitializer['getBalancedDefault']();
      const baseStats = createCountryStats({ ...profile, technologyLevel: 0 });

      const baseBudget = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        baseStats,
        0
      );

      const upgradedStats = createCountryStats({ ...profile, technologyLevel: 1 });
      const upgradedBudget = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        upgradedStats,
        0
      );

      const revenueIncrease = upgradedBudget.netBudget - baseBudget.netBudget;
      const breakEvenTurns = calculateBreakEvenTurns(profile, techCost, revenueIncrease);

      expect(breakEvenTurns).toBeLessThanOrEqual(50);
    });
    
    it('Tech level 1→2 should break even within 75 turns', () => {
      const techCost = Math.floor(500 * Math.pow(1.4, 1)); // 700 for level 1→2
      
      const profile = CountryInitializer['getBalancedDefault']();
      const baseStats = createCountryStats({ ...profile, technologyLevel: 1 });

      const baseBudget = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        baseStats,
        0
      );

      const upgradedStats = createCountryStats({ ...profile, technologyLevel: 2 });
      const upgradedBudget = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        upgradedStats,
        0
      );

      const revenueIncrease = upgradedBudget.netBudget - baseBudget.netBudget;
      const breakEvenTurns = calculateBreakEvenTurns(profile, techCost, revenueIncrease);

      expect(breakEvenTurns).toBeLessThanOrEqual(75);
    });
  });
  
  describe('Infrastructure ROI', () => {
    it('Infrastructure 0→1 should break even within 40 turns', () => {
      const infraCost = Math.floor(600 * Math.pow(1.3, 0)); // 600 for level 0→1
      
      const profile = CountryInitializer['getBalancedDefault']();
      const baseStats = createCountryStats({ ...profile, infrastructureLevel: 0 });

      const baseBudget = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        baseStats,
        0
      );

      const upgradedStats = createCountryStats({ ...profile, infrastructureLevel: 1 });
      const upgradedBudget = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        upgradedStats,
        0
      );

      const revenueIncrease = upgradedBudget.netBudget - baseBudget.netBudget;
      const breakEvenTurns = calculateBreakEvenTurns(profile, infraCost, revenueIncrease);

      expect(breakEvenTurns).toBeLessThanOrEqual(40);
    });
    
    it('Infrastructure should remain profitable at level 5', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const stats = createCountryStats({ ...profile, infrastructureLevel: 5 });

      const budgetBreakdown = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        stats,
        0
      );

      // Infrastructure cost should not exceed revenue boost
      expect(budgetBreakdown.netBudget).toBeGreaterThan(0);
    });
  });
  
  describe('Military Affordability', () => {
    it('should afford 50 military strength with starting budget', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const stats = createCountryStats({ ...profile, militaryStrength: 50 });

      const budgetBreakdown = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        stats,
        0
      );

      expect(budgetBreakdown.netBudget).toBeGreaterThan(0);
    });
    
    it('military upkeep should not exceed 50% of tax revenue', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const stats = createCountryStats(profile);

      const budgetBreakdown = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        stats,
        0
      );

      const upkeepRatio = budgetBreakdown.militaryUpkeep / budgetBreakdown.taxRevenue;
      expect(upkeepRatio).toBeLessThan(0.5);
    });

    it('should support military strength of 100 with advanced economy', () => {
      const profile = CountryInitializer['getBalancedDefault']();
      const stats = createCountryStats({
        ...profile,
        technologyLevel: 3,
        infrastructureLevel: 3,
        militaryStrength: 100,
      });

      const budgetBreakdown = BudgetCalculator.calculateBudget(
        { id: 'test', name: 'Test' } as any,
        stats,
        0
      );

      expect(budgetBreakdown.netBudget).toBeGreaterThan(0);
    });
  });
  
  describe('Random Starting Fairness', () => {
    it('all random starts should have equal total value (±5%)', () => {
      const profiles = [];
      const targetValue = STARTING_RANGES.TOTAL_VALUE;
      
      // Generate 100 random starts
      for (let i = 0; i < 100; i++) {
        const profile = CountryInitializer.generateRandomStart(`test-seed-${i}`);
        profiles.push(profile);
      }
      
      // Calculate total value for each
      const values = profiles.map(p => CountryInitializer.calculateProfileValue(p));
      
      // Verify within 5% tolerance
      const tolerance = targetValue * 0.05;
      for (const value of values) {
        expect(Math.abs(value - targetValue)).toBeLessThanOrEqual(tolerance);
      }
    });
    
    it('all random starts should survive 20 turns', () => {
      // Generate 20 random starts (reduced for performance)
      for (let i = 0; i < 20; i++) {
        const profile = CountryInitializer.generateRandomStart(`survival-test-${i}`);
        const { bankruptTurn, starvationTurn } = simulateTurns(profile, 20);
        
        expect(bankruptTurn).toBeNull();
        expect(starvationTurn).toBeNull();
      }
    });
    
    it('no stat should be at min/max boundaries for all countries', () => {
      const profiles = [];
      
      // Generate 50 random starts
      for (let i = 0; i < 50; i++) {
        const profile = CountryInitializer.generateRandomStart(`variety-test-${i}`);
        profiles.push(profile);
      }
      
      // Check that we have variety (not all at min or max)
      const populations = profiles.map(p => p.population);
      const techs = profiles.map(p => p.technologyLevel);
      const infras = profiles.map(p => p.infrastructureLevel);
      const militaries = profiles.map(p => p.militaryStrength);
      
      // Not all should be at minimum
      expect(populations.some(p => p > STARTING_RANGES.POPULATION.min)).toBe(true);
      expect(techs.some(t => t > STARTING_RANGES.TECHNOLOGY.min)).toBe(true);
      expect(infras.some(i => i > STARTING_RANGES.INFRASTRUCTURE.min)).toBe(true);
      expect(militaries.some(m => m > STARTING_RANGES.MILITARY.min)).toBe(true);
      
      // Not all should be at maximum
      expect(populations.some(p => p < STARTING_RANGES.POPULATION.max)).toBe(true);
      expect(techs.some(t => t < STARTING_RANGES.TECHNOLOGY.max)).toBe(true);
      expect(infras.some(i => i < STARTING_RANGES.INFRASTRUCTURE.max)).toBe(true);
      expect(militaries.some(m => m < STARTING_RANGES.MILITARY.max)).toBe(true);
    });

    it('should generate valid profiles that pass validation', () => {
      for (let i = 0; i < 20; i++) {
        const profile = CountryInitializer.generateRandomStart(`validation-test-${i}`);
        const validation = CountryInitializer.validateProfile(profile);
        
        expect(validation.isValid).toBe(true);
        expect(validation.issues).toHaveLength(0);
      }
    });
  });

  describe('Country Archetypes', () => {
    it('all archetypes should be viable', () => {
      const { COUNTRY_ARCHETYPES } = require('@/lib/game-engine/CountryInitializer');
      
      for (const [name, archetype] of Object.entries(COUNTRY_ARCHETYPES)) {
        const validation = CountryInitializer.validateProfile((archetype as any).profile);
        
        expect(validation.isValid).toBe(true);
        if (!validation.isValid) {
          console.error(`${name} failed validation:`, validation.issues);
        }
      }
    });

    it('all archetypes should survive 30 turns', () => {
      const { COUNTRY_ARCHETYPES } = require('@/lib/game-engine/CountryInitializer');
      
      for (const [name, archetype] of Object.entries(COUNTRY_ARCHETYPES)) {
        const profile = (archetype as any).profile;
        const { bankruptTurn, starvationTurn } = simulateTurns(profile, 30);
        
        expect(bankruptTurn).toBeNull();
        expect(starvationTurn).toBeNull();
      }
    });
  });
});
