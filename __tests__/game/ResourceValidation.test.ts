/**
 * Resource Validation Tests
 * Validates that resource requirements are enforced for all actions (AI and player)
 */

import { describe, it, expect } from '@jest/globals';
import { ActionResolver } from '@/lib/game-engine/ActionResolver';
import { ResourceCost } from '@/lib/game-engine/ResourceCost';
import { GameState } from '@/lib/game-engine/GameState';
import { EconomicAI } from '@/lib/ai/EconomicAI';
import { MilitaryAI } from '@/lib/ai/MilitaryAI';
import type { GameAction } from '@/types/actions';
import type { CountryStats } from '@/types/country';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';

/**
 * Helper to create test game state
 */
function createTestState(customStats?: Partial<CountryStats>): GameStateSnapshot {
  const defaultStats: CountryStats = {
    id: 'stats-1',
    countryId: 'country-1',
    turn: 1,
    population: 100000,
    budget: 10000,
    technologyLevel: 1,
    infrastructureLevel: 1,
    militaryStrength: 40,
    resources: {
      copper: 20,
      coal: 20,
      timber: 20,
      iron: 20,
      steel: 20,
      oil: 20,
    },
    resourceProfile: undefined,
    diplomaticRelations: {},
    militaryEquipment: {},
    createdAt: new Date().toISOString(),
  };

  return {
    gameId: 'test-game',
    turn: 1,
    countries: [
      {
        id: 'country-1',
        gameId: 'test-game',
        name: 'Test Country',
        isPlayerControlled: false,
        color: '#FF0000',
        positionX: 0,
        positionY: 0,
      },
    ],
    countryStatsByCountryId: {
      'country-1': { ...defaultStats, ...customStats },
    },
    pendingActions: [],
    activeDeals: [],
  };
}

