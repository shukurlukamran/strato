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
    resources: { food: 10, metals: 5, rare_earths: 2 },
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
    it('should accept actions with penalized budget cost when resources are missing', () => {
      // Create a country with insufficient resources for research
      const stats = createTestCountryStats({
        budget: 1000, // Sufficient budget
        resources: { food: 0, metals: 0, rare_earths: 0 } // No resources
      });

      // Calculate research pricing - should include penalty
      const pricingResult = ActionPricing.calculateResearchPricing(stats);

      // Verify penalty is applied
      expect(pricingResult.resourceCostInfo.canAfford).toBe(false);
      expect(pricingResult.resourceCostInfo.penaltyMultiplier).toBeGreaterThan(1);

      // Verify canAffordAction only checks budget (not resources)
      const canAfford = ActionPricing.canAffordAction(pricingResult, stats.budget);
      expect(canAfford).toBe(true); // Should accept despite missing resources
    });

    it('should reject actions when budget is insufficient even with penalty', () => {
      // Create a country with insufficient resources AND insufficient budget
      const stats = createTestCountryStats({
        budget: 10, // Insufficient budget even with penalty
        resources: { food: 0, metals: 0, rare_earths: 0 } // No resources
      });

      const pricingResult = ActionPricing.calculateResearchPricing(stats);

      // Verify penalty is applied but budget is still insufficient
      expect(pricingResult.resourceCostInfo.canAfford).toBe(false);
      expect(pricingResult.resourceCostInfo.penaltyMultiplier).toBeGreaterThan(1);

      const canAfford = ActionPricing.canAffordAction(pricingResult, stats.budget);
      expect(canAfford).toBe(false); // Should reject due to insufficient budget
    });

    it('should accept actions when both budget and resources are sufficient', () => {
      // Create a country with sufficient resources and budget
      const stats = createTestCountryStats({
        budget: 1000, // Sufficient budget
        resources: { food: 50, metals: 50, rare_earths: 20 } // Sufficient resources
      });

      const pricingResult = ActionPricing.calculateResearchPricing(stats);

      // Verify no penalty is applied
      expect(pricingResult.resourceCostInfo.canAfford).toBe(true);
      expect(pricingResult.resourceCostInfo.penaltyMultiplier).toBe(1);

      const canAfford = ActionPricing.canAffordAction(pricingResult, stats.budget);
      expect(canAfford).toBe(true);
    });

    it('AI ActionResolver should use same affordability logic as player actions', () => {
      const state = createTestGameState();

      // Create AI action with insufficient resources but sufficient budget
      const action = createTestAction({
        actionType: 'research',
        actionData: { immediate: false } // AI action
      });

      // Modify state to have insufficient resources but sufficient budget
      const modifiedStats = createTestCountryStats({
        budget: 1000,
        resources: { food: 0, metals: 0, rare_earths: 0 }
      });
      state.withUpdatedStats('test-country-id', modifiedStats);

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      // AI should accept the action (same as player would)
      expect(result.status).toBe('executed');

      // Verify resources were NOT deducted (since canAfford was false)
      const updatedStats = state.data.countryStatsByCountryId['test-country-id'];
      expect(updatedStats.resources.food).toBe(0); // Should remain unchanged
      expect(updatedStats.resources.metals).toBe(0); // Should remain unchanged

      // But budget should be deducted
      expect(updatedStats.budget).toBeLessThan(1000);
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
      // With sufficient resources
      const sufficientStats = createTestCountryStats({
        budget: 1000,
        resources: { food: 50, metals: 50, rare_earths: 20 }
      });

      const pricingResult = ActionPricing.calculateResearchPricing(sufficientStats);
      const updatedStats = ActionPricing.applyActionCost(pricingResult, sufficientStats);

      // Resources should be deducted
      expect(updatedStats.resources.food).toBeLessThan(sufficientStats.resources.food);
      expect(updatedStats.resources.metals).toBeLessThan(sufficientStats.resources.metals);
    });

    it('should NOT deduct resources when canAfford is false', () => {
      // With insufficient resources
      const insufficientStats = createTestCountryStats({
        budget: 1000,
        resources: { food: 0, metals: 0, rare_earths: 0 }
      });

      const pricingResult = ActionPricing.calculateResearchPricing(insufficientStats);
      const updatedStats = ActionPricing.applyActionCost(pricingResult, insufficientStats);

      // Resources should NOT be deducted
      expect(updatedStats.resources.food).toBe(insufficientStats.resources.food);
      expect(updatedStats.resources.metals).toBe(insufficientStats.resources.metals);
      expect(updatedStats.resources.rare_earths).toBe(insufficientStats.resources.rare_earths);

      // But budget should still be deducted (with penalty)
      expect(updatedStats.budget).toBeLessThan(insufficientStats.budget);
    });
  });
});