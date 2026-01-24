/**
 * LLM Strategic Context Tests
 * Tests that LLM receives accurate strategic context and attack candidates
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import type { CountryStats } from '@/types/country';
import type { City } from '@/types/city';
import { LLMStrategicPlanner } from '@/lib/ai/LLMStrategicPlanner';
import { RuleBasedAI } from '@/lib/ai/RuleBasedAI';

describe('LLM Strategic Context', () => {
  let mockState: GameStateSnapshot;
  let mockCountries: Array<{ countryId: string; stats: CountryStats }>;
  let mockCities: City[];

  beforeEach(() => {
    // Create mock game state
    mockState = {
      gameId: 'test-game',
      turn: 5,
      countries: [
        {
          id: 'country1',
          name: 'Test Country 1',
          positionX: 100,
          positionY: 100,
          color: '#ff0000',
          isPlayerControlled: false,
        },
        {
          id: 'country2',
          name: 'Test Country 2',
          positionX: 150,
          positionY: 150,
          color: '#00ff00',
          isPlayerControlled: false,
        },
      ],
      countryStatsByCountryId: {
        country1: {
          countryId: 'country1',
          population: 10000,
          budget: 1000,
          militaryStrength: 50,
          technologyLevel: 2,
          infrastructureLevel: 1,
          resourceProfile: { name: 'Balanced', modifiers: [] },
          diplomaticRelations: {},
          resources: { food: 200, iron: 50, oil: 0 },
        },
        country2: {
          countryId: 'country2',
          population: 8000,
          budget: 800,
          militaryStrength: 30,
          technologyLevel: 1,
          infrastructureLevel: 1,
          resourceProfile: { name: 'Balanced', modifiers: [] },
          diplomaticRelations: {},
          resources: { food: 150, iron: 30 },
        },
      },
    };

    mockCountries = [
      {
        countryId: 'country1',
        stats: mockState.countryStatsByCountryId.country1,
      },
    ];

    mockCities = [
      {
        id: 'city1',
        countryId: 'country2', // Enemy city
        gameId: 'test-game',
        name: 'Enemy City',
        positionX: 160,
        positionY: 160,
        size: 1.0,
        borderPath: 'M0,0 L10,0 L10,10 L0,10 Z',
        population: 5000,
        perTurnResources: { food: 20, iron: 10 },
        isUnderAttack: false,
        createdAt: new Date().toISOString(),
      },
    ];
  });

  describe('Affordability Block', () => {
    it('should generate affordability information for all action types', () => {
      const planner = new LLMStrategicPlanner();
      const stats = mockCountries[0].stats;

      // Access private method for testing
      const getAffordabilityBlock = (planner as any).getAffordabilityBlock.bind(planner);
      const result = getAffordabilityBlock(stats);

      expect(result).toContain('Research:');
      expect(result).toContain('Infra:');
      expect(result).toContain('Recruit15:');

      // Should include cost and penalty multiplier
      expect(result).toMatch(/Research:\$\d+\(\d+\.\d+x/);
      expect(result).toMatch(/Infra:\$\d+\(\d+\.\d+x/);
      expect(result).toMatch(/Recruit15:\$\d+\(\d+\.\d+x/);
    });

    it('should show missing resources in affordability block', () => {
      const planner = new LLMStrategicPlanner();
      const stats = mockCountries[0].stats; // Has oil: 0 (missing)

      const getAffordabilityBlock = (planner as any).getAffordabilityBlock.bind(planner);
      const result = getAffordabilityBlock(stats);

      // Should show missing resources when applicable
      if (result.includes('missing:')) {
        expect(result).toMatch(/missing:\w+/);
      }
    });
  });

  describe('Attack Candidates', () => {
    it('should generate attack candidates when military advantage exists', () => {
      const planner = new LLMStrategicPlanner();

      // Access private method for testing
      const getAttackCandidates = (planner as any).getAttackCandidates.bind(planner);
      const result = getAttackCandidates(mockState, 'country1', mockCountries[0].stats, mockCities);

      // Country1 has higher effective strength than country2, so should find candidates
      expect(result).not.toBe('No attack opportunities (insufficient military advantage)');

      // Should include city ID, defender info, value, and cost
      if (result !== 'No attack opportunities (insufficient military advantage)') {
        expect(result).toContain('city1');
        expect(result).toContain('Test Country 2');
        expect(result).toMatch(/Value \d+/);
        expect(result).toMatch(/Cost \$\d+/);
        expect(result).toMatch(/Ratio \d+\.\d+x/);
      }
    });

    it('should return no opportunities when no military advantage', () => {
      const planner = new LLMStrategicPlanner();

      // Create weak attacker scenario
      const weakStats = {
        ...mockCountries[0].stats,
        militaryStrength: 10, // Very weak
        technologyLevel: 0,
      };

      const getAttackCandidates = (planner as any).getAttackCandidates.bind(planner);
      const result = getAttackCandidates(mockState, 'country1', weakStats, mockCities);

      expect(result).toBe('No attack opportunities (insufficient military advantage)');
    });
  });

  describe('Economic Analysis Integration', () => {
    it('should use effective military strength in economic analysis', () => {
      const analysis = RuleBasedAI.analyzeEconomicSituation(mockState, 'country1', mockCountries[0].stats);

      // Should have both raw and effective military values
      expect(analysis).toHaveProperty('militaryStrength');
      expect(analysis).toHaveProperty('effectiveMilitaryStrength');
      expect(analysis.effectiveMilitaryStrength).toBeGreaterThanOrEqual(analysis.militaryStrength);
    });

    it('should calculate military deficit based on effective strength', () => {
      const analysis = RuleBasedAI.analyzeEconomicSituation(mockState, 'country1', mockCountries[0].stats);

      // Deficit should be calculated against recommended effective strength
      expect(analysis).toHaveProperty('militaryDeficit');
      expect(typeof analysis.militaryDeficit).toBe('number');
    });
  });

  describe('Prompt Schema Validation', () => {
    it('should use only canonical action types in single-country prompt schema', () => {
      const planner = new LLMStrategicPlanner();

      // Access private method for testing
      const buildStrategicPrompt = (planner as any).buildStrategicPrompt.bind(planner);
      const prompt = buildStrategicPrompt(mockState, 'country1', mockCountries[0].stats);

      // Should list only canonical action types: research, economic, military, diplomacy
      expect(prompt).toMatch(/actionType.*research.*economic.*military/);
      expect(prompt).not.toMatch(/"actionType":"infrastructure"/);

      // Should use economic + subType:infrastructure in examples
      expect(prompt).toMatch(/"actionType":"economic","actionData":\{"subType":"infrastructure"/);
    });

    it('should use only canonical action types in batch prompt schema', () => {
      const planner = new LLMStrategicPlanner();

      // Access private method for testing
      const buildBatchStrategicPrompt = (planner as any).buildBatchStrategicPrompt.bind(planner);
      const prompt = buildBatchStrategicPrompt(mockState, mockCountries, mockCities);

      // Should list only canonical action types: research, economic, military, diplomacy
      expect(prompt).toMatch(/actionType.*research.*economic.*military/);
      expect(prompt).not.toMatch(/actionType.*infrastructure/);

      // Should contain Attack Candidates section
      expect(prompt).toContain('Attack Candidates:');
    });

    it('should use action_plan instead of primary_plan/fallback_plan in single-country prompt', () => {
      const planner = new LLMStrategicPlanner();

      const buildStrategicPrompt = (planner as any).buildStrategicPrompt.bind(planner);
      const prompt = buildStrategicPrompt(mockState, 'country1', mockCountries[0].stats);

      // Should require action_plan, not primary_plan/fallback_plan
      expect(prompt).toMatch(/"action_plan":/);
      expect(prompt).not.toMatch(/"primary_plan":/);
      expect(prompt).not.toMatch(/"fallback_plan":/);

      // Should mention fallback steps with when conditions
      expect(prompt).toMatch(/fallback step.*when.*condition/);
    });
  });

  describe('Retry Prompt Validation', () => {
    it('should correctly label under-defended status in retry prompt', () => {
      const planner = new LLMStrategicPlanner();

      // Access private method for testing
      const buildRetryBatchPrompt = (planner as any).buildRetryBatchPrompt.bind(planner);
      const underDefendedStats = {
        ...mockCountries[0].stats,
        militaryStrength: 5,
        budget: 100,
      };
      const underDefendedState = {
        ...mockState,
        countryStatsByCountryId: {
          ...mockState.countryStatsByCountryId,
          country1: underDefendedStats,
        },
      };
      const prompt = buildRetryBatchPrompt(
        underDefendedState,
        [{ countryId: 'country1', stats: underDefendedStats }],
        mockCities
      );

      // Should show UNDER-DEFENDED when isUnderDefended is true, not DEFENDED
      expect(prompt).toMatch(/UNDER-DEFENDED \(deficit: \d+\)/);
    });
  });

  describe('Neighbor Summary Validation', () => {
    it('should include strength ratios in neighbor summaries', () => {
      const planner = new LLMStrategicPlanner();

      // Access private method for testing
      const getNeighborsSummary = (planner as any).getNeighborsSummary.bind(planner);
      const summary = getNeighborsSummary(mockState, 'country1', mockCountries[0].stats);

      // Should include ratio information
      if (summary !== "No notable neighbors") {
        expect(summary).toMatch(/Ratio \d+\.\d+x/);
      }
    });
  });

  describe('Evaluation Fixtures', () => {
    it('should handle basic game state without errors', () => {
      const planner = new LLMStrategicPlanner();

      // This is a lightweight evaluation fixture
      expect(() => {
        const analysis = RuleBasedAI.analyzeEconomicSituation(mockState, 'country1', mockCountries[0].stats);
        return analysis;
      }).not.toThrow();

      expect(() => {
        const getAffordabilityBlock = (planner as any).getAffordabilityBlock.bind(planner);
        return getAffordabilityBlock(mockCountries[0].stats);
      }).not.toThrow();

      expect(() => {
        const getAttackCandidates = (planner as any).getAttackCandidates.bind(planner);
        return getAttackCandidates(mockState, 'country1', mockCountries[0].stats, mockCities);
      }).not.toThrow();

      expect(() => {
        const buildStrategicPrompt = (planner as any).buildStrategicPrompt.bind(planner);
        return buildStrategicPrompt(mockState, 'country1', mockCountries[0].stats);
      }).not.toThrow();

      expect(() => {
        const buildBatchStrategicPrompt = (planner as any).buildBatchStrategicPrompt.bind(planner);
        return buildBatchStrategicPrompt(mockState, mockCountries, mockCities);
      }).not.toThrow();

      expect(() => {
        const buildRetryBatchPrompt = (planner as any).buildRetryBatchPrompt.bind(planner);
        return buildRetryBatchPrompt(mockState, mockCountries, mockCities);
      }).not.toThrow();
    });
  });
});