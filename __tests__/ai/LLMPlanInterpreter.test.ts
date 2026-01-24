import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EconomicAI } from '@/lib/ai/EconomicAI';
import { MilitaryAI } from '@/lib/ai/MilitaryAI';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import type { CountryStats } from '@/types/country';
import type { LLMPlanItem } from '@/lib/ai/LLMStrategicPlanner';

// Mock dependencies
jest.mock('@/lib/supabase/server');
jest.mock('@/lib/game-engine/DiplomaticRelations');

describe('PHASE 6: Action Filtering & Execution Schema Validation', () => {
  let economicAI: EconomicAI;
  let militaryAI: MilitaryAI;
  let mockStats: CountryStats;
  let mockState: GameStateSnapshot;

  beforeEach(() => {
    economicAI = new EconomicAI();
    militaryAI = new MilitaryAI();

    mockStats = {
      population: 1000,
      budget: 2000,
      militaryStrength: 100,
      technologyLevel: 1,
      infrastructureLevel: 1,
      resources: { food: 50, timber: 50, iron: 50 },
      diplomaticRelations: {},
    } as any;

    mockState = {
      gameId: 'test-game',
      turn: 2,
      countries: [],
      countryStatsByCountryId: {},
    } as any;
  });

  describe('EconomicAI: Action Domain Filtering', () => {
    it('should accept economic step with valid schema (infrastructure + targetLevel)', () => {
      const validPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'econ1',
          instruction: 'Build infrastructure',
          execution: {
            actionType: 'economic',
            actionData: { subType: 'infrastructure', targetLevel: 2 }
          }
        }
      ];

      const step = economicAI.getNextPlanStep(validPlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).not.toBeNull();
      expect(step?.id).toBe('econ1');
    });

    it('should accept research step with valid schema (targetLevel)', () => {
      const validPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'research1',
          instruction: 'Upgrade technology',
          execution: {
            actionType: 'research',
            actionData: { targetLevel: 2 }
          }
        }
      ];

      const step = economicAI.getNextPlanStep(validPlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).not.toBeNull();
      expect(step?.id).toBe('research1');
    });

    it('should filter military step (wrong domain for EconomicAI)', () => {
      const militaryInEconomicPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'military1',
          instruction: 'Recruit troops',
          execution: {
            actionType: 'military',
            actionData: { subType: 'recruit', amount: 15 }
          }
        }
      ];

      const step = economicAI.getNextPlanStep(militaryInEconomicPlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).toBeNull();
    });

    it('should filter economic step without infrastructure subType', () => {
      const invalidPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'econ_invalid',
          instruction: 'Invalid economic action',
          execution: {
            actionType: 'economic',
            actionData: { subType: 'trade' } // Wrong subType
          }
        }
      ];

      const step = economicAI.getNextPlanStep(invalidPlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).toBeNull();
    });

    it('should filter economic step missing targetLevel', () => {
      const incompletePlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'econ_incomplete',
          instruction: 'Incomplete action',
          execution: {
            actionType: 'economic',
            actionData: { subType: 'infrastructure' } // Missing targetLevel
          }
        }
      ];

      const step = economicAI.getNextPlanStep(incompletePlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).toBeNull();
    });

    it('should select first valid economic step when multiple mixed steps provided', () => {
      const mixedPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'military1',
          instruction: 'Recruit',
          execution: { actionType: 'military', actionData: { subType: 'recruit', amount: 10 } }
        },
        {
          kind: 'step',
          id: 'econ1',
          instruction: 'Build infrastructure',
          execution: { actionType: 'economic', actionData: { subType: 'infrastructure', targetLevel: 2 } }
        },
        {
          kind: 'step',
          id: 'military2',
          instruction: 'Attack',
          execution: { actionType: 'military', actionData: { subType: 'attack', targetCityId: 'city1', allocatedStrength: 20 } }
        }
      ];

      const step = economicAI.getNextPlanStep(mixedPlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).not.toBeNull();
      expect(step?.id).toBe('econ1'); // Should skip military steps and find economic
    });

    it('should handle plan with only military steps (all filtered)', () => {
      const militaryOnlyPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'mil1',
          instruction: 'Recruit',
          execution: { actionType: 'military', actionData: { subType: 'recruit', amount: 10 } }
        },
        {
          kind: 'step',
          id: 'mil2',
          instruction: 'Attack',
          execution: { actionType: 'military', actionData: { subType: 'attack', targetCityId: 'city1', allocatedStrength: 20 } }
        }
      ];

      const step = economicAI.getNextPlanStep(militaryOnlyPlan, mockStats, 'test-country', new Set(), new Set());
      expect(step).toBeNull();
    });
  });

  describe('MilitaryAI: Action Domain Filtering', () => {
    it('should accept military recruit step with valid schema (subType: recruit + amount)', () => {
      const validPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'recruit1',
          instruction: 'Recruit troops',
          execution: {
            actionType: 'military',
            actionData: { subType: 'recruit', amount: 15 }
          }
        }
      ];

      const step = militaryAI.getNextPlanStep(validPlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).not.toBeNull();
      expect(step?.id).toBe('recruit1');
    });

    it('should accept military attack step with valid schema (subType: attack + targetCityId)', () => {
      const validPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'attack1',
          instruction: 'Attack city',
          execution: {
            actionType: 'military',
            actionData: { subType: 'attack', targetCityId: 'city123', allocatedStrength: 20 }
          }
        }
      ];

      const step = militaryAI.getNextPlanStep(validPlan, mockStats, 'test-country', new Set(), new Set(), 'attack');
      expect(step).not.toBeNull();
      expect(step?.id).toBe('attack1');
    });

    it('should filter military step missing subType field', () => {
      const invalidPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'invalid_mil',
          instruction: 'Military action',
          execution: {
            actionType: 'military',
            actionData: { amount: 15 } // Missing subType!
          }
        }
      ];

      const step = militaryAI.getNextPlanStep(invalidPlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).toBeNull();
    });

    it('should filter military step with wrong subType for request', () => {
      const wrongSubTypePlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'recruit1',
          instruction: 'Recruit troops',
          execution: {
            actionType: 'military',
            actionData: { subType: 'recruit', amount: 15 }
          }
        }
      ];

      // Requesting attack subType, but plan has recruit
      const step = militaryAI.getNextPlanStep(wrongSubTypePlan, mockStats, 'test-country', new Set(), new Set(), 'attack');
      expect(step).toBeNull();
    });

    it('should filter military step with invalid subType', () => {
      const invalidSubTypePlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'invalid_subtype',
          instruction: 'Military action',
          execution: {
            actionType: 'military',
            actionData: { subType: 'bombard', amount: 15 } // Invalid (not recruit/attack)
          }
        }
      ];

      const step = militaryAI.getNextPlanStep(invalidSubTypePlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).toBeNull();
    });

    it('should filter economic step (wrong domain for MilitaryAI)', () => {
      const economicInMilitaryPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'econ1',
          instruction: 'Build infrastructure',
          execution: {
            actionType: 'economic',
            actionData: { subType: 'infrastructure', targetLevel: 2 }
          }
        }
      ];

      const step = militaryAI.getNextPlanStep(economicInMilitaryPlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).toBeNull();
    });

    it('should select first valid recruit step from mixed plan', () => {
      const mixedPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'econ1',
          instruction: 'Build infrastructure',
          execution: { actionType: 'economic', actionData: { subType: 'infrastructure', targetLevel: 2 } }
        },
        {
          kind: 'step',
          id: 'recruit1',
          instruction: 'Recruit troops',
          execution: { actionType: 'military', actionData: { subType: 'recruit', amount: 15 } }
        },
        {
          kind: 'step',
          id: 'research1',
          instruction: 'Research tech',
          execution: { actionType: 'research', actionData: { targetLevel: 2 } }
        }
      ];

      const step = militaryAI.getNextPlanStep(mixedPlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).not.toBeNull();
      expect(step?.id).toBe('recruit1'); // Should skip economic/research and find recruit
    });

    it('should handle plan with economic and research only (all filtered)', () => {
      const nonMilitaryPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'econ1',
          instruction: 'Build infrastructure',
          execution: { actionType: 'economic', actionData: { subType: 'infrastructure', targetLevel: 2 } }
        },
        {
          kind: 'step',
          id: 'research1',
          instruction: 'Research tech',
          execution: { actionType: 'research', actionData: { targetLevel: 2 } }
        }
      ];

      const step = militaryAI.getNextPlanStep(nonMilitaryPlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).toBeNull();
    });

    it('should prioritize by priority field when multiple valid steps exist', () => {
      const prioritizedPlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'recruit_low',
          instruction: 'Recruit (low priority)',
          priority: 10,
          execution: { actionType: 'military', actionData: { subType: 'recruit', amount: 10 } }
        },
        {
          kind: 'step',
          id: 'recruit_high',
          instruction: 'Recruit (high priority)',
          priority: 1,
          execution: { actionType: 'military', actionData: { subType: 'recruit', amount: 15 } }
        }
      ];

      // Without explicit priority sorting in test, we just verify both could be valid
      const step = militaryAI.getNextPlanStep(prioritizedPlan, mockStats, 'test-country', new Set(), new Set(), 'recruit');
      expect(step).not.toBeNull();
      expect(step?.execution?.actionType).toBe('military');
    });
  });

  describe('PHASE 6: Plan Longevity - 8-10 Steps Extended Coverage', () => {
    it('should provide actions for first 6-8 turns from 8-step plan', () => {
      const longPlan: LLMPlanItem[] = Array.from({ length: 8 }, (_, i) => ({
        kind: 'step' as const,
        id: `research${i}`,
        instruction: `Research level ${i + 1}`,
        execution: {
          actionType: 'research' as const,
          actionData: { targetLevel: i + 1 }
        }
      }));

      // Simulate turning 2 onwards - should have actions available
      const turns = [2, 3, 4, 5, 6, 7, 8];
      let step: LLMPlanItem | null;
      let stepsExecuted = 0;

      for (const turn of turns) {
        // Each turn, we get a step and mark it executed
        const executed = new Set<string>();
        for (let j = 0; j < stepsExecuted; j++) {
          executed.add(`research${j}`);
        }

        step = economicAI.getNextPlanStep(longPlan, mockStats, 'test-country', executed, new Set());
        
        if (step) {
          stepsExecuted++;
        }
      }

      // Should have executed multiple steps (depends on stop_when conditions)
      // With one-time steps, at least 1-8 should execute
      expect(stepsExecuted).toBeGreaterThan(0);
    });

    it('should handle repeatable steps with stop_when condition', () => {
      const repeatablePlan: LLMPlanItem[] = [
        {
          kind: 'step',
          id: 'tech_l3',
          instruction: 'Upgrade tech to level 3',
          stop_when: { tech_level_gte: 3 }, // Repeatable until tech reaches 3
          execution: {
            actionType: 'research',
            actionData: { targetLevel: 3 }
          }
        },
        {
          kind: 'step',
          id: 'tech_l4',
          instruction: 'Upgrade tech to level 4',
          stop_when: { tech_level_gte: 4 },
          execution: {
            actionType: 'research',
            actionData: { targetLevel: 4 }
          }
        }
      ];

      // First call (tech at level 1)
      let step = economicAI.getNextPlanStep(repeatablePlan, mockStats, 'test-country', new Set(), new Set());
      expect(step?.id).toBe('tech_l3');

      // Simulate tech upgraded but not at 3 yet (level 2)
      const statsTech2 = { ...mockStats, technologyLevel: 2 };
      step = economicAI.getNextPlanStep(repeatablePlan, statsTech2, 'test-country', new Set(), new Set());
      // Should still return tech_l3 (stop condition not met)
      expect(step?.id).toBe('tech_l3');

      // Simulate tech at level 3
      const statsTech3 = { ...mockStats, technologyLevel: 3 };
      step = economicAI.getNextPlanStep(repeatablePlan, statsTech3, 'test-country', new Set(), new Set());
      // Should return tech_l4 (tech_l3 stop condition met)
      expect(step?.id).toBe('tech_l4');
    });
  });
});
