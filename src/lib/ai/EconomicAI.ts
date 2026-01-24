import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { RuleBasedAI } from "./RuleBasedAI";
import { ActionPricing } from "@/lib/game-engine/ActionPricing";
import { DefaultPersonality, type AIPersonality } from "./Personality";
import {
  extractLLMBans,
  extractLLMBansFromProhibitTokens,
  mergeBans,
  extractNumberRange,
  extractTargetInfraLevel,
  extractTargetTechLevel,
  isOneTimeStep,
  instructionLooksConditional,
  looksLikeInfrastructureUpgradeStep,
  looksLikeTechUpgradeStep,
} from "@/lib/ai/LLMPlanInterpreter";
import type { LLMPlanItem } from "@/lib/ai/LLMStrategicPlanner";

/**
 * Economic AI Decision Maker
 * Uses rule-based logic to decide on economic actions (research, infrastructure)
 */
export class EconomicAI {
  private personality: AIPersonality;
  private readonly debugLLMPlan: boolean;

  constructor(personality: AIPersonality = DefaultPersonality) {
    this.personality = personality;
    this.debugLLMPlan = process.env.LLM_PLAN_DEBUG === "1";
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
    const bans = this.getEffectiveBans(intent, llmSteps);

    // PRIORITY: Follow LLM action steps (when present) before rule-based heuristics.
    // This ensures "recommendedActions" actually influence gameplay, not just logs.
    const llmPreferred = this.tryLLMEconomicActions(state, countryId, intent, analysis, bans);
    if (llmPreferred.length > 0) {
      return llmPreferred;
    }
    
    // CRITICAL FIX: If LLM has strategic guidance but no executable economic steps,
    // use rule-based logic BUT respect the LLM's strategic focus.
    // This prevents contradictions like "LLM says economy, AI does research".
    const hasLLMGuidance = intent.llmPlan && (intent.rationale.includes("LLM") || intent.rationale.includes("Fresh"));
    
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
    
    // CRITICAL: If LLM guidance exists and focus is not economy/research/balanced,
    // don't do economic actions to avoid contradicting LLM strategy
    if (hasLLMGuidance && intent.focus === "military") {
      console.log(`[EconomicAI] Respecting LLM focus (${intent.focus}) - skipping economic actions`);
      return actions;
    }

    const shouldResearch = RuleBasedAI.shouldInvestInResearch(stats, analysis, weights);
    const shouldInfrastructure = RuleBasedAI.shouldInvestInInfrastructure(stats, analysis, weights);

    // Apply LLM bans to rule-based behavior
    const canDoResearch = !bans.banTechUpgrades;
    const canDoInfrastructure = !bans.banInfrastructureUpgrades;

    if (intent.focus === "research") {
      if (canDoResearch && shouldResearch) {
        const pricingResult = ActionPricing.calculateResearchPricing(stats);
        if (hasLLMGuidance) {
          console.log(`[EconomicAI] Following LLM focus (research) with rule-based execution`);
        }
        actions.push({
          id: '',
          gameId: state.gameId,
          countryId,
          turn: state.turn,
          actionType: "research",
          actionData: {
            cost: pricingResult.cost,
            targetLevel: stats.technologyLevel + 1,
          },
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      } else if (canDoInfrastructure && shouldInfrastructure) {
        const pricingResult = ActionPricing.calculateInfrastructurePricing(stats);
        if (hasLLMGuidance) {
          console.log(`[EconomicAI] Following LLM focus (research) with infrastructure fallback`);
        }
        actions.push({
          id: '',
          gameId: state.gameId,
          countryId,
          turn: state.turn,
          actionType: "economic",
          actionData: {
            subType: "infrastructure",
            cost: pricingResult.cost,
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
        const pricingResult = ActionPricing.calculateInfrastructurePricing(stats);
        if (hasLLMGuidance) {
          console.log(`[EconomicAI] Following LLM focus (economy) with infrastructure upgrade`);
        }
        actions.push({
          id: '',
          gameId: state.gameId,
          countryId,
          turn: state.turn,
          actionType: "economic",
          actionData: {
            subType: "infrastructure",
            cost: pricingResult.cost,
            targetLevel: (stats.infrastructureLevel || 0) + 1,
          },
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      } else if (canDoResearch && shouldResearch) {
        const pricingResult = ActionPricing.calculateResearchPricing(stats);
        if (hasLLMGuidance) {
          console.log(`[EconomicAI] Following LLM focus (economy) with research fallback`);
        }
        actions.push({
          id: '',
          gameId: state.gameId,
          countryId,
          turn: state.turn,
          actionType: "research",
          actionData: {
            cost: pricingResult.cost,
            targetLevel: stats.technologyLevel + 1,
          },
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }
      return actions;
    }

    // FALLBACK: Generic rule-based logic for focuses not handled above
    // At this point, focus can only be: "balanced", "military", or "diplomacy"
    // ("economy" and "research" already returned above)
    
    // DECISION 1: Research investment
    if (canDoResearch && shouldResearch) {
      const pricingResult = ActionPricing.calculateResearchPricing(stats);
      if (hasLLMGuidance) {
        console.log(`[EconomicAI] Fallback: Rule-based research decision (LLM focus: ${intent.focus})`);
      }
      actions.push({
        id: '', // Will be auto-generated by database
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "research",
        actionData: {
          cost: pricingResult.cost,
          targetLevel: stats.technologyLevel + 1,
        },
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    // DECISION 2: Infrastructure investment
    // Only if we didn't research this turn (one major investment per turn)
    if (actions.length === 0 && canDoInfrastructure && shouldInfrastructure) {
      const pricingResult = ActionPricing.calculateInfrastructurePricing(stats);
      if (hasLLMGuidance) {
        console.log(`[EconomicAI] Fallback: Rule-based infrastructure decision (LLM focus: ${intent.focus})`);
      }
      actions.push({
        id: '', // Will be auto-generated by database
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "economic",
        actionData: {
          subType: "infrastructure",
          cost: pricingResult.cost,
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

    const executed = new Set((intent.llmPlan?.executedStepIds ?? []).map((s) => String(s ?? "").trim()).filter(Boolean));

    // Prefer structured plan items when available
    const planItems = intent.llmPlan?.planItems ?? [];
    if (Array.isArray(planItems) && planItems.length > 0) {
      // Allow multiple actions per turn (player can do multiple too).
      // We keep it conservative: at most 2 economic actions (typically 1 research + 1 infra).
      let remainingBudget = stats.budget;
      const chosenThisTurn = new Set<string>();
      const out: GameAction[] = [];

      for (let i = 0; i < 2; i++) {
        const step = this.pickNextExecutableEconomicStep(planItems, executed, stats, bans, chosenThisTurn);
        if (!step || !step.execution) break;
        const built = this.buildEconomicActionFromStep(
          state,
          countryId,
          step,
          analysis,
          bans,
          intent.llmPlan?.turnAnalyzed
        );
        if (!built) {
          chosenThisTurn.add(step.id);
          continue;
        }

        const cost = Number((built.actionData as any)?.cost ?? 0);
        if (Number.isFinite(cost) && cost > 0 && cost <= remainingBudget) {
          out.push(built);
          remainingBudget -= cost;
          chosenThisTurn.add(step.id);
        } else {
          // Can't afford this step this turn; stop trying further economic steps.
          chosenThisTurn.add(step.id);
          break;
        }
      }

      return out;
    }

    // Legacy fallback: parse free-text recommendedActions
    const steps = intent.llmPlan?.recommendedActions ?? [];
    if (!Array.isArray(steps) || steps.length === 0) return [];

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

        const pricingResult = ActionPricing.calculateInfrastructurePricing(stats);
        return [
          {
            id: "",
            gameId: state.gameId,
            countryId,
            turn: state.turn,
            actionType: "economic",
            actionData: {
              subType: "infrastructure",
              cost: pricingResult.cost,
              targetLevel: currentInfra + 1,
              llmStep: step,
              llmStepId: step,
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

        const pricingResult = ActionPricing.calculateResearchPricing(stats);
        return [
          {
            id: "",
            gameId: state.gameId,
            countryId,
            turn: state.turn,
            actionType: "research",
            actionData: {
              cost: pricingResult.cost,
              targetLevel: currentTech + 1,
              llmStep: step,
              llmStepId: step,
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

  private getEffectiveBans(intent: StrategyIntent, legacySteps: string[]): ReturnType<typeof extractLLMBans> {
    let bans = extractLLMBans(legacySteps);
    const planItems = intent.llmPlan?.planItems ?? [];
    for (const item of planItems) {
      if (item && item.kind === "constraint") {
        bans = mergeBans(bans, extractLLMBansFromProhibitTokens(item.effects?.prohibit, item.instruction));
        // Also treat the constraint instruction as legacy text for negation parsing (best-effort)
        bans = mergeBans(bans, extractLLMBans([item.instruction]));
      }
    }
    return bans;
  }

  private pickNextExecutableEconomicStep(
    planItems: LLMPlanItem[],
    executed: Set<string>,
    stats: { technologyLevel: number; infrastructureLevel?: number; budget: number },
    bans: ReturnType<typeof extractLLMBans>,
    chosenThisTurn?: Set<string>
  ): Extract<LLMPlanItem, { kind: "step" }> | null {
    const steps = planItems
      .filter((i): i is Extract<LLMPlanItem, { kind: "step" }> => i.kind === "step")
      .slice()
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

    if (this.debugLLMPlan) {
      const coverage = {
        total: steps.length,
        executed: 0,
        stopMet: 0,
        noExecution: 0,
        wrongDomain: 0,
        whenUnmet: 0,
        banned: 0,
        actionable: 0,
      };

      const skippedReasons: Record<string, string[]> = {
        stopMet: [],
        executed: [],
        noExecution: [],
        wrongDomain: [],
        whenUnmet: [],
        banned: [],
      };

      for (const s of steps) {
        if (this.isStopConditionMet(s.stop_when, stats)) {
          coverage.stopMet++;
          skippedReasons.stopMet.push(s.id);
          continue;
        }
        // IMPORTANT: If a step has stop_when, it can be executed multiple turns until completion.
        // In that case, do NOT treat "executed once" as completed.
        if (!s.stop_when && executed.has(s.id)) {
          coverage.executed++;
          skippedReasons.executed.push(s.id);
          continue;
        }
        if (chosenThisTurn?.has(s.id)) {
          coverage.executed++;
          skippedReasons.executed.push(s.id);
          continue;
        }
        if (!s.execution) {
          coverage.noExecution++;
          skippedReasons.noExecution.push(`${s.id} (${s.instruction.substring(0, 50)}...)`);
          continue;
        }
        if (s.execution.actionType !== "research" && s.execution.actionType !== "economic") {
          coverage.wrongDomain++;
          skippedReasons.wrongDomain.push(s.id);
          continue;
        }
        // Safety guard: conditional instructions must provide `when`
        if (!s.when && instructionLooksConditional(s.instruction)) {
          coverage.whenUnmet++;
          skippedReasons.whenUnmet.push(s.id);
          continue;
        }
        if (!this.isWhenConditionMet(s.when, stats)) {
          coverage.whenUnmet++;
          skippedReasons.whenUnmet.push(s.id);
          continue;
        }
        if (bans.banTechUpgrades && s.execution.actionType === "research") {
          coverage.banned++;
          skippedReasons.banned.push(`${s.id} (research banned)`);
          continue;
        }
        if (bans.banInfrastructureUpgrades && s.execution.actionType === "economic") {
          coverage.banned++;
          skippedReasons.banned.push(`${s.id} (infrastructure banned)`);
          continue;
        }
        coverage.actionable++;
      }

      console.log(`[LLM Plan Debug] Economic coverage:`, coverage);
      
      // Log non-executable steps so they're visible
      if (skippedReasons.noExecution.length > 0) {
        console.log(`[LLM Plan Debug] Non-executable economic steps (e.g., trading):`, skippedReasons.noExecution);
      }
      if (skippedReasons.banned.length > 0) {
        console.log(`[LLM Plan Debug] Banned economic steps:`, skippedReasons.banned);
      }
    }

    for (const s of steps) {
      // Completed by stop_when
      if (this.isStopConditionMet(s.stop_when, stats)) continue;
      // Completed by execution only when this is a one-time step (no stop_when)
      if (!s.stop_when && executed.has(s.id)) continue;
      if (chosenThisTurn?.has(s.id)) continue;
      // Must have executable payload
      if (!s.execution) continue;
      // Must be economic-related actionType
      if (s.execution.actionType !== "research" && s.execution.actionType !== "economic") continue;
      // Safety guard: conditional instructions must provide `when`
      if (!s.when && instructionLooksConditional(s.instruction)) continue;
      // Must satisfy gating
      if (!this.isWhenConditionMet(s.when, stats)) continue;
      // Must respect bans
      if (bans.banTechUpgrades && s.execution.actionType === "research") continue;
      if (bans.banInfrastructureUpgrades && s.execution.actionType === "economic") continue;
      
      if (this.debugLLMPlan) {
        console.log(`[LLM Plan Debug] Selected economic step: ${s.id} (priority: ${s.priority ?? 'none'}, instruction: "${s.instruction.substring(0, 60)}...")`);
      }
      return s;
    }
    
    if (this.debugLLMPlan && steps.length > 0) {
      // Collect diagnostics about why steps were filtered
      const reasons = { wrongDomain: 0, noExecution: 0, alreadyDone: 0, gatingFailed: 0 };
      const wrongDomainSteps: Array<{id: string, type: string}> = [];
      
      for (const s of steps) {
        if (!s.execution) {
          reasons.noExecution++;
          continue;
        }
        if (s.execution.actionType !== "research" && s.execution.actionType !== "economic") {
          reasons.wrongDomain++;
          wrongDomainSteps.push({id: s.id, type: s.execution.actionType});
          continue;
        }
        if (this.isStopConditionMet(s.stop_when, stats)) {
          reasons.alreadyDone++;
          continue;
        }
        if (!s.stop_when && executed.has(s.id)) {
          reasons.alreadyDone++;
          continue;
        }
        if (!this.isWhenConditionMet(s.when, stats)) {
          reasons.gatingFailed++;
          continue;
        }
      }
      
      console.log(`[LLM Plan Debug] No actionable economic step found (all ${steps.length} steps filtered):`, reasons);
      if (wrongDomainSteps.length > 0) {
        // PHASE 4: Enhanced filtering log
        console.log(`[Economic AI] ⚠️ Filtered ${wrongDomainSteps.length} steps with wrong actionType (expected research|economic):`);
        wrongDomainSteps.forEach(step => {
          console.log(`[Economic AI]   - ${step.id}: ${step.type}`);
        });
      }
    }
    return null;
  }

  private isWhenConditionMet(when: Record<string, unknown> | undefined, stats: { technologyLevel: number; infrastructureLevel?: number; budget: number }): boolean {
    if (!when) return true;
    const tech = stats.technologyLevel;
    const infra = stats.infrastructureLevel ?? 0;
    const budget = stats.budget;
    const techGte = typeof when.tech_level_gte === "number" ? when.tech_level_gte : undefined;
    const infraGte = typeof when.infra_level_gte === "number" ? when.infra_level_gte : undefined;
    const budgetGte = typeof when.budget_gte === "number" ? when.budget_gte : undefined;
    if (typeof techGte === "number" && tech < techGte) return false;
    if (typeof infraGte === "number" && infra < infraGte) return false;
    if (typeof budgetGte === "number" && budget < budgetGte) return false;
    return true;
  }

  private isStopConditionMet(stop: Record<string, unknown> | undefined, stats: { technologyLevel: number; infrastructureLevel?: number; budget: number }): boolean {
    if (!stop) return false;
    const tech = stats.technologyLevel;
    const infra = stats.infrastructureLevel ?? 0;
    const budget = stats.budget;
    const techGte = typeof stop.tech_level_gte === "number" ? stop.tech_level_gte : undefined;
    const infraGte = typeof stop.infra_level_gte === "number" ? stop.infra_level_gte : undefined;
    const budgetGte = typeof stop.budget_gte === "number" ? stop.budget_gte : undefined;
    if (typeof techGte === "number" && tech >= techGte) return true;
    if (typeof infraGte === "number" && infra >= infraGte) return true;
    if (typeof budgetGte === "number" && budget >= budgetGte) return true;
    return false;
  }

  private buildEconomicActionFromStep(
    state: GameStateSnapshot,
    countryId: string,
    step: Extract<LLMPlanItem, { kind: "step" }>,
    analysis: ReturnType<typeof RuleBasedAI.analyzeEconomicSituation>,
    bans: ReturnType<typeof extractLLMBans>,
    llmPlanTurn: number | undefined
  ): GameAction | null {
    const stats = state.countryStatsByCountryId[countryId];
    if (!stats || !step.execution) return null;

    if (step.execution.actionType === "research") {
      if (bans.banTechUpgrades) return null;
      if (!analysis.canAffordResearch) return null;
      // No cap on tech level - unlimited upgrades supported

      const desired = Number((step.execution.actionData as any)?.targetLevel ?? stats.technologyLevel + 1);
      const targetLevel =
        Number.isFinite(desired) && desired > stats.technologyLevel ? Math.floor(desired) : stats.technologyLevel + 1;
      const pricingResult = ActionPricing.calculateResearchPricing(stats);

      return {
        id: "",
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "research",
        actionData: {
          cost: pricingResult.cost,
          targetLevel,
          llmStepId: step.id,
          llmStep: step.instruction,
          llmPlanTurn,
        },
        status: "pending",
        createdAt: new Date().toISOString(),
      };
    }

    if (step.execution.actionType === "economic") {
      const subType = (step.execution.actionData as any)?.subType;
      if (subType !== "infrastructure") return null;
      if (bans.banInfrastructureUpgrades) return null;
      if (!analysis.canAffordInfrastructure) return null;
      const currentInfra = stats.infrastructureLevel || 0;
      if (currentInfra >= 10) return null;

      const desired = Number((step.execution.actionData as any)?.targetLevel ?? currentInfra + 1);
      const targetLevel =
        Number.isFinite(desired) && desired > currentInfra ? Math.min(10, Math.floor(desired)) : currentInfra + 1;
      const pricingResult = ActionPricing.calculateInfrastructurePricing(stats);

      return {
        id: "",
        gameId: state.gameId,
        countryId,
        turn: state.turn,
        actionType: "economic",
        actionData: {
          subType: "infrastructure",
          cost: pricingResult.cost,
          targetLevel,
          llmStepId: step.id,
          llmStep: step.instruction,
          llmPlanTurn,
        },
        status: "pending",
        createdAt: new Date().toISOString(),
      };
    }

    return null;
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

