
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LLMStrategicPlanner } from '@/lib/ai/LLMStrategicPlanner';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import type { CountryStats } from '@/types/country';
import type { City } from '@/types/city';

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

describe('LLM Batch Plan & Normalization', () => {
  let planner: LLMStrategicPlanner;
  let mockState: GameStateSnapshot;
  let mockCountries: Array<{ countryId: string; stats: CountryStats }>;
  let mockCities: City[];

  beforeEach(() => {
    // Reset singleton instance if needed or create new
    planner = new LLMStrategicPlanner();
    
    // Mock API key to allow methods to run
    (planner as any).apiKey = 'test-key';

    mockState = {
      gameId: 'test-game',
      turn: 10,
      countries: [
        { id: '11111111-2222-3333-4444-555555555555', name: 'Country A', positionX: 0, positionY: 0, color: '#000', isPlayerControlled: false },
        { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Country B', positionX: 100, positionY: 0, color: '#000', isPlayerControlled: false },
      ],
      countryStatsByCountryId: {}, // Populated below
    } as any;

    mockCountries = [
      {
        countryId: '11111111-2222-3333-4444-555555555555',
        stats: {
          population: 1000,
          budget: 1000,
          militaryStrength: 100,
          technologyLevel: 1,
          resources: {},
        } as any
      },
      {
        countryId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        stats: {
          population: 1000,
          budget: 1000,
          militaryStrength: 100,
          technologyLevel: 1,
          resources: {},
        } as any
      }
    ];
    
    // Populate stats in state
    mockState.countryStatsByCountryId = {
      '11111111-2222-3333-4444-555555555555': mockCountries[0].stats,
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': mockCountries[1].stats
    } as any;

    mockCities = [];
  });

  describe('parseBatchStrategicAnalysis', () => {
    it('should normalize country IDs containing extra text', () => {
      // Access private method
      const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);

      const messyResponse = JSON.stringify({
        countries: [
          {
            countryId: "Country A (11111111-2222-3333-4444-555555555555)",
            focus: "economy",
            rationale: "Test rationale",
            action_plan: []
          },
          {
            countryId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,", // Trailing comma
            focus: "military",
            rationale: "Test rationale",
            action_plan: []
          }
        ]
      });

      const results = parseBatch(messyResponse, 10, mockCountries);

      expect(results.size).toBe(2);
      expect(results.has('11111111-2222-3333-4444-555555555555')).toBe(true);
      expect(results.has('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(true);
    });

    it('should discard analyses with unknown country IDs', () => {
      const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);

      const response = JSON.stringify({
        countries: [
          {
            countryId: "11111111-2222-3333-4444-555555555555",
            focus: "economy"
          },
          {
            countryId: "99999999-9999-9999-9999-999999999999", // Not in request list
            focus: "military"
          }
        ]
      });

      const results = parseBatch(response, 10, mockCountries);

      expect(results.size).toBe(1);
      expect(results.has('11111111-2222-3333-4444-555555555555')).toBe(true);
      expect(results.has('99999999-9999-9999-9999-999999999999')).toBe(false);
    });

    it('should handle response wrapped in code blocks', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
  
        const response = "```json\n" + JSON.stringify({
          countries: [{ countryId: "11111111-2222-3333-4444-555555555555", focus: "economy" }]
        }) + "\n```";
  
        const results = parseBatch(response, 10, mockCountries);
        expect(results.size).toBe(1);
    });

    // PHASE 6: JSON Validation Tests (8-10 step minimum requirement)
    describe('JSON Validation - 8-10 Step Requirement', () => {
      it('should accept batch with exactly 8 steps', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const validResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              rationale: "Test",
              action_plan: Array(8).fill({
                id: "a1",
                instruction: "Test action",
                execution: {
                  actionType: "military",
                  actionData: { subType: "recruit", amount: 15 }
                }
              })
            }
          ]
        });

        const results = parseBatch(validResponse, 10, mockCountries);
        expect(results.size).toBe(1);
        expect(results.has('11111111-2222-3333-4444-555555555555')).toBe(true);
      });

      it('should accept batch with exactly 10 steps', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const validResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "balanced",
              rationale: "Test",
              action_plan: Array(10).fill({
                id: "a1",
                instruction: "Test action",
                execution: {
                  actionType: "research",
                  actionData: { targetLevel: 2 }
                }
              })
            }
          ]
        });

        const results = parseBatch(validResponse, 10, mockCountries);
        expect(results.size).toBe(1);
      });

      it('should reject batch with fewer than 8 steps', () => {
        // parseBatchStrategicAnalysis should handle this gracefully
        // Since we added validation at line 1207-1270, it should return empty results
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "economy",
              rationale: "Test",
              action_plan: Array(6).fill({
                id: "a1",
                instruction: "Test",
                execution: {
                  actionType: "research",
                  actionData: { targetLevel: 2 }
                }
              })
            }
          ]
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        // Should return empty (validation failed, early return)
        expect(results.size).toBe(0);
      });

      it('should reject batch with more than 10 steps', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              rationale: "Test",
              action_plan: Array(12).fill({
                id: "a1",
                instruction: "Test",
                execution: {
                  actionType: "military",
                  actionData: { subType: "recruit", amount: 10 }
                }
              })
            }
          ]
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });
    });

    // PHASE 6: Execution Schema Validation Tests
    describe('Execution Schema Validation', () => {
      it('should keep military step with valid recruit schema (subType: recruit)', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const response = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              rationale: "Test",
              action_plan: Array(8).fill({
                id: "recruit1",
                instruction: "Recruit troops",
                execution: {
                  actionType: "military",
                  actionData: { subType: "recruit", amount: 15 }
                }
              })
            }
          ]
        });

        const results = parseBatch(response, 10, mockCountries);
        expect(results.size).toBe(1);
        const analysis = results.get('11111111-2222-3333-4444-555555555555');
        expect(analysis).toBeDefined();
        expect(analysis!.planItems).toBeDefined();
        // Should have 8 valid executable steps
        const validSteps = analysis!.planItems!.filter(i => i.kind === 'step' && i.execution);
        expect(validSteps.length).toBe(8);
      });

      it('should filter military step without subType field', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const response = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              rationale: "Test",
              action_plan: [
                // Valid step
                {
                  id: "valid1",
                  instruction: "Valid recruit",
                  execution: {
                    actionType: "military",
                    actionData: { subType: "recruit", amount: 15 }
                  }
                },
                // 7 more valid steps to reach 8
                ...Array(7).fill({
                  id: "valid2",
                  instruction: "Valid recruit",
                  execution: {
                    actionType: "military",
                    actionData: { subType: "recruit", amount: 10 }
                  }
                }),
                // Invalid step - no subType
                {
                  id: "invalid_no_subtype",
                  instruction: "Invalid military action",
                  execution: {
                    actionType: "military",
                    actionData: { amount: 15 } // Missing subType!
                  }
                }
              ]
            }
          ]
        });

        const results = parseBatch(response, 10, mockCountries);
        expect(results.size).toBe(1);
        const analysis = results.get('11111111-2222-3333-4444-555555555555');
        expect(analysis!.planItems).toBeDefined();
        
        // Should have 8 valid steps (invalid one filtered out)
        const validSteps = analysis!.planItems!.filter(i => i.kind === 'step' && i.execution);
        expect(validSteps.length).toBe(8);
        
        // Invalid step should not be in validatedItems
        const invalidStep = analysis!.planItems!.find(i => i.id === 'invalid_no_subtype');
        expect(invalidStep).toBeUndefined();
      });

      it('should filter military step with invalid subType', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const response = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              rationale: "Test",
              action_plan: [
                ...Array(8).fill({
                  id: "valid1",
                  instruction: "Valid recruit",
                  execution: {
                    actionType: "military",
                    actionData: { subType: "recruit", amount: 10 }
                  }
                }),
                {
                  id: "invalid_subtype",
                  instruction: "Invalid subType",
                  execution: {
                    actionType: "military",
                    actionData: { subType: "bombard", amount: 20 } // Invalid subType (not recruit/attack)
                  }
                }
              ]
            }
          ]
        });

        const results = parseBatch(response, 10, mockCountries);
        const analysis = results.get('11111111-2222-3333-4444-555555555555');
        const validSteps = analysis!.planItems!.filter(i => i.kind === 'step' && i.execution);
        
        // Should have 8 valid steps, invalid one filtered
        expect(validSteps.length).toBe(8);
        const invalidStep = analysis!.planItems!.find(i => i.id === 'invalid_subtype');
        expect(invalidStep).toBeUndefined();
      });

      it('should filter economic step without infrastructure subType', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const response = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "economy",
              rationale: "Test",
              action_plan: [
                ...Array(8).fill({
                  id: "valid_econ",
                  instruction: "Build infrastructure",
                  execution: {
                    actionType: "economic",
                    actionData: { subType: "infrastructure", targetLevel: 2 }
                  }
                }),
                {
                  id: "invalid_econ",
                  instruction: "Invalid economic",
                  execution: {
                    actionType: "economic",
                    actionData: { subType: "trade" } // Invalid: not infrastructure
                  }
                }
              ]
            }
          ]
        });

        const results = parseBatch(response, 10, mockCountries);
        const analysis = results.get('11111111-2222-3333-4444-555555555555');
        const validSteps = analysis!.planItems!.filter(i => i.kind === 'step' && i.execution);
        
        expect(validSteps.length).toBe(8);
        const invalidStep = analysis!.planItems!.find(i => i.id === 'invalid_econ');
        expect(invalidStep).toBeUndefined();
      });

      it('should filter economic step without targetLevel', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const response = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "economy",
              rationale: "Test",
              action_plan: [
                ...Array(8).fill({
                  id: "valid_econ",
                  instruction: "Build infrastructure",
                  execution: {
                    actionType: "economic",
                    actionData: { subType: "infrastructure", targetLevel: 2 }
                  }
                }),
                {
                  id: "no_target_level",
                  instruction: "Incomplete economic",
                  execution: {
                    actionType: "economic",
                    actionData: { subType: "infrastructure" } // Missing targetLevel
                  }
                }
              ]
            }
          ]
        });

        const results = parseBatch(response, 10, mockCountries);
        const analysis = results.get('11111111-2222-3333-4444-555555555555');
        const validSteps = analysis!.planItems!.filter(i => i.kind === 'step' && i.execution);
        
        expect(validSteps.length).toBe(8);
        const invalidStep = analysis!.planItems!.find(i => i.id === 'no_target_level');
        expect(invalidStep).toBeUndefined();
      });

      it('should filter research step without targetLevel', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const response = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "research",
              rationale: "Test",
              action_plan: [
                ...Array(8).fill({
                  id: "valid_research",
                  instruction: "Research tech",
                  execution: {
                    actionType: "research",
                    actionData: { targetLevel: 2 }
                  }
                }),
                {
                  id: "incomplete_research",
                  instruction: "Incomplete research",
                  execution: {
                    actionType: "research",
                    actionData: {} // Missing targetLevel
                  }
                }
              ]
            }
          ]
        });

        const results = parseBatch(response, 10, mockCountries);
        const analysis = results.get('11111111-2222-3333-4444-555555555555');
        const validSteps = analysis!.planItems!.filter(i => i.kind === 'step' && i.execution);
        
        expect(validSteps.length).toBe(8);
        const invalidStep = analysis!.planItems!.find(i => i.id === 'incomplete_research');
        expect(invalidStep).toBeUndefined();
      });
    });

    // PHASE 6: Malformed JSON Handling Tests
    describe('Malformed JSON Detection', () => {
      it('should reject JSON missing countries array', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          analysis: [] // Wrong key
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });

      it('should reject JSON with empty countries array', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [] // Empty
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });

      it('should reject country missing countryId field', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [
            {
              // Missing countryId
              focus: "military",
              action_plan: Array(8).fill({ id: "a1", instruction: "Test", execution: { actionType: "military", actionData: { subType: "recruit", amount: 10 } } })
            }
          ]
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });

      it('should reject action missing execution field', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              action_plan: Array(8).fill({
                id: "a1",
                instruction: "Test",
                // Missing execution field
              })
            }
          ]
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });

      it('should reject action missing actionType in execution', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              action_plan: Array(8).fill({
                id: "a1",
                instruction: "Test",
                execution: {
                  // Missing actionType
                  actionData: { subType: "recruit", amount: 10 }
                }
              })
            }
          ]
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });

      it('should reject action missing actionData in execution', () => {
        const parseBatch = (planner as any).parseBatchStrategicAnalysis.bind(planner);
        
        const invalidResponse = JSON.stringify({
          countries: [
            {
              countryId: "11111111-2222-3333-4444-555555555555",
              focus: "military",
              action_plan: Array(8).fill({
                id: "a1",
                instruction: "Test",
                execution: {
                  actionType: "military"
                  // Missing actionData
                }
              })
            }
          ]
        });

        const results = parseBatch(invalidResponse, 10, mockCountries);
        expect(results.size).toBe(0);
      });
    });
  });
});
