import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import type { City } from "@/types/city";
import { StrategicPlanner } from "@/lib/ai/StrategicPlanner";
import { DiplomacyAI } from "@/lib/ai/DiplomacyAI";
import { EconomicAI } from "@/lib/ai/EconomicAI";
import { MilitaryAI } from "@/lib/ai/MilitaryAI";
import { DefaultPersonality, type AIPersonality } from "@/lib/ai/Personality";

/**
 * Maximum number of LLM-plan-derived actions per country per turn.
 * This prevents plans from being "exhausted" in a single turn.
 * When a plan exists, only this many actions are executed; others wait for future turns.
 * Can be overridden via LLM_PLAN_ACTION_CAP env variable.
 */
const DEFAULT_MAX_LLM_ACTIONS_PER_TURN = 2;
const MAX_LLM_ACTIONS_PER_TURN = process.env.LLM_PLAN_ACTION_CAP 
  ? Math.max(1, parseInt(process.env.LLM_PLAN_ACTION_CAP, 10))
  : DEFAULT_MAX_LLM_ACTIONS_PER_TURN;

/**
 * AI Controller
 * Orchestrates all AI decision-making for a country
 * Uses rule-based logic for 70-80% of decisions (zero LLM cost)
 */
export class AIController {
  private readonly planner: StrategicPlanner;
  private readonly diplomacyAI: DiplomacyAI;
  private readonly economicAI: EconomicAI;
  private readonly militaryAI: MilitaryAI;
  private readonly debugLLMPlan: boolean;

  constructor(personality: AIPersonality = DefaultPersonality) {
    this.planner = new StrategicPlanner(personality);
    this.diplomacyAI = new DiplomacyAI();
    this.economicAI = new EconomicAI(personality);
    this.militaryAI = new MilitaryAI(personality);
    this.debugLLMPlan = process.env.LLM_PLAN_DEBUG === "1";
  }

  /**
   * Generate all actions for a country this turn
   * Phase 2.2: Hybrid approach (rule-based + optional LLM)
   * @param cities - All cities in the game (needed for military attack decisions)
   * @param batchAnalysis - Optional batch LLM analysis (provided by turn API to avoid redundant calls)
   */
  async decideTurnActions(
    state: GameStateSnapshot, 
    countryId: string, 
    cities: City[] = [], 
    batchAnalysis?: any
  ): Promise<GameAction[]> {
    // Step 1: Strategic planning - what should we focus on?
    // Pass batch analysis to avoid redundant LLM calls
    const intent = await this.planner.plan(state, countryId, batchAnalysis);
    
    // Minimal logging (only if debug enabled OR planning failed)
    if (this.debugLLMPlan) {
      const country = state.countries.find(c => c.id === countryId);
      const rationale =
        typeof (intent as any)?.rationale === "string" && (intent as any).rationale.trim()
          ? (intent as any).rationale
          : "No rationale";
      console.log(`[AI Controller] ${country?.name} focus: ${intent.focus} - ${rationale.substring(0, 60)}`);

      if (intent.llmPlan) {
        const planItems = intent.llmPlan.planItems ?? [];
        const stepCount = planItems.filter((i) => i.kind === "step").length;
        const executableCount = planItems.filter((i) => i.kind === "step" && i.execution).length;
        const executedCount = new Set(intent.llmPlan.executedStepIds ?? []).size;

        console.log(
          `[LLM Plan Debug] ${countryId} T${state.turn} planTurn=${intent.llmPlan.turnAnalyzed} validUntil=${intent.llmPlan.validUntilTurn} ` +
            `steps=${stepCount} executable=${executableCount} executed=${executedCount}`
        );
      }
    }
    
    // Step 2: Generate actions based on strategic intent
    const allActions: GameAction[] = [
      // Diplomacy (future: deals, alliances)
      ...this.diplomacyAI.decideActions(state, countryId, intent),
      
      // Economy (research, infrastructure)
      ...this.economicAI.decideActions(state, countryId, intent),
      
      // Military (recruitment, deployment, attacks) - now async and needs cities
      ...(await this.militaryAI.decideActions(state, countryId, intent, cities)),
    ];
    
    // STEP 3: Enforce action cap when LLM plan exists
    // This ensures plans span multiple turns instead of being exhausted in one
    const actions = this.enforceActionCap(allActions, intent, countryId, state.turn);
    
    // Only log if debug enabled or capping occurred
    if (this.debugLLMPlan || (intent.llmPlan && allActions.length > actions.length)) {
      const country = state.countries.find(c => c.id === countryId);
      console.log(`[AI Controller] ${country?.name} generated ${actions.length} action(s)${intent.llmPlan && allActions.length > actions.length ? ` (capped from ${allActions.length})` : ''}`);
    }

    if (this.debugLLMPlan && intent.llmPlan) {
      const fromLLMSteps = actions
        .map((a) => {
          const data = a.actionData as Record<string, unknown>;
          const llmStepId = typeof data?.llmStepId === "string" ? data.llmStepId : null;
          return llmStepId
            ? { actionType: a.actionType, subType: data?.subType, llmStepId }
            : null;
        })
        .filter(Boolean);

      if (fromLLMSteps.length > 0) {
        console.log(`[LLM Plan Debug] ${countryId} executed-from-plan:`, fromLLMSteps);
      } else {
        console.log(`[LLM Plan Debug] ${countryId} executed-from-plan: none`);
      }
    }
    
    return actions;
  }

