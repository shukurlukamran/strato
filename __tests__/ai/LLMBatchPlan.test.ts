
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
  });
});
