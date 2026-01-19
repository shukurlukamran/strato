import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { RuleBasedAI } from "./RuleBasedAI";
import { DefaultPersonality, type AIPersonality } from "./Personality";

/**
 * Military AI Decision Maker
 * Uses rule-based logic to decide on military actions (recruitment, defense)
 */
export class MilitaryAI {
  private personality: AIPersonality;

  constructor(personality: AIPersonality = DefaultPersonality) {
    this.personality = personality;
  }

  /**
   * Decide military actions for this turn
   */
  decideActions(
    state: GameStateSnapshot,
    countryId: string,
    intent: StrategyIntent
  ): GameAction[] {
    const actions: GameAction[] = [];
    const stats = state.countryStatsByCountryId[countryId];
    
    if (!stats) return actions;

    // Analyze economic situation (military decisions need economic context)
    const analysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
    
    // Calculate decision weights
    const weights = RuleBasedAI.calculateDecisionWeights(
      analysis,
      this.adjustPersonalityForIntent(intent),
      stats.resourceProfile
    );

    // DECISION: Military recruitment
    const recruitAmount = RuleBasedAI.decideMilitaryRecruitment(stats, analysis, weights);
    
    if (recruitAmount > 0) {
      const recruitCost = recruitAmount * 100; // 100 budget per unit
      
      actions.push({
        id: `${countryId}-military-recruit-${state.turn}`,
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "military",
        actionData: {
          subType: "recruit",
          amount: recruitAmount,
          cost: recruitCost,
        },
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    // Future: Add deployment, fortification, attack decisions here

    return actions;
  }

  /**
   * Adjust personality weights based on strategic intent
   */
  private adjustPersonalityForIntent(intent: StrategyIntent): AIPersonality {
    const adjusted = { ...this.personality };

    switch (intent.focus) {
      case "military":
        // Military focus: more aggressive, more risk-tolerant
        adjusted.aggression = Math.min(1, adjusted.aggression + 0.3);
        adjusted.riskTolerance = Math.min(1, adjusted.riskTolerance + 0.2);
        break;
      case "economy":
      case "research":
        // Economic/research focus: less aggressive, save resources
        adjusted.aggression = Math.max(0, adjusted.aggression - 0.2);
        break;
      case "diplomacy":
        // Diplomatic focus: less aggressive
        adjusted.aggression = Math.max(0, adjusted.aggression - 0.3);
        adjusted.cooperativeness = Math.min(1, adjusted.cooperativeness + 0.2);
        break;
      case "balanced":
      default:
        // No adjustment for balanced approach
        break;
    }

    return adjusted;
  }
}

