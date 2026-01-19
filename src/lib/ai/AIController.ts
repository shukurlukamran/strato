import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
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

  constructor(personality: AIPersonality = DefaultPersonality) {
    this.planner = new StrategicPlanner(personality);
    this.diplomacyAI = new DiplomacyAI();
    this.economicAI = new EconomicAI(personality);
    this.militaryAI = new MilitaryAI(personality);
  }

  /**
   * Generate all actions for a country this turn
   * Uses rule-based decision making (no LLM cost)
   */
  decideTurnActions(state: GameStateSnapshot, countryId: string): GameAction[] {
    // Step 1: Strategic planning - what should we focus on?
    const intent = this.planner.plan(state, countryId);
    
    console.log(`[AI Controller] Country ${countryId} strategic focus: ${intent.focus} - ${intent.rationale}`);
    
    // Step 2: Generate actions based on strategic intent
    const actions: GameAction[] = [
      // Diplomacy (future: deals, alliances)
      ...this.diplomacyAI.decideActions(state, countryId, intent),
      
      // Economy (research, infrastructure)
      ...this.economicAI.decideActions(state, countryId, intent),
      
      // Military (recruitment, deployment)
      ...this.militaryAI.decideActions(state, countryId, intent),
    ];
    
    console.log(`[AI Controller] Country ${countryId} generated ${actions.length} action(s)`);
    
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

