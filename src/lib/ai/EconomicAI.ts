import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { RuleBasedAI } from "./RuleBasedAI";
import { ActionResolver } from "@/lib/game-engine/ActionResolver";
import { DefaultPersonality, type AIPersonality } from "./Personality";

/**
 * Economic AI Decision Maker
 * Uses rule-based logic to decide on economic actions (research, infrastructure)
 */
export class EconomicAI {
  private personality: AIPersonality;

  constructor(personality: AIPersonality = DefaultPersonality) {
    this.personality = personality;
  }

  /**
   * Decide economic actions for this turn
   */
  decideActions(
    state: GameStateSnapshot,
    countryId: string,
    intent: StrategyIntent
  ): GameAction[] {
    const actions: GameAction[] = [];
    const stats = state.countryStatsByCountryId[countryId];
    
    if (!stats) return actions;

    // Analyze economic situation
    const analysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
    
    // Calculate decision weights (influenced by strategic intent)
    const weights = RuleBasedAI.calculateDecisionWeights(
      analysis,
      this.adjustPersonalityForIntent(intent),
      stats.resourceProfile
    );

    // DECISION 1: Research investment
    if (RuleBasedAI.shouldInvestInResearch(stats, analysis, weights)) {
      const researchCost = ActionResolver.calculateResearchCost(stats.technologyLevel);
      actions.push({
        id: `${countryId}-research-${state.turn}`,
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "research",
        actionData: {
          cost: researchCost,
          targetLevel: stats.technologyLevel + 1,
        },
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    // DECISION 2: Infrastructure investment
    // Only if we didn't research this turn (one major investment per turn)
    if (actions.length === 0 && RuleBasedAI.shouldInvestInInfrastructure(stats, analysis, weights)) {
      const infraCost = ActionResolver.calculateInfrastructureCost(stats.infrastructureLevel || 0);
      actions.push({
        id: `${countryId}-infrastructure-${state.turn}`,
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "economic",
        actionData: {
          subType: "infrastructure",
          cost: infraCost,
          targetLevel: (stats.infrastructureLevel || 0) + 1,
        },
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    return actions;
  }

  /**
   * Adjust personality weights based on strategic intent
   */
  private adjustPersonalityForIntent(intent: StrategyIntent): AIPersonality {
    const adjusted = { ...this.personality };

    switch (intent.focus) {
      case "economy":
        // Economic focus: more risk-tolerant for investments
        adjusted.riskTolerance = Math.min(1, adjusted.riskTolerance + 0.2);
        break;
      case "research":
        // Research focus: highly risk-tolerant
        adjusted.riskTolerance = Math.min(1, adjusted.riskTolerance + 0.3);
        break;
      case "military":
        // Military focus: less economic investment
        adjusted.riskTolerance = Math.max(0, adjusted.riskTolerance - 0.2);
        break;
      case "diplomacy":
        // Diplomatic focus: moderate and balanced
        break;
      case "balanced":
      default:
        // No adjustment for balanced approach
        break;
    }

    return adjusted;
  }
}

