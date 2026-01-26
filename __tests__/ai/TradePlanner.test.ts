import { TradePlanner } from '@/lib/ai/TradePlanner';
import { TradeValuation } from '@/lib/ai/TradeValuation';
import type { Country, CountryStats } from '@/types/country';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';

const ISO_TIME = '2025-01-01T00:00:00Z';

const createStats = (
  countryId: string,
  resources: Record<string, number>,
  budget = 500
): CountryStats => ({
  id: `${countryId}-stats`,
  countryId,
  turn: 1,
  population: 100,
  budget,
  technologyLevel: 2,
  infrastructureLevel: 1,
  militaryStrength: 10,
  militaryEquipment: {},
  resources,
  diplomaticRelations: {},
  createdAt: ISO_TIME,
});

const buildGameState = (
  aiCountry: Country,
  partner: Country,
  aiStats: CountryStats,
  partnerStats: CountryStats
): GameStateSnapshot => ({
  gameId: 'game-1',
  turn: 1,
  countries: [aiCountry, partner],
  countryStatsByCountryId: {
    [aiCountry.id]: aiStats,
    [partner.id]: partnerStats,
  },
  pendingActions: [],
  activeDeals: [],
});

const aiCountry: Country = {
  id: 'ai-1',
  gameId: 'game-1',
  name: 'Autonomous State',
  isPlayerControlled: false,
  color: '#ff0000',
  positionX: 0,
  positionY: 0,
};

const aiPartner: Country = {
  id: 'ai-2',
  gameId: 'game-1',
  name: 'Friendly AI',
  isPlayerControlled: false,
  color: '#00ff00',
  positionX: 1,
  positionY: 1,
};

const playerPartner: Country = {
  id: 'player-1',
  gameId: 'game-1',
  name: 'Player',
  isPlayerControlled: true,
  color: '#0000ff',
  positionX: 2,
  positionY: 2,
};

const marketPrices = {
  food: 2,
  steel: 15,
  gold: 200,
};

describe('TradePlanner value-driven trading', () => {
  let planner: TradePlanner;

  beforeEach(() => {
    planner = new TradePlanner();
  });

  it('uses market ratios to avoid 1-to-1 swaps', () => {
    const aiStats = createStats(aiCountry.id, { food: 120, steel: 5 }, 400);
    const partnerStats = createStats(aiPartner.id, { steel: 80, food: 50 }, 200);
    const gameState = buildGameState(aiCountry, aiPartner, aiStats, partnerStats);
    const plannerAny = planner as any;

    const proposals = plannerAny.generateTradeProposals(
      aiCountry,
      aiPartner,
      [{ resourceId: 'steel', needed: 40, available: 10 }],
      [{ resourceId: 'food', amount: 60 }],
      marketPrices,
      gameState
    );

    expect(proposals.length).toBeGreaterThan(0);
    const terms = proposals[0].terms;
    const proposerCommitment = terms.proposerCommitments[0];
    const receiverCommitment = terms.receiverCommitments[0];

    expect(proposerCommitment.resource).toBe('food');
    expect(receiverCommitment.resource).toBe('steel');
    expect(proposerCommitment.amount).not.toEqual(receiverCommitment.amount);
  });

  it('keeps AI↔AI trades within fairness tolerance', () => {
    const aiStats = createStats(aiCountry.id, { food: 120, steel: 5 }, 400);
    const partnerStats = createStats(aiPartner.id, { steel: 80, food: 50 }, 200);
    const gameState = buildGameState(aiCountry, aiPartner, aiStats, partnerStats);
    const plannerAny = planner as any;

    const proposals = plannerAny.generateTradeProposals(
      aiCountry,
      aiPartner,
      [{ resourceId: 'steel', needed: 40, available: 10 }],
      [{ resourceId: 'food', amount: 60 }],
      marketPrices,
      gameState
    );

    expect(proposals.length).toBeGreaterThan(0);
    const evaluation = TradeValuation.evaluateProposal(
      proposals[0].terms.proposerCommitments,
      proposals[0].terms.receiverCommitments,
      marketPrices
    );

    expect(Math.abs(evaluation.normalizedNet)).toBeLessThanOrEqual(0.06);
  });

  it('bounds AI→Player advantage while respecting market prices', () => {
    const aiStats = createStats(aiCountry.id, { food: 120, steel: 5 }, 400);
    const playerStats = createStats(playerPartner.id, { steel: 80, food: 50 }, 200);
    const gameState = buildGameState(aiCountry, playerPartner, aiStats, playerStats);
    const plannerAny = planner as any;

    const proposals = plannerAny.generateTradeProposals(
      aiCountry,
      playerPartner,
      [{ resourceId: 'steel', needed: 40, available: 15 }],
      [{ resourceId: 'food', amount: 60 }],
      marketPrices,
      gameState
    );

    const playerProposal = proposals.find(p => p.receiverId === playerPartner.id);
    expect(playerProposal).toBeDefined();

    const evaluation = TradeValuation.evaluateProposal(
      playerProposal!.terms.proposerCommitments,
      playerProposal!.terms.receiverCommitments,
      marketPrices
    );

    expect(evaluation.normalizedNet).toBeGreaterThanOrEqual(-0.17);
    expect(evaluation.normalizedNet).toBeLessThanOrEqual(0.17);
  });

  it('adds budget transfers when rounding pushes deals outside tolerance', () => {
    const aiStats = createStats(aiCountry.id, { food: 220, steel: 5 }, 600);
    const playerStats = createStats(playerPartner.id, { gold: 50, food: 20 }, 200);
    const gameState = buildGameState(aiCountry, playerPartner, aiStats, playerStats);
    const plannerAny = planner as any;

    const proposals = plannerAny.generateTradeProposals(
      aiCountry,
      playerPartner,
      [{ resourceId: 'gold', needed: 1, available: 0 }],
      [{ resourceId: 'food', amount: 200 }],
      marketPrices,
      gameState
    );

    expect(proposals.length).toBeGreaterThan(0);
    const proposerCommitments = proposals[0].terms.proposerCommitments;
    const hasBudgetTransfer = proposerCommitments.some(c => c.type === 'budget_transfer');
    expect(hasBudgetTransfer).toBe(true);
  });
});