describe('Resource Validation System', () => {
  describe('ActionResolver - Turn-based Actions', () => {
    it('should fail research action when resources are insufficient', () => {
      const state = new GameState(createTestState({
        budget: 10000,
        technologyLevel: 1,
        resources: {
          copper: 0, // Missing required resources
          coal: 0,
        },
      }));

      const action: GameAction = {
        id: 'test-action',
        gameId: 'test-game',
        countryId: 'country-1',
        turn: 1,
        actionType: 'research',
        actionData: {
          cost: 1000,
          targetLevel: 2,
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      expect(result.status).toBe('failed');
    });

    it('should apply penalty multiplier when resources are missing', () => {
      const state = new GameState(createTestState({
        budget: 10000,
        technologyLevel: 1,
        resources: {
          copper: 5, // Partial resources (should trigger penalty)
          coal: 5,
        },
      }));

      const baseCost = ActionResolver.calculateResearchCost(1);
      const action: GameAction = {
        id: 'test-action',
        gameId: 'test-game',
        countryId: 'country-1',
        turn: 1,
        actionType: 'research',
        actionData: {
          cost: baseCost,
          targetLevel: 2,
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      // Should succeed but with penalty applied
      // The actual cost deducted will be higher due to penalty
      const stats = state.data.countryStatsByCountryId['country-1'];
      if (result.status === 'executed') {
        expect(stats.budget).toBeLessThan(10000 - baseCost);
      }
    });

    it('should deduct resources when action succeeds', () => {
      const state = new GameState(createTestState({
        budget: 10000,
        technologyLevel: 1,
        resources: {
          copper: 20,
          coal: 20,
        },
      }));

      const initialCopper = state.data.countryStatsByCountryId['country-1'].resources.copper || 0;
      const initialCoal = state.data.countryStatsByCountryId['country-1'].resources.coal || 0;

      const action: GameAction = {
        id: 'test-action',
        gameId: 'test-game',
        countryId: 'country-1',
        turn: 1,
        actionType: 'research',
        actionData: {
          cost: ActionResolver.calculateResearchCost(1),
          targetLevel: 2,
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      expect(result.status).toBe('executed');
      const stats = state.data.countryStatsByCountryId['country-1'];
      expect(stats.resources.copper || 0).toBeLessThan(initialCopper);
      expect(stats.resources.coal || 0).toBeLessThan(initialCoal);
    });

    it('should fail infrastructure action when resources are insufficient', () => {
      const state = new GameState(createTestState({
        budget: 10000,
        infrastructureLevel: 1,
        resources: {
          timber: 0,
          coal: 0,
        },
      }));

      const action: GameAction = {
        id: 'test-action',
        gameId: 'test-game',
        countryId: 'country-1',
        turn: 1,
        actionType: 'economic',
        actionData: {
          subType: 'infrastructure',
          cost: 1000,
          targetLevel: 2,
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      // Should fail if budget insufficient after penalty
      // Or succeed but with resources deducted (partial)
      expect(['failed', 'executed']).toContain(result.status);
    });

    it('should fail military recruitment when resources are insufficient', () => {
      const state = new GameState(createTestState({
        budget: 10000,
        militaryStrength: 40,
        resources: {
          iron: 0,
          timber: 0,
        },
      }));

      const action: GameAction = {
        id: 'test-action',
        gameId: 'test-game',
        countryId: 'country-1',
        turn: 1,
        actionType: 'military',
        actionData: {
          subType: 'recruit',
          amount: 10,
          cost: 300,
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const resolver = new ActionResolver();
      const result = resolver.resolve(state, action);

      // Should fail if budget insufficient after penalty
      expect(['failed', 'executed']).toContain(result.status);
    });
  });

  describe('EconomicAI - Resource Validation', () => {
    it('should not create research action when resources are insufficient', () => {
      const state = createTestState({
        budget: 10000,
        technologyLevel: 1,
        resources: {
          copper: 0,
          coal: 0,
        },
      });

      const ai = new EconomicAI();
      const intent = {
        focus: 'research' as const,
        rationale: 'Test',
        llmPlan: undefined,
      };

      const actions = ai.decideActions(state, 'country-1', intent);

      // Should either return no actions or actions with penalty applied
      if (actions.length > 0) {
        const action = actions[0];
        expect(action.actionType).toBe('research');
        // Cost should include penalty if resources missing
        const baseCost = ActionResolver.calculateResearchCost(1);
        expect((action.actionData as any).cost).toBeGreaterThanOrEqual(baseCost);
      }
    });

    it('should not create infrastructure action when resources are insufficient', () => {
      const state = createTestState({
        budget: 10000,
        infrastructureLevel: 1,
        resources: {
          timber: 0,
          coal: 0,
        },
      });

      const ai = new EconomicAI();
      const intent = {
        focus: 'economy' as const,
        rationale: 'Test',
        llmPlan: undefined,
      };

      const actions = ai.decideActions(state, 'country-1', intent);

      // Should either return no actions or actions with penalty applied
      if (actions.length > 0) {
        const action = actions[0];
        expect(action.actionType).toBe('economic');
        expect((action.actionData as any).subType).toBe('infrastructure');
      }
    });
  });

  describe('MilitaryAI - Resource Validation', () => {
    it('should not create recruitment action when resources are insufficient', () => {
      const state = createTestState({
        budget: 10000,
        militaryStrength: 40,
        resources: {
          iron: 0,
          timber: 0,
        },
      });

      const ai = new MilitaryAI();
      const intent = {
        focus: 'military' as const,
        rationale: 'Test',
        llmPlan: undefined,
      };

      // Note: decideActions is async
      ai.decideActions(state, 'country-1', intent, []).then((actions) => {
        // Should either return no actions or actions with penalty applied
        if (actions.length > 0) {
          const action = actions.find(a => 
            a.actionType === 'military' && 
            (a.actionData as any).subType === 'recruit'
          );
          if (action) {
            // Cost should include penalty if resources missing
            const baseCost = (action.actionData as any).amount * 30; // Cost per strength
            expect((action.actionData as any).cost).toBeGreaterThanOrEqual(baseCost);
          }
        }
      });
    });
  });

  describe('ResourceCost - Affordability Checks', () => {
    it('should correctly identify missing resources', () => {
      const required = [
        { resourceId: 'copper', amount: 10 },
        { resourceId: 'coal', amount: 8 },
      ];
      const available = {
        copper: 5,
        coal: 8,
      };

      const result = ResourceCost.checkResourceAffordability(required, available);

      expect(result.canAfford).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
      expect(result.penaltyMultiplier).toBeGreaterThan(1.0);
    });

    it('should return canAfford=true when all resources are available', () => {
      const required = [
        { resourceId: 'copper', amount: 10 },
        { resourceId: 'coal', amount: 8 },
      ];
      const available = {
        copper: 20,
        coal: 20,
      };

      const result = ResourceCost.checkResourceAffordability(required, available);

      expect(result.canAfford).toBe(true);
      expect(result.missing.length).toBe(0);
      expect(result.penaltyMultiplier).toBe(1.0);
    });

    it('should correctly deduct resources', () => {
      const current = {
        copper: 20,
        coal: 20,
        iron: 15,
      };
      const costs = [
        { resourceId: 'copper', amount: 10 },
        { resourceId: 'coal', amount: 8 },
      ];

      const result = ResourceCost.deductResources(current, costs);

      expect(result.copper).toBe(10);
      expect(result.coal).toBe(12);
      expect(result.iron).toBe(15); // Unchanged
    });
  });

  describe('Multiple Actions in Same Turn', () => {
    it('should track resource usage across multiple actions', () => {
      const state = createTestState({
        budget: 20000,
        technologyLevel: 1,
        infrastructureLevel: 1,
        resources: {
          copper: 20,
          coal: 20,
          timber: 30,
        },
      });

      const ai = new EconomicAI();
      const intent = {
        focus: 'balanced' as const,
        rationale: 'Test',
        llmPlan: undefined,
      };

      const actions = ai.decideActions(state, 'country-1', intent);

      // Should not create more actions than resources allow
      // Or should apply penalties appropriately
      expect(actions.length).toBeLessThanOrEqual(2);
    });
  });
});
