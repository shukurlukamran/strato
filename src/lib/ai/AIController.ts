import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import type { City } from "@/types/city";
import { StrategicPlanner } from "@/lib/ai/StrategicPlanner";
import { DiplomacyAI } from "@/lib/ai/DiplomacyAI";
import { EconomicAI } from "@/lib/ai/EconomicAI";
import { MilitaryAI } from "@/lib/ai/MilitaryAI";
import { DefaultPersonality, type AIPersonality } from "@/lib/ai/Personality";

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
   */
  async decideTurnActions(state: GameStateSnapshot, countryId: string, cities: City[] = []): Promise<GameAction[]> {
    // Step 1: Strategic planning - what should we focus on?
    // This may call LLM if it's the right turn (every 5 turns)
    const intent = await this.planner.plan(state, countryId);
    
    console.log(`[AI Controller] Country ${countryId} strategic focus: ${intent.focus} - ${intent.rationale}`);

    if (this.debugLLMPlan && intent.llmPlan) {
      const planItems = intent.llmPlan.planItems ?? [];
      const stepCount = planItems.filter((i) => i.kind === "step").length;
      const constraintCount = planItems.filter((i) => i.kind === "constraint").length;
      const executableCount = planItems.filter((i) => i.kind === "step" && i.execution).length;
      const executedCount = new Set(intent.llmPlan.executedStepIds ?? []).size;

      console.log(
        `[LLM Plan Debug] ${countryId} T${state.turn} planTurn=${intent.llmPlan.turnAnalyzed} validUntil=${intent.llmPlan.validUntilTurn} ` +
          `steps=${stepCount} executable=${executableCount} constraints=${constraintCount} executed=${executedCount}`
      );
    }
    
    // Step 2: Generate actions based on strategic intent
    const actions: GameAction[] = [
      // Diplomacy (future: deals, alliances)
      ...this.diplomacyAI.decideActions(state, countryId, intent),
      
      // Economy (research, infrastructure)
      ...this.economicAI.decideActions(state, countryId, intent),
      
      // Military (recruitment, deployment, attacks) - now async and needs cities
      ...(await this.militaryAI.decideActions(state, countryId, intent, cities)),
    ];
    
    console.log(`[AI Controller] Country ${countryId} generated ${actions.length} action(s)`);

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

