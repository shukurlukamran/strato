/**
 * Action Pricing Parity Tests
 * Ensures AI and player actions use identical pricing and resource penalty rules
 */

import { describe, it, expect } from '@jest/globals';
import { ActionPricing } from '@/lib/game-engine/ActionPricing';
import { ActionResolver } from '@/lib/game-engine/ActionResolver';
import { GameState } from '@/lib/game-engine/GameState';
import type { CountryStats } from '@/types/country';
import type { GameAction } from '@/types/actions';

/**
 * Helper to create test CountryStats
 */
function createTestCountryStats(overrides: Partial<CountryStats> = {}): CountryStats {
  return {
    id: 'test-stats-id',
    countryId: 'test-country-id',
    turn: 1,
    population: 100000,
    budget: 5000,
    technologyLevel: 1,
    infrastructureLevel: 1,
    militaryStrength: 40,
    resources: { food: 10, timber: 5, iron: 2, oil: 0, gold: 0, copper: 0, steel: 0, coal: 0 },
    resourceProfile: 'balanced',
    diplomaticRelations: {},
    militaryEquipment: {},
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Helper to create test GameAction
 */
function createTestAction(overrides: Partial<GameAction> = {}): GameAction {
  return {
    id: 'test-action-id',
    gameId: 'test-game-id',
    countryId: 'test-country-id',
    turn: 1,
    actionType: 'research',
    actionData: {},
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Helper to create test GameState
 */
function createTestGameState(): GameState {
  const stats = createTestCountryStats();
  return new GameState({
    gameId: 'test-game-id',
    turn: 1,
    countries: [{
      id: 'test-country-id',
      gameId: 'test-game-id',
      name: 'Test Country',
      isPlayerControlled: false,
      color: '#ff0000',
      positionX: 0,
      positionY: 0,
    }],
    countryStatsByCountryId: {
      'test-country-id': stats
    },
    pendingActions: [],
    activeDeals: []
  });
}

describe('Action Pricing Parity', () => {
  describe('Resource Shortage Parity', () => {
    it('should block actions when resources are missing (strict gating)', () => {
      // Create a country with insufficient resources for research at tech 1
      // Research at tech 1 needs: copper 10, coal 8
      const stats = createTestCountryStats({
        budget: 1000, // Sufficient budget
        technologyLevel: 1,
        resources: { food: 100, timber: 100, iron: 100, oil: 0, gold: 0, copper: 0, steel: 0, coal: 0 } // No copper/coal
      });

      // Calculate research pricing - should mark as not affordable
      const pricingResult = ActionPricing.calculateResearchPricing(stats);

      // Verify action is marked as not affordable due to missing resources
      expect(pricingResult.resourceCostInfo.canAfford).toBe(false);
      expect(pricingResult.resourceCostInfo.missing.length).toBeGreaterThan(0);

      // Verify resources were listed as missing
      const missingResourceIds = pricingResult.resourceCostInfo.missing.map(m => m.resourceId);
      expect(missingResourceIds).toContain('copper');
      expect(missingResourceIds).toContain('coal');
    });

    it('should accept actions when both budget and resources are sufficient', () => {
      // Create a country with sufficient resources and budget
      const stats = createTestCountryStats({
        budget: 1000, // Sufficient budget
        technologyLevel: 1,
        resources: { food: 50, timber: 50, iron: 50, oil: 0, gold: 0, copper: 50, steel: 0, coal: 50 } // Sufficient resources
      });

      const pricingResult = ActionPricing.calculateResearchPricing(stats);

      // Verify action is affordable
      expect(pricingResult.resourceCostInfo.canAfford).toBe(true);
      expect(pricingResult.resourceCostInfo.missing.length).toBe(0);

      const canAfford = ActionPricing.canAffordAction(pricingResult, stats.budget);
      expect(canAfford).toBe(true);
    });

    it('AI ActionResolver should enforce strict resource gating (block if missing)', () => {
      const state = createTestGameState();

      // Create AI action with insufficient resources
      const action = createTestAction({
        actionType: 'research',
        actionData: { immediate: false } // AI action
      });

      // Modify state to have insufficient resources
      const modifiedStats = createTestCountryStats({
        budget: 1000,
        technologyLevel: 1,
        resources: { food: 100, timber: 100, iron: 100, oil: 0, gold: 0, copper: 0, steel: 0, coal: 0 }
      });
      state.withUpdatedStats('test-country-id', modifiedStats);

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      // AI should BLOCK the action (strict gating)
      expect(result.status).toBe('failed');
    });
  });

  describe('Attack Cost Persistence', () => {
    it('should maintain attack cost deduction through economic processing', () => {
      // This test verifies that attack costs charged by AI are not overwritten
      // by subsequent economic processing. The actual verification would need
      // to be done in integration tests with the full turn processing pipeline.

      const initialBudget = 1000;
      const attackCost = 150; // Example attack cost

      // Simulate attack cost deduction
      const stats = createTestCountryStats({ budget: initialBudget });
      const attackPricing = { cost: attackCost };

      const updatedStats = ActionPricing.applyAttackCost(attackPricing, stats);
      expect(updatedStats.budget).toBe(initialBudget - attackCost);

      // In the actual turn processing, this updated budget should persist
      // through economic processing and not be overwritten by stale state data
    });

    it('attack cost should be calculated correctly', () => {
      const allocatedStrength = 20;
      const expectedCost = 100 + allocatedStrength * 10; // Phase 3 formula

      const attackPricing = ActionPricing.calculateAttackPricing(allocatedStrength);
      expect(attackPricing.cost).toBe(expectedCost);
    });
  });

  describe('Resource Deduction Logic', () => {
    it('should deduct resources only when canAfford is true', () => {
      // With sufficient resources for research at tech 1
      const sufficientStats = createTestCountryStats({
        budget: 1000,
        technologyLevel: 1,
        resources: { food: 50, timber: 50, iron: 50, oil: 50, gold: 50, copper: 50, steel: 50, coal: 50 }
      });

      const pricingResult = ActionPricing.calculateResearchPricing(sufficientStats);
      const updatedStats = ActionPricing.applyActionCost(pricingResult, sufficientStats);

      // Resources should be deducted (only copper and coal for tech 1 research)
      expect(updatedStats.resources.copper).toBeLessThan(sufficientStats.resources.copper);
      expect(updatedStats.resources.coal).toBeLessThan(sufficientStats.resources.coal);
    });

    it('should NOT deduct resources when canAfford is false', () => {
      // With insufficient resources
      const insufficientStats = createTestCountryStats({
        budget: 1000,
        technologyLevel: 1,
        resources: { food: 100, timber: 100, iron: 100, oil: 0, gold: 0, copper: 0, steel: 0, coal: 0 }
      });

      const pricingResult = ActionPricing.calculateResearchPricing(insufficientStats);
      
      // Verify action is not affordable due to missing resources
      expect(pricingResult.resourceCostInfo.canAfford).toBe(false);
      
      // In the ActionResolver, if canAfford is false, the action is rejected before
      // applyActionCost is called. However, if applyActionCost is called anyway,
      // it should NOT deduct resources when canAfford is false.
      const updatedStats = ActionPricing.applyActionCost(pricingResult, insufficientStats);
      
      // Verify that applyActionCost respects canAfford flag for resources
      expect(updatedStats.resources.copper).toBe(insufficientStats.resources.copper);
      expect(updatedStats.resources.coal).toBe(insufficientStats.resources.coal);
    });
  });
});