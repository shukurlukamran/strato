import type { GameAction } from "@/types/actions";
import type { City } from "@/types/city";
import { ActionResolver } from "@/lib/game-engine/ActionResolver";
import { DealExecutor } from "@/lib/game-engine/DealExecutor";
import { EventSystem } from "@/lib/game-engine/EventSystem";
import { GameState } from "@/lib/game-engine/GameState";
import { CombatResolver } from "@/lib/game-engine/CombatResolver";
import { CityTransfer } from "@/lib/game-engine/CityTransfer";
import { DefenseAI } from "@/lib/ai/DefenseAI";
import { TradePlanner } from "@/lib/ai/TradePlanner";
import { MarketPricing } from "@/lib/game-engine/MarketPricing";
import { applyDiplomaticDelta, applyMutualDiplomaticDelta } from "@/lib/game-engine/DiplomaticRelations";

export interface CombatResult {
  attackAction: GameAction;
  attackerWins: boolean;
  attackerLosses: number;
  defenderLosses: number;
  cityTransferred: boolean;
  updatedCity?: City;
  defenderAllocation: number;
}

export interface TurnProcessResult {
  executedActions: GameAction[];
  events: Array<{ type: string; message: string; data?: Record<string, unknown> }>;
  combatResults: CombatResult[];
  pendingPlayerDefense?: {
    attackAction: GameAction;
    targetCity: City;
  };
}

/**
 * Deterministic turn resolution entrypoint.
 * In multiplayer later, the server runs this; clients are observers.
 */
export class TurnProcessor {
  constructor(
    private readonly actionResolver = new ActionResolver(),
    private readonly dealExecutor = new DealExecutor(),
    private readonly eventSystem = new EventSystem(),
    private readonly tradePlanner = new TradePlanner(),
  ) {}

  async processTurn(
    state: GameState,
    getCityData: (cityId: string) => Promise<City | null>
  ): Promise<TurnProcessResult> {
    // 1) Execute/advance deals
    const dealEvents = this.dealExecutor.processDeals(state);

    // 1.5) AI Trading - Execute trades before actions to resolve resource shortages
    const tradeEvents = await this.executeAITrades(state);

    // 2) Separate attack actions from other actions
    const attackActions = state.data.pendingActions.filter(
      a => a.actionType === "military" && (a.actionData as any)?.subType === "attack"
    );
    const nonAttackActions = state.data.pendingActions.filter(
      a => !(a.actionType === "military" && (a.actionData as any)?.subType === "attack")
    );

    // 3) Resolve non-attack actions first
    const executedActions: GameAction[] = [];
    for (const action of nonAttackActions) {
      executedActions.push(this.actionResolver.resolve(state, action));
    }

    // 4) Resolve combat for attack actions (now async due to AI decisions)
    const combatResults: CombatResult[] = [];
    for (const attackAction of attackActions) {
      const actionData = attackAction.actionData as any;
      const targetCityId = actionData.targetCityId;
      
      // Fetch city data for combat resolution
      const cityData = await getCityData(targetCityId);
      
      if (!cityData) {
        console.error(`[Combat] City ${targetCityId} not found, skipping combat`);
        executedActions.push({ ...attackAction, status: "failed" });
        continue;
      }
      
      const result = await this.resolveCombat(state, attackAction, cityData);
      if (result) {
        combatResults.push(result);
        executedActions.push({ ...attackAction, status: "executed" });
      } else {
        executedActions.push({ ...attackAction, status: "failed" });
      }
    }

    // 4.5) Apply diplomatic effects from combat resolution
    if (combatResults.length > 0) {
      this.applyDiplomaticEffectsFromCombat(state, combatResults);
    }

    // 5) Run events (randomness controlled later via seeded RNG)
    const events = [...dealEvents, ...tradeEvents, ...this.eventSystem.generateEvents(state)];

    return { executedActions, events, combatResults };
  }

  /**
   * Resolve a single combat action
   * This method is ASYNC because it may need to call LLM for AI defense decisions
   */
  private async resolveCombat(
    state: GameState,
    attackAction: GameAction,
    cityData: City
  ): Promise<CombatResult | null> {
    const actionData = attackAction.actionData as any;
    const attackerId = actionData.attackerId || attackAction.countryId;
    const defenderId = actionData.defenderId;
    const allocatedStrength = actionData.allocatedStrength || 0;

    // REGRESSION GUARD: Attack actions must be pre-paid (have immediate=true marker)
    // This prevents free attacks that bypass budget deduction
    const isPaid = actionData.immediate === true;
    if (!isPaid) {
      console.error(`[Combat] SECURITY: Attack action reached combat without payment marker! Failing attack. Action:`, attackAction);
      return null;
    }

    const attackerStats = state.data.countryStatsByCountryId[attackerId];
    const defenderStats = state.data.countryStatsByCountryId[defenderId];
    
    const attackerCountry = state.data.countries.find(c => c.id === attackerId);
    const defenderCountry = state.data.countries.find(c => c.id === defenderId);

    if (!attackerStats || !defenderStats || !attackerCountry || !defenderCountry) {
      console.error(`Combat resolution failed: missing stats or country data`);
      return null;
    }

    // Determine defense allocation based on who's attacking whom:
    // 1. AI defender: Uses sophisticated rule-based AI with randomization
    // 2. Player defender: Uses player-chosen defense (stored in action)
    let defenderStrength: number;
    
    if (!defenderCountry.isPlayerControlled) {
      // Defender is AI - use sophisticated rule-based defense AI
      console.log(`[Combat] ${attackerCountry.name} attacks ${defenderCountry.name}'s ${cityData.name}. Using AI defense allocation.`);
      
      defenderStrength = await DefenseAI.decideDefenseAllocation(
        state.data,
        defenderId,
        cityData,
        attackerId
      );
    } else {
      // Defender is Player - should have defense allocation in action data
      // (This would come from a defense action submitted by the player)
      const hasPlayerDefense = actionData.defenseAllocation !== undefined && actionData.defenseAllocation !== null;
      
      if (hasPlayerDefense) {
        defenderStrength = actionData.defenseAllocation;
        console.log(`[Combat] AI ${attackerCountry.name} attacks Player's ${cityData.name}. Player chose defense: ${defenderStrength}`);
      } else {
        // FIXED: Use effective strength (tech-boosted) for default defense, not raw military strength
        // This matches what the AttackModal/DefenseModal use
        const effectiveStrength = await DefenseAI.decideDefenseAllocation(
          state.data,
          defenderId,
          cityData,
          attackerId
        );
        defenderStrength = effectiveStrength;
        console.log(`[Combat] AI ${attackerCountry.name} attacks Player's ${cityData.name}. Player did not respond - using AI-calculated defense: ${defenderStrength}`);
      }
    }

    // Resolve combat using CombatResolver
    const combatResult = CombatResolver.resolveCombat(
      allocatedStrength,
      defenderStrength,
      attackerStats,
      defenderStats
    );

    // Apply military losses to both sides
    const updatedAttackerStats = {
      ...attackerStats,
      militaryStrength: Math.max(0, attackerStats.militaryStrength - combatResult.attackerLosses),
    };
    const updatedDefenderStats = {
      ...defenderStats,
      militaryStrength: Math.max(0, defenderStats.militaryStrength - combatResult.defenderLosses),
    };

    state.withUpdatedStats(attackerId, updatedAttackerStats);
    state.withUpdatedStats(defenderId, updatedDefenderStats);

    const result: CombatResult = {
      attackAction,
      attackerWins: combatResult.attackerWins,
      attackerLosses: combatResult.attackerLosses,
      defenderLosses: combatResult.defenderLosses,
      cityTransferred: combatResult.attackerWins,
      defenderAllocation: defenderStrength,
    };

    return result;
  }

  private async executeAITrades(state: GameState): Promise<Array<{ type: string; message: string; data?: Record<string, unknown> }>> {
    const tradeEvents: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];

    try {
      // Get current market prices
      const marketPrices = await MarketPricing.computeMarketPricesForGame(state.data.gameId, state.data.turn);

      // Process each AI country
      for (const country of state.data.countries) {
        if (country.isPlayerControlled) continue; // Skip player countries

        const stats = state.data.countryStatsByCountryId[country.id];
        if (!stats) continue;

        // Detect shortages
        const shortages = await this.tradePlanner.detectShortages(country, state.data);

        if (shortages.length === 0) continue; // No needs

        // Try to trade first
        const proposals = await this.tradePlanner.planTrades(country.id, state.data, marketPrices.marketPrices);

        if (proposals.length > 0) {
          const playerCountryIds = new Set(
            state.data.countries.filter((c) => c.isPlayerControlled).map((c) => c.id),
          );

          const filteredProposals = proposals.filter(
            (proposal) =>
              !playerCountryIds.has(proposal.proposerId) && !playerCountryIds.has(proposal.receiverId),
          );

          if (filteredProposals.length > 0) {
            // Execute the best trade proposal
            const bestProposal = filteredProposals[0];
            const executionResult = await this.tradePlanner.executeTrade(
              state.data.gameId,
              state.data.turn,
              bestProposal,
              state.data  // Pass GameState snapshot so trades modify it in-memory
            );

            if (executionResult.success) {
              // Trade succeeded - no history event needed (AI-to-AI trades are internal)
              console.log(`[AI Trading] ${country.name} executed trade: ${executionResult.dealId}`);
              continue; // Trade succeeded, move to next country
            }
          } else {
            console.log(`[AI Trading] ${country.name} trade proposals involve player-only partners; skipping execution`);
          }
        }

        // FALLBACK: No trade partners or trade failed - use black market
        console.log(`[AI Trading] ${country.name} has no trade partners, trying black market...`);

        const blackMarketPurchases = await this.tradePlanner.buyFromBlackMarket(
          state.data.gameId,
          country.id,
          shortages,
          stats,
          marketPrices.marketPrices
        );

        if (blackMarketPurchases.length > 0) {
          tradeEvents.push({
            type: 'deal.black_market.ai',
            message: `${country.name} bought resources from black market`,
            data: {
              countryId: country.id,
              purchases: blackMarketPurchases
            }
          });
        }
      }
    } catch (error) {
      console.error('[AI Trading] Error during AI trading:', error);
    }

    return tradeEvents;
  }

  private applyDiplomaticEffectsFromCombat(state: GameState, combatResults: CombatResult[]): void {
    const baseAttackerPenalty = -35;
    const baseDefenderPenalty = -30;
    const captureExtraPenalty = -10;
    const failedAttackExtraPenalty = -5;
    const thirdPartyWarPenalty = -5;
    const defenderSympathyBonus = 2;

    for (const combat of combatResults) {
      const actionData = combat.attackAction.actionData as any;
      const attackerId = actionData.attackerId || combat.attackAction.countryId;
      const defenderId = actionData.defenderId;

      if (!attackerId || !defenderId) continue;

      const extra = combat.attackerWins ? captureExtraPenalty : failedAttackExtraPenalty;
      const { updatedA, updatedB } = applyMutualDiplomaticDelta(
        state.data.countryStatsByCountryId,
        attackerId,
        defenderId,
        baseAttackerPenalty + extra,
        baseDefenderPenalty + extra
      );

      if (updatedA) state.withUpdatedStats(attackerId, updatedA);
      if (updatedB) state.withUpdatedStats(defenderId, updatedB);

      for (const country of state.data.countries) {
        const otherId = country.id;
        if (otherId === attackerId || otherId === defenderId) continue;
        const otherStats = state.data.countryStatsByCountryId[otherId];
        if (!otherStats) continue;

        const penalized = applyDiplomaticDelta(otherStats, attackerId, thirdPartyWarPenalty);
        const sympathetic = applyDiplomaticDelta(penalized, defenderId, defenderSympathyBonus);
        state.withUpdatedStats(otherId, sympathetic);
      }
    }
  }
}

