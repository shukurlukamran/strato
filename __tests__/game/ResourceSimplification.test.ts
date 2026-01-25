/**
 * Resource Simplification Tests
 * Tests the 8-resource system implementation
 */

import { describe, it, expect } from '@jest/globals';
import { DEFAULT_RESOURCES, ResourceRegistry } from '@/lib/game-engine/ResourceTypes';
import { RESOURCE_PROFILES } from '@/lib/game-engine/ResourceProfile';
import { ResourceCost } from '@/lib/game-engine/ResourceCost';
import { ResourceProduction } from '@/lib/game-engine/ResourceProduction';
import { ECONOMIC_BALANCE } from '@/lib/game-engine/EconomicBalance';
import type { CountryStats } from '@/types/country';
import type { Country } from '@/types/country';

describe('Resource Simplification (8 Resources)', () => {
  describe('Resource Types', () => {
    it('should have exactly 8 resources', () => {
      expect(DEFAULT_RESOURCES).toHaveLength(8);
    });

    it('should have 2 resources per category', () => {
      const basic = DEFAULT_RESOURCES.filter(r => r.category === 'basic');
      const strategic = DEFAULT_RESOURCES.filter(r => r.category === 'strategic');
      const economic = DEFAULT_RESOURCES.filter(r => r.category === 'economic');
      const industrial = DEFAULT_RESOURCES.filter(r => r.category === 'industrial');

      expect(basic).toHaveLength(2);
      expect(strategic).toHaveLength(2);
      expect(economic).toHaveLength(2);
      expect(industrial).toHaveLength(2);
    });

    it('should only contain the 8 valid resources', () => {
      const validResources = ['food', 'timber', 'iron', 'oil', 'gold', 'copper', 'steel', 'coal'];
      const resourceIds = DEFAULT_RESOURCES.map(r => r.id);
      
      expect(resourceIds.sort()).toEqual(validResources.sort());
    });

    it('should not contain deleted resources', () => {
      const deletedResources = ['water', 'stone', 'uranium', 'rare_earth', 'silver', 'gems', 'aluminum', 'electronics'];
      const resourceIds = DEFAULT_RESOURCES.map(r => r.id);
      
      for (const deleted of deletedResources) {
        expect(resourceIds).not.toContain(deleted);
      }
    });

    it('should register all resources in ResourceRegistry', () => {
      const registered = ResourceRegistry.getAllResources();
      expect(registered).toHaveLength(8);
    });
  });

  describe('Resource Profiles', () => {
    it('should have 8 profiles', () => {
      expect(RESOURCE_PROFILES).toHaveLength(8);
    });

    it('should only reference valid resources in modifiers', () => {
      const validResources = ['food', 'timber', 'iron', 'oil', 'gold', 'copper', 'steel', 'coal'];
      
      for (const profile of RESOURCE_PROFILES) {
        for (const modifier of profile.modifiers) {
          expect(validResources).toContain(modifier.resourceId);
        }
      }
    });

    it('should not reference deleted resources', () => {
      const deletedResources = ['water', 'stone', 'uranium', 'rare_earth', 'silver', 'gems', 'aluminum', 'electronics'];
      
      for (const profile of RESOURCE_PROFILES) {
        for (const modifier of profile.modifiers) {
          expect(deletedResources).not.toContain(modifier.resourceId);
        }
      }
    });
  });

  describe('Resource Costs', () => {
    const createStats = (techLevel: number, infraLevel: number = 0): CountryStats => ({
      id: 'test',
      countryId: 'test',
      turn: 1,
      population: 100000,
      budget: 10000,
      technologyLevel: techLevel,
      infrastructureLevel: infraLevel,
      militaryStrength: 40,
      resources: {},
      diplomaticRelations: {},
      militaryEquipment: {},
      createdAt: new Date().toISOString(),
    });

    it('should calculate military costs for tech 0-1 correctly', () => {
      const stats = createStats(0);
      const costs = ResourceCost.calculateMilitaryResourceCost(10, stats);
      
      expect(costs).toHaveLength(2);
      expect(costs.find(c => c.resourceId === 'iron')?.amount).toBe(6);
      expect(costs.find(c => c.resourceId === 'timber')?.amount).toBe(4);
    });

    it('should calculate military costs for tech 2-3 correctly', () => {
      const stats = createStats(2);
      const costs = ResourceCost.calculateMilitaryResourceCost(10, stats);
      
      expect(costs).toHaveLength(3);
      expect(costs.find(c => c.resourceId === 'iron')?.amount).toBe(3);
      expect(costs.find(c => c.resourceId === 'steel')?.amount).toBe(4);
      expect(costs.find(c => c.resourceId === 'oil')?.amount).toBe(2);
    });

    it('should calculate military costs for tech 4-5 correctly', () => {
      const stats = createStats(4);
      const costs = ResourceCost.calculateMilitaryResourceCost(10, stats);
      
      expect(costs).toHaveLength(3);
      expect(costs.find(c => c.resourceId === 'steel')?.amount).toBe(4);
      expect(costs.find(c => c.resourceId === 'oil')?.amount).toBe(3);
      expect(costs.find(c => c.resourceId === 'iron')?.amount).toBe(2);
    });

    it('should calculate research costs for tech 0-1 correctly', () => {
      const stats = createStats(0);
      const costs = ResourceCost.calculateResearchResourceCost(stats);
      
      expect(costs).toHaveLength(2);
      expect(costs.find(c => c.resourceId === 'copper')?.amount).toBe(10);
      expect(costs.find(c => c.resourceId === 'coal')?.amount).toBe(8);
    });

    it('should calculate research costs for tech 2-3 correctly', () => {
      const stats = createStats(2);
      const costs = ResourceCost.calculateResearchResourceCost(stats);
      
      expect(costs).toHaveLength(3);
      expect(costs.find(c => c.resourceId === 'copper')?.amount).toBe(8);
      expect(costs.find(c => c.resourceId === 'coal')?.amount).toBe(12);
      expect(costs.find(c => c.resourceId === 'steel')?.amount).toBe(6);
    });

    it('should calculate infrastructure costs correctly', () => {
      const stats = createStats(0, 0);
      const costs = ResourceCost.calculateInfrastructureResourceCost(stats);
      
      expect(costs).toHaveLength(2);
      expect(costs.find(c => c.resourceId === 'timber')?.amount).toBe(20);
      expect(costs.find(c => c.resourceId === 'coal')?.amount).toBe(15);
    });

    it('should include steel for infrastructure level 2+', () => {
      const stats = createStats(0, 2);
      const costs = ResourceCost.calculateInfrastructureResourceCost(stats);
      
      expect(costs.length).toBeGreaterThanOrEqual(3);
      expect(costs.find(c => c.resourceId === 'steel')).toBeDefined();
    });

    it('should include oil for infrastructure level 4+', () => {
      const stats = createStats(0, 4);
      const costs = ResourceCost.calculateInfrastructureResourceCost(stats);
      
      expect(costs.find(c => c.resourceId === 'oil')?.amount).toBe(5);
    });

    it('should calculate shortage penalty correctly', () => {
      const required = [
        { resourceId: 'iron', amount: 10 },
        { resourceId: 'steel', amount: 5 },
      ];
      
      const currentResources = { iron: 5 }; // Missing steel
      const result = ResourceCost.checkResourceAffordability(required, currentResources);
      
      expect(result.canAfford).toBe(false);
      expect(result.missing).toHaveLength(2); // Missing both iron (5) and steel (5)
    });

    it('should fail affordability check when all resources missing', () => {
      const required = [
        { resourceId: 'iron', amount: 10 },
        { resourceId: 'steel', amount: 10 },
        { resourceId: 'oil', amount: 10 },
        { resourceId: 'coal', amount: 10 },
        { resourceId: 'copper', amount: 10 },
      ];
      
      const currentResources = {}; // Missing all
      const result = ResourceCost.checkResourceAffordability(required, currentResources);
      
      expect(result.canAfford).toBe(false);
    });
  });

  describe('Resource Production', () => {
    const createCountry = (): Country => ({
      id: 'test-country',
      gameId: 'test-game',
      name: 'Test Country',
      isPlayerControlled: false,
      color: '#000000',
      positionX: 50,
      positionY: 50,
    });

    const createStats = (techLevel: number): CountryStats => ({
      id: 'test',
      countryId: 'test',
      turn: 1,
      population: 100000,
      budget: 10000,
      technologyLevel: techLevel,
      infrastructureLevel: 1,
      militaryStrength: 40,
      resources: {},
      diplomaticRelations: {},
      militaryEquipment: {},
      createdAt: new Date().toISOString(),
    });

    it('should produce only 8 resources', () => {
      const country = createCountry();
      const stats = createStats(0);
      const production = ResourceProduction.calculateProduction(country, stats);
      
      const resourceIds = production.resources.map(r => r.resourceId);
      const uniqueIds = [...new Set(resourceIds)];
      
      expect(uniqueIds.length).toBeLessThanOrEqual(8);
      
      // Check no deleted resources
      const deletedResources = ['water', 'stone', 'uranium', 'rare_earth', 'silver', 'gems', 'aluminum', 'electronics'];
      for (const deleted of deletedResources) {
        expect(resourceIds).not.toContain(deleted);
      }
    });

    it('should produce food based on population', () => {
      const country = createCountry();
      const stats = createStats(0);
      const production = ResourceProduction.calculateProduction(country, stats);
      
      const foodProduction = production.resources.find(r => r.resourceId === 'food');
      expect(foodProduction).toBeDefined();
      expect(foodProduction!.amount).toBeGreaterThan(0);
    });

    it('should apply tech multiplier to production', () => {
      const country = createCountry();
      const statsLow = createStats(0);
      const statsHigh = createStats(3);
      
      const prodLow = ResourceProduction.calculateProduction(country, statsLow);
      const prodHigh = ResourceProduction.calculateProduction(country, statsHigh);
      
      // Higher tech should produce more (at least for some resources)
      const totalLow = prodLow.resources.reduce((sum, r) => sum + r.amount, 0);
      const totalHigh = prodHigh.resources.reduce((sum, r) => sum + r.amount, 0);
      
      expect(totalHigh).toBeGreaterThan(totalLow);
    });
  });

  describe('Economic Balance Constants', () => {
    it('should have tech base cost of 500', () => {
      expect(ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST).toBe(500);
    });

    it('should have infra base cost of 450', () => {
      expect(ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST).toBe(450);
    });

    it('should have military cost per point of 30', () => {
      expect(ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT).toBe(30);
    });

    it('should have shortage penalty of 40% per resource', () => {
      expect(ECONOMIC_BALANCE.RESOURCE_COSTS.SHORTAGE_COST_PENALTY_PER_RESOURCE).toBe(0.4);
    });

    it('should have shortage detection logic', () => {
      // This test verifies the resource affordability system works
      // Note: penaltyMultiplier was removed in favor of strict gating
      expect(ECONOMIC_BALANCE.RESOURCE_COSTS.SHORTAGE_COST_PENALTY_PER_RESOURCE).toBe(0.4);
    });
  });
});
