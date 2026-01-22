import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { RuleBasedAI } from "./RuleBasedAI";
import { ActionResolver } from "@/lib/game-engine/ActionResolver";
import { DefaultPersonality, type AIPersonality } from "./Personality";
import {
  extractLLMBans,
  extractNumberRange,
  extractTargetInfraLevel,
  extractTargetTechLevel,
  isOneTimeStep,
  looksLikeInfrastructureUpgradeStep,
  looksLikeTechUpgradeStep,
} from "@/lib/ai/LLMPlanInterpreter";

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

    // HARD CONSTRAINTS: If LLM explicitly says "avoid/refrain", enforce it for the plan window,
    // including against rule-based fallbacks.
    const llmSteps = intent.llmPlan?.recommendedActions ?? [];
    const bans = extractLLMBans(llmSteps);

    // PRIORITY: Follow LLM action steps (when present) before rule-based heuristics.
    // This ensures "recommendedActions" actually influence gameplay, not just logs.
    const llmPreferred = this.tryLLMEconomicActions(state, countryId, intent, analysis, bans);
    if (llmPreferred.length > 0) {
      return llmPreferred;
    }
    
    // Calculate decision weights (influenced by strategic intent)
    const weights = RuleBasedAI.calculateDecisionWeights(
      analysis,
      this.adjustPersonalityForIntent(intent),
      stats.resourceProfile
    );

    const criticalEconomicNeed =
      (analysis.foodTurnsRemaining !== null && analysis.foodTurnsRemaining < 5) ||
      (analysis.turnsUntilBankrupt !== null && analysis.turnsUntilBankrupt < 3);

    // Honor non-economic strategic focuses unless in critical economic trouble
    if ((intent.focus === "military" || intent.focus === "diplomacy") && !criticalEconomicNeed) {
      return actions;
    }

    const shouldResearch = RuleBasedAI.shouldInvestInResearch(stats, analysis, weights);
    const shouldInfrastructure = RuleBasedAI.shouldInvestInInfrastructure(stats, analysis, weights);

    // Apply LLM bans to rule-based behavior
    const canDoResearch = !bans.banTechUpgrades;
    const canDoInfrastructure = !bans.banInfrastructureUpgrades;

    if (intent.focus === "research") {
      if (canDoResearch && shouldResearch) {
        const researchCost = ActionResolver.calculateResearchCost(stats.technologyLevel);
        actions.push({
          id: '',
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
      } else if (canDoInfrastructure && shouldInfrastructure) {
        const infraCost = ActionResolver.calculateInfrastructureCost(stats.infrastructureLevel || 0);
        actions.push({
          id: '',
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

    if (intent.focus === "economy") {
      if (canDoInfrastructure && shouldInfrastructure) {
        const infraCost = ActionResolver.calculateInfrastructureCost(stats.infrastructureLevel || 0);
        actions.push({
          id: '',
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
      } else if (canDoResearch && shouldResearch) {
        const researchCost = ActionResolver.calculateResearchCost(stats.technologyLevel);
        actions.push({
          id: '',
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
      return actions;
    }

    // DECISION 1: Research investment
    if (canDoResearch && shouldResearch) {
      const researchCost = ActionResolver.calculateResearchCost(stats.technologyLevel);
      actions.push({
        id: '', // Will be auto-generated by database
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
    if (actions.length === 0 && canDoInfrastructure && shouldInfrastructure) {
      const infraCost = ActionResolver.calculateInfrastructureCost(stats.infrastructureLevel || 0);
      actions.push({
        id: '', // Will be auto-generated by database
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
   * Attempt to turn LLM "recommendedActions" strings into executable economic actions.
   * Fallback-safe: if an LLM step is not actionable/affordable, we ignore it and
   * let the normal rule-based logic run.
   */
  private tryLLMEconomicActions(
    state: GameStateSnapshot,
    countryId: string,
    intent: StrategyIntent,
    analysis: ReturnType<typeof RuleBasedAI.analyzeEconomicSituation>,
    bans: ReturnType<typeof extractLLMBans>
  ): GameAction[] {
    const stats = state.countryStatsByCountryId[countryId];
    if (!stats) return [];

    const steps = intent.llmPlan?.recommendedActions ?? [];
    if (!Array.isArray(steps) || steps.length === 0) return [];

    const executed = new Set((intent.llmPlan?.executedSteps ?? []).map((s) => String(s ?? "").trim()).filter(Boolean));

    // Avoid duplicating economic upgrades if already pending this turn
    const alreadyHasResearch = state.pendingActions.some(
      (a) => a.countryId === countryId && a.turn === state.turn && a.status === "pending" && a.actionType === "research"
    );
    const alreadyHasInfra = state.pendingActions.some(
      (a) =>
        a.countryId === countryId &&
        a.turn === state.turn &&
        a.status === "pending" &&
        a.actionType === "economic" &&
        (a.actionData as Record<string, unknown>)?.subType === "infrastructure"
    );

    for (const rawStep of steps) {
      const step = String(rawStep ?? "").trim();
      if (!step) continue;

      // Skip pure prohibition steps here (handled via bans)
      if (/\b(refrain|avoid|do\s*not|don't)\b/i.test(step)) {
        continue;
      }

      // If this step is meant to be one-time and we've already executed it during this plan, skip it.
      if (isOneTimeStep(step) && executed.has(step)) {
        continue;
      }

      // Infrastructure directive
      if (!alreadyHasInfra && !bans.banInfrastructureUpgrades && looksLikeInfrastructureUpgradeStep(step)) {
        const currentInfra = stats.infrastructureLevel || 0;
        const desiredLevel = extractTargetInfraLevel(step);
        if (desiredLevel !== null && desiredLevel <= currentInfra) {
          continue; // already satisfied
        }
        if (currentInfra >= 10) continue;
        if (!analysis.canAffordInfrastructure) continue;

        const infraCost = ActionResolver.calculateInfrastructureCost(currentInfra);
        return [
          {
            id: "",
            gameId: state.gameId,
            countryId,
            turn: state.turn,
            actionType: "economic",
            actionData: {
              subType: "infrastructure",
              cost: infraCost,
              targetLevel: currentInfra + 1,
              llmStep: step,
              llmPlanTurn: intent.llmPlan?.turnAnalyzed,
            },
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        ];
      }

      // Research/technology directive
      if (!alreadyHasResearch && !bans.banTechUpgrades && looksLikeTechUpgradeStep(step)) {
        const currentTech = stats.technologyLevel;
        const desiredLevel = extractTargetTechLevel(step);
        if (desiredLevel !== null && desiredLevel <= currentTech) {
          continue; // already satisfied
        }
        if (currentTech >= 5) continue;
        if (!analysis.canAffordResearch) continue;

        // If a range is specified (rare for tech), treat as one-time and just do a single upgrade
        void extractNumberRange;

        const researchCost = ActionResolver.calculateResearchCost(currentTech);
        return [
          {
            id: "",
            gameId: state.gameId,
            countryId,
            turn: state.turn,
            actionType: "research",
            actionData: {
              cost: researchCost,
              targetLevel: currentTech + 1,
              llmStep: step,
              llmPlanTurn: intent.llmPlan?.turnAnalyzed,
            },
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        ];
      }
    }

    return [];
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

