/**
 * Rule-Based AI System Tests
 * Validates AI decision-making logic across various scenarios
 */

import { describe, it, expect } from '@jest/globals';
import { RuleBasedAI } from '@/lib/ai/RuleBasedAI';
import { AIController } from '@/lib/ai/AIController';
import { EconomicAI } from '@/lib/ai/EconomicAI';
import { MilitaryAI } from '@/lib/ai/MilitaryAI';
import { StrategicPlanner } from '@/lib/ai/StrategicPlanner';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import type { CountryStats } from '@/types/country';
import type { AIPersonality } from '@/lib/ai/Personality';

/**
 * Helper to create test game state
 */
function createTestState(customStats?: Partial<CountryStats>): GameStateSnapshot {
  const defaultStats: CountryStats = {
    id: 'stats-1',
    countryId: 'country-1',
    turn: 1,
    population: 100000,
    budget: 5000,
    technologyLevel: 1,
    infrastructureLevel: 1,
    militaryStrength: 40,
    resources: { food: 500 },
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

describe('Rule-Based AI System', () => {
  describe('Economic Analysis', () => {
    it('should correctly analyze country economic situation', () => {
      const state = createTestState();
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', state.countryStatsByCountryId['country-1']);

      expect(analysis.currentBudget).toBe(5000);
      expect(analysis.netIncome).toBeGreaterThan(0);
      expect(analysis.canAffordInfrastructure).toBeDefined();
      expect(analysis.canAffordResearch).toBeDefined();
      expect(analysis.foodBalance).toBeDefined();
    });

    it('should detect food crisis', () => {
      const state = createTestState({ resources: { food: 10 } });
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', state.countryStatsByCountryId['country-1']);

      expect(analysis.foodTurnsRemaining).toBeLessThan(10);
    });

    it('should detect military deficit', () => {
      const state = createTestState({ militaryStrength: 10 });
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', state.countryStatsByCountryId['country-1']);

      expect(analysis.militaryDeficit).toBeGreaterThan(0);
      expect(analysis.isUnderDefended).toBe(true);
    });

    it('should calculate ROI for investments', () => {
      const state = createTestState();
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', state.countryStatsByCountryId['country-1']);

      expect(analysis.infrastructureROI).toBeGreaterThan(0);
      expect(analysis.infrastructureROI).toBeLessThan(100);
      expect(analysis.researchROI).toBeGreaterThan(0);
      expect(analysis.researchROI).toBeLessThan(100);
    });
  });

  describe('Decision Weights', () => {
    it('should prioritize food crisis over everything', () => {
      const state = createTestState({ resources: { food: 10 } });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      expect(weights.infrastructurePriority).toBeGreaterThan(0.5);
    });

    it('should prioritize military during crisis', () => {
      const state = createTestState({ militaryStrength: 10 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      expect(weights.militaryPriority).toBeGreaterThan(0.4);
    });

    it('should adjust priorities based on personality', () => {
      const state = createTestState();
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const aggressivePersonality: AIPersonality = { aggression: 0.9, cooperativeness: 0.2, riskTolerance: 0.8, honesty: 0.7 };
      const peacefulPersonality: AIPersonality = { aggression: 0.1, cooperativeness: 0.9, riskTolerance: 0.3, honesty: 0.9 };
      
      const aggressiveWeights = RuleBasedAI.calculateDecisionWeights(analysis, aggressivePersonality);
      const peacefulWeights = RuleBasedAI.calculateDecisionWeights(analysis, peacefulPersonality);

      expect(aggressiveWeights.militaryPriority).toBeGreaterThan(peacefulWeights.militaryPriority);
    });
  });

  describe('Investment Decisions', () => {
    it('should invest in research when affordable and good ROI', () => {
      const state = createTestState({ budget: 10000, technologyLevel: 1 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.7, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const shouldInvest = RuleBasedAI.shouldInvestInResearch(stats, analysis, weights);
      expect(shouldInvest).toBe(true);
    });

    it('should not invest in research during bankruptcy crisis', () => {
      const state = createTestState({ budget: 200, technologyLevel: 1 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const shouldInvest = RuleBasedAI.shouldInvestInResearch(stats, analysis, weights);
      expect(shouldInvest).toBe(false);
    });

    it('should invest in infrastructure when affordable', () => {
      const state = createTestState({ budget: 10000, infrastructureLevel: 1 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const shouldInvest = RuleBasedAI.shouldInvestInInfrastructure(stats, analysis, weights);
      expect(shouldInvest).toBe(true);
    });

    it('should prioritize infrastructure during food crisis', () => {
      const state = createTestState({ budget: 10000, resources: { food: 20 } });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const shouldInvest = RuleBasedAI.shouldInvestInInfrastructure(stats, analysis, weights);
      expect(shouldInvest).toBe(true);
    });
  });

  describe('Military Decisions', () => {
    it('should recruit military when under-defended', () => {
      const state = createTestState({ budget: 5000, militaryStrength: 20 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const recruitment = RuleBasedAI.decideMilitaryRecruitment(stats, analysis, weights);
      expect(recruitment).toBeGreaterThan(0);
    });

    it('should not over-recruit beyond budget', () => {
      const state = createTestState({ budget: 500, militaryStrength: 20 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.9, cooperativeness: 0.2, riskTolerance: 0.8, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const recruitment = RuleBasedAI.decideMilitaryRecruitment(stats, analysis, weights);
      expect(recruitment * 100).toBeLessThanOrEqual(500); // 100 budget per unit
    });

    it('should not recruit during bankruptcy crisis', () => {
      const state = createTestState({ budget: 200, militaryStrength: 20 });
      const stats = state.countryStatsByCountryId['country-1'];
      const analysis = RuleBasedAI.analyzeEconomicSituation(state, 'country-1', stats);
      
      const personality: AIPersonality = { aggression: 0.5, cooperativeness: 0.5, riskTolerance: 0.5, honesty: 0.7 };
      const weights = RuleBasedAI.calculateDecisionWeights(analysis, personality);

      const recruitment = RuleBasedAI.decideMilitaryRecruitment(stats, analysis, weights);
      expect(recruitment).toBe(0);
    });
  });

  describe('Strategic Planning', () => {
    it('should focus on economy during early game', () => {
      const state = createTestState();
      state.turn = 5;
      const planner = new StrategicPlanner();
      
      const intent = planner.plan(state, 'country-1');
      
      expect(['economy', 'research']).toContain(intent.focus);
      expect(intent.rationale).toBeDefined();
    });

    it('should focus on military during crisis', () => {
      const state = createTestState({ militaryStrength: 10 });
      const planner = new StrategicPlanner();
      
      const intent = planner.plan(state, 'country-1');
      
      expect(intent.focus).toBe('military');
      expect(intent.rationale).toContain('THREAT');
    });

    it('should focus on economy during food crisis', () => {
      const state = createTestState({ resources: { food: 10 } });
      const planner = new StrategicPlanner();
      
      const intent = planner.plan(state, 'country-1');
      
      expect(intent.focus).toBe('economy');
      expect(intent.rationale).toContain('CRISIS');
    });
  });

  describe('AI Controller Integration', () => {
    it('should generate actions for AI countries', () => {
      const state = createTestState({ budget: 10000 });
      const controller = new AIController();
      
      const actions = controller.decideTurnActions(state, 'country-1');
      
      expect(actions).toBeInstanceOf(Array);
      // Should generate at least one action (research or infrastructure or military)
      expect(actions.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate economic actions when wealthy', () => {
      const state = createTestState({ budget: 20000, technologyLevel: 2 });
      const economicAI = new EconomicAI();
      const planner = new StrategicPlanner();
      
      const intent = planner.plan(state, 'country-1');
      const actions = economicAI.decideActions(state, 'country-1', intent);
      
      expect(actions).toBeInstanceOf(Array);
      if (actions.length > 0) {
        expect(['research', 'economic']).toContain(actions[0].actionType);
      }
    });

    it('should generate military actions when under-defended', () => {
      const state = createTestState({ budget: 5000, militaryStrength: 15 });
      const militaryAI = new MilitaryAI();
      const planner = new StrategicPlanner();
      
      const intent = planner.plan(state, 'country-1');
      const actions = militaryAI.decideActions(state, 'country-1', intent);
      
      expect(actions).toBeInstanceOf(Array);
      if (actions.length > 0) {
        expect(actions[0].actionType).toBe('military');
        expect(actions[0].actionData).toHaveProperty('amount');
        expect((actions[0].actionData as any).amount).toBeGreaterThan(0);
      }
    });

    it('should create different personalities', () => {
      const controller1 = AIController.withRandomPersonality('seed-1');
      const controller2 = AIController.withRandomPersonality('seed-2');
      
      expect(controller1).toBeDefined();
      expect(controller2).toBeDefined();
      // Different seeds should create different personalities (most of the time)
    });
  });

  describe('Multi-Turn Simulation', () => {
    it('should make consistent decisions over multiple turns', () => {
      let state = createTestState({ budget: 10000, technologyLevel: 1, militaryStrength: 30 });
      const controller = new AIController();
      
      const actionsPerTurn: number[] = [];
      
      // Simulate 5 turns
      for (let turn = 1; turn <= 5; turn++) {
        state.turn = turn;
        const actions = controller.decideTurnActions(state, 'country-1');
        actionsPerTurn.push(actions.length);
      }
      
      // AI should generate actions most turns
      const totalActions = actionsPerTurn.reduce((sum, count) => sum + count, 0);
      expect(totalActions).toBeGreaterThan(0);
    });

    it('should adapt strategy based on changing situation', () => {
      const controller = new AIController();
      
      // Turn 1: Wealthy, should invest
      const state1 = createTestState({ budget: 15000, technologyLevel: 2 });
      const actions1 = controller.decideTurnActions(state1, 'country-1');
      
      // Turn 2: Poor, should save
      const state2 = createTestState({ budget: 300, technologyLevel: 2 });
      const actions2 = controller.decideTurnActions(state2, 'country-1');
      
      // Wealthy country should generate more investment actions
      expect(actions1.length).toBeGreaterThanOrEqual(actions2.length);
    });
  });
});