  /**
   * Enforce action cap for LLM-driven plans to prevent exhaustion in one turn
   * When an LLM plan exists, limit to MAX_LLM_ACTIONS_PER_TURN derived from that plan.
   * Non-LLM actions (rule-based) are not capped.
   */
  private enforceActionCap(
    actions: GameAction[],
    intent: any,
    countryId: string,
    turn: number
  ): GameAction[] {
    // If no LLM plan, return all actions
    if (!intent.llmPlan) {
      return actions;
    }

    // Separate LLM-derived actions from rule-based actions
    const llmDerivedActions: GameAction[] = [];
    const ruleBasedActions: GameAction[] = [];

    for (const action of actions) {
      const data = action.actionData as Record<string, unknown>;
      const hasLLMMetadata = typeof data?.llmStepId === "string" || typeof data?.llmStep === "string";
      if (hasLLMMetadata) {
        llmDerivedActions.push(action);
      } else {
        ruleBasedActions.push(action);
      }
    }

    // If we have too many LLM-derived actions, truncate to cap
    let cappedLLMActions = llmDerivedActions;
    if (llmDerivedActions.length > MAX_LLM_ACTIONS_PER_TURN) {
      cappedLLMActions = llmDerivedActions.slice(0, MAX_LLM_ACTIONS_PER_TURN);
      
      if (process.env.LLM_PLAN_DEBUG === "1") {
        console.log(
          `[LLM Plan Debug] ${countryId} T${turn}: Capped LLM actions from ${llmDerivedActions.length} to ${MAX_LLM_ACTIONS_PER_TURN}`
        );
      }
    }

    // Return capped LLM actions + all rule-based actions (rule-based are not limited)
    return [...cappedLLMActions, ...ruleBasedActions];
  }

  /**
   * Create AI controller with custom personality
   */
  static withPersonality(personality: AIPersonality): AIController {
    return new AIController(personality);
  }

  /**
   * Create AI controller with random personality
   */
  static withRandomPersonality(seed?: string): AIController {
    const rng = seed ? this.createSeededRNG(seed) : Math.random;
    
    const personality: AIPersonality = {
      aggression: rng(),
      cooperativeness: rng(),
      riskTolerance: rng(),
      honesty: 0.5 + rng() * 0.5, // 0.5-1.0 (mostly honest)
    };
    
    return new AIController(personality);
  }

  /**
   * Get LLM cost tracking information
   */
  getCostTracking() {
    return this.planner.getCostTracking();
  }
  
  private static createSeededRNG(seed: string): () => number {
    let seedValue = 0;
    for (let i = 0; i < seed.length; i++) {
      seedValue = ((seedValue << 5) - seedValue) + seed.charCodeAt(i);
      seedValue = seedValue & seedValue;
    }
    
    return function() {
      seedValue = (seedValue * 9301 + 49297) % 233280;
      return seedValue / 233280;
    };
  }
}

