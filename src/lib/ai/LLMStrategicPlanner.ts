/**
 * LLM Strategic Planner - Phase 2.2
 * Uses Gemini Flash for complex strategic decisions
 * Called sparingly (once per 5 turns) to minimize costs
 * Provides high-level strategic guidance that enhances rule-based AI
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import type { CountryStats } from "@/types/country";
import type { StrategyIntent } from "./StrategicPlanner";
import { RuleBasedAI } from "./RuleBasedAI";

export interface LLMStrategicAnalysis {
  strategicFocus: "economy" | "military" | "diplomacy" | "research" | "balanced";
  rationale: string;
  threatAssessment: string;
  opportunityIdentified: string;
  recommendedActions: string[];
  diplomaticStance: Record<string, "friendly" | "neutral" | "hostile">;
  confidenceScore: number; // 0-1
  turnAnalyzed: number;
}

export interface LLMCostTracking {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number; // In USD
  lastCallTimestamp: string;
}

/**
 * Game rules and mechanics that can be cached
 * This data rarely changes and should be part of cached context
 */
const CACHED_GAME_RULES = `
GAME MECHANICS REFERENCE:

ECONOMIC SYSTEM:
- Budget Generation: Population × 15 × (1 + techLevel × 0.25) × (1 + infraLevel × 0.15)
- Resource Production: Base production × techMultiplier × infraMultiplier × profileModifiers
- Population Growth: 2% base rate, affected by food balance
- Maintenance: 1% of budget per turn, 0.8 per military strength

ACTION COSTS:
- Research: 500 × 1.4^currentLevel
- Infrastructure: 600 × 1.3^currentLevel  
- Military Recruitment: 50 per strength point

TECHNOLOGY MULTIPLIERS:
- Level 0: 1.0x
- Level 1: 1.3x
- Level 2: 1.7x
- Level 3: 2.2x
- Level 4: 3.0x
- Level 5: 4.0x (max)

RESOURCE PROFILES:
- Oil Kingdom: 250% oil, 150% coal, 40% gold, 30% gems
- Agriculture: 180% food, 200% timber, 160% water
- Mining Empire: 220% iron, 200% stone, 250% rare_earth
- Technological Hub: 230% aluminum, 180% steel, 160% rare_earth
- Precious Metals: 300% gold, 350% gems
- Balanced Nation: No major bonuses or penalties
- Industrial Complex: 250% coal, 220% steel, 150% iron
- Coastal Hub: 180% water, 140% food, 150% gold

STRATEGIC CONSIDERATIONS:
- Research ROI: Best when < 50 turns to break even
- Infrastructure ROI: Best when < 40 turns to break even
- Military: Maintain 70% of neighbor average strength minimum
- Food: Must produce more than consume (5 per 10k population)
- Technology: Gates advanced capabilities, prioritize early
- Infrastructure: Compounds over time, invest consistently
`;

export class LLMStrategicPlanner {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;
  private costTracking: LLMCostTracking;
  private lastAnalysisCache: Map<string, LLMStrategicAnalysis> = new Map();
  
  // Strategic plan persistence - LLM analysis guides next N turns
  private activeStrategicPlans: Map<string, LLMStrategicAnalysis> = new Map();
  
  // Call LLM every N turns
  private readonly LLM_CALL_FREQUENCY = 5;
  
  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[LLM Planner] No API key found. LLM strategic planning will be disabled.");
      console.warn("[LLM Planner] Set GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY environment variable.");
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Use Gemini 2.5 Flash for best cost/performance ratio
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    }
    
    this.costTracking = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCost: 0,
      lastCallTimestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Determine if LLM should be called this turn
   * Call every 5 turns to balance insight with cost
   */
  shouldCallLLM(turn: number): boolean {
    // Call on turn 1 (game start) and every 5 turns after
    return turn === 1 || turn % this.LLM_CALL_FREQUENCY === 0;
  }
  
  /**
   * Get strategic analysis using LLM
   * This is the expensive operation - call sparingly!
   */
  async analyzeSituation(
    state: GameStateSnapshot,
    countryId: string,
    stats: CountryStats
  ): Promise<LLMStrategicAnalysis | null> {
    // Check if LLM is available
    if (!this.model) {
      console.log(`[LLM Planner] Skipping LLM analysis - no API key configured`);
      return null;
    }
    
    // Check cache first (don't call LLM twice for same turn)
    const cacheKey = `${countryId}-${state.turn}`;
    if (this.lastAnalysisCache.has(cacheKey)) {
      console.log(`[LLM Planner] Using cached analysis for ${countryId} turn ${state.turn}`);
      return this.lastAnalysisCache.get(cacheKey)!;
    }
    
    // Check if we should call LLM this turn
    if (!this.shouldCallLLM(state.turn)) {
      console.log(`[LLM Planner] Skipping LLM call - turn ${state.turn} (frequency: every ${this.LLM_CALL_FREQUENCY} turns)`);
      return null;
    }
    
    try {
      const startTime = Date.now();
      console.log(`[LLM Planner] 🤖 Calling Gemini Flash for strategic analysis (Turn ${state.turn})`);
      
      // Build context-rich prompt
      const prompt = this.buildStrategicPrompt(state, countryId, stats);
      
      // Call Gemini
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();
      
      // Track costs (estimate based on Gemini 2.5 Flash pricing)
      const inputTokens = prompt.length / 4; // Rough estimate: 1 token ≈ 4 chars
      const outputTokens = responseText.length / 4;
      const inputCost = (inputTokens / 1_000_000) * 0.075; // $0.075 per 1M input tokens
      const outputCost = (outputTokens / 1_000_000) * 0.30; // $0.30 per 1M output tokens
      
      this.costTracking.totalCalls++;
      this.costTracking.totalInputTokens += inputTokens;
      this.costTracking.totalOutputTokens += outputTokens;
      this.costTracking.estimatedCost += inputCost + outputCost;
      this.costTracking.lastCallTimestamp = new Date().toISOString();
      
      const duration = Date.now() - startTime;
      console.log(`[LLM Planner] ✓ Analysis complete in ${duration}ms`);
      console.log(`[LLM Planner] 💰 Cost: $${(inputCost + outputCost).toFixed(6)} (Input: ${inputTokens.toFixed(0)} tokens, Output: ${outputTokens.toFixed(0)} tokens)`);
      console.log(`[LLM Planner] 💰 Total session cost: $${this.costTracking.estimatedCost.toFixed(4)} (${this.costTracking.totalCalls} calls)`);
      
      // Parse LLM response into structured analysis
      const analysis = this.parseStrategicAnalysis(responseText, state.turn);
      
      // Cache the result
      this.lastAnalysisCache.set(cacheKey, analysis);
      
      // IMPORTANT: Store as active strategic plan for this country
      // This plan will guide decisions for the next 5 turns
      this.activeStrategicPlans.set(countryId, analysis);
      console.log(`[LLM Planner] 📋 Strategic plan stored for ${countryId} (valid for next ${this.LLM_CALL_FREQUENCY} turns)`);
      
      // Clean old cache entries (keep last 10 turns)
      if (this.lastAnalysisCache.size > 10) {
        const oldestKeys = Array.from(this.lastAnalysisCache.keys()).slice(0, this.lastAnalysisCache.size - 10);
        oldestKeys.forEach(key => this.lastAnalysisCache.delete(key));
      }
      
      return analysis;
    } catch (error) {
      console.error("[LLM Planner] Error calling Gemini:", error);
      if (error instanceof Error) {
        console.error("[LLM Planner] Error details:", error.message);
      }
      return null;
    }
  }
  
  /**
   * Build strategic analysis prompt with rich context
   */
  private buildStrategicPrompt(
    state: GameStateSnapshot,
    countryId: string,
    stats: CountryStats
  ): string {
    const country = state.countries.find(c => c.id === countryId);
    if (!country) return "";
    
    // Get economic analysis from rule-based AI
    const economicAnalysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
    
    // Get neighbor information
    const neighbors = this.getNeighborsSummary(state, countryId);
    
    return `${CACHED_GAME_RULES}

STRATEGIC ANALYSIS REQUEST:

You are the strategic advisor for ${country.name}, an AI-controlled nation in a turn-based strategy game.
Analyze the current situation and provide high-level strategic guidance.

CURRENT SITUATION (Turn ${state.turn}):

YOUR NATION: ${country.name}
- Population: ${stats.population.toLocaleString()}
- Budget: $${stats.budget.toLocaleString()}
- Technology: Level ${stats.technologyLevel}/5
- Infrastructure: Level ${stats.infrastructureLevel || 0}/10
- Military: ${stats.militaryStrength} strength
- Resource Profile: ${stats.resourceProfile?.name || "Balanced Nation"}

ECONOMIC HEALTH:
- Net Income: $${economicAnalysis.netIncome}/turn
- Food Balance: ${economicAnalysis.foodBalance > 0 ? '+' : ''}${economicAnalysis.foodBalance} (${economicAnalysis.foodBalance > 0 ? 'surplus' : 'deficit'})
- Research ROI: ${economicAnalysis.researchROI} turns
- Infrastructure ROI: ${economicAnalysis.infrastructureROI} turns
- Military Status: ${economicAnalysis.isUnderDefended ? 'UNDER-DEFENDED' : 'adequate'} (deficit: ${economicAnalysis.militaryDeficit})

RESOURCES:
${Object.entries(stats.resources).map(([resource, amount]) => `- ${resource}: ${amount}`).join('\n')}

NEIGHBORS:
${neighbors}

THREAT ASSESSMENT:
- Bankruptcy risk: ${economicAnalysis.turnsUntilBankrupt !== null ? `HIGH (${economicAnalysis.turnsUntilBankrupt} turns)` : 'Low'}
- Food crisis: ${economicAnalysis.foodTurnsRemaining !== null ? `HIGH (${economicAnalysis.foodTurnsRemaining} turns)` : 'None'}
- Military threat: ${economicAnalysis.isUnderDefended ? 'MEDIUM-HIGH' : 'Low'}
- Average neighbor strength: ${economicAnalysis.averageNeighborStrength}

STRATEGIC QUESTION:
Given this situation, what should ${country.name}'s strategic focus be for the next ${this.LLM_CALL_FREQUENCY} turns?

Provide a concise strategic analysis in the following format:

FOCUS: [economy/military/diplomacy/research/balanced]
RATIONALE: [One sentence explaining why]
THREATS: [Most critical threats to address]
OPPORTUNITIES: [Key opportunities to exploit]
ACTIONS: [3-5 specific recommended actions]
DIPLOMACY: [Suggested stance toward each neighbor: friendly/neutral/hostile]
CONFIDENCE: [0.0-1.0 confidence in this strategy]

Be strategic, realistic, and consider the long-term implications.`;
  }
  
  /**
   * Get summary of neighboring countries
   */
  private getNeighborsSummary(state: GameStateSnapshot, countryId: string): string {
    const country = state.countries.find(c => c.id === countryId);
    if (!country) return "None";
    
    const neighborDistance = 200;
    const neighbors: string[] = [];
    
    for (const otherCountry of state.countries) {
      if (otherCountry.id === countryId) continue;
      
      const distance = Math.sqrt(
        Math.pow(country.positionX - otherCountry.positionX, 2) +
        Math.pow(country.positionY - otherCountry.positionY, 2)
      );
      
      if (distance < neighborDistance) {
        const otherStats = state.countryStatsByCountryId[otherCountry.id];
        if (otherStats) {
          neighbors.push(
            `- ${otherCountry.name}: Military ${otherStats.militaryStrength}, Tech ${otherStats.technologyLevel}, Budget $${otherStats.budget.toLocaleString()}`
          );
        }
      }
    }
    
    return neighbors.length > 0 ? neighbors.join('\n') : "No immediate neighbors";
  }
  
  /**
   * Parse LLM response into structured analysis
   */
  private parseStrategicAnalysis(response: string, turn: number): LLMStrategicAnalysis {
    const lines = response.split('\n');
    
    // Extract fields using simple parsing
    let strategicFocus: LLMStrategicAnalysis["strategicFocus"] = "balanced";
    let rationale = "";
    let threatAssessment = "";
    let opportunityIdentified = "";
    let recommendedActions: string[] = [];
    let diplomaticStance: Record<string, "friendly" | "neutral" | "hostile"> = {};
    let confidenceScore = 0.7; // Default confidence
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("FOCUS:")) {
        const focus = trimmed.substring(6).trim().toLowerCase();
        if (["economy", "military", "diplomacy", "research", "balanced"].includes(focus)) {
          strategicFocus = focus as any;
        }
      } else if (trimmed.startsWith("RATIONALE:")) {
        rationale = trimmed.substring(10).trim();
      } else if (trimmed.startsWith("THREATS:")) {
        threatAssessment = trimmed.substring(8).trim();
      } else if (trimmed.startsWith("OPPORTUNITIES:")) {
        opportunityIdentified = trimmed.substring(14).trim();
      } else if (trimmed.startsWith("ACTIONS:")) {
        const actionsText = trimmed.substring(8).trim();
        recommendedActions = actionsText.split(/[,;]/).map(a => a.trim()).filter(Boolean);
      } else if (trimmed.startsWith("CONFIDENCE:")) {
        const conf = parseFloat(trimmed.substring(11).trim());
        if (!isNaN(conf)) confidenceScore = Math.min(1, Math.max(0, conf));
      }
      
      // Parse diplomatic stances (simple heuristic)
      if (trimmed.toLowerCase().includes("friendly") || trimmed.toLowerCase().includes("hostile") || trimmed.toLowerCase().includes("neutral")) {
        // Extract country names and stances (basic implementation)
        // This could be enhanced with better parsing
      }
    }
    
    // If parsing failed, extract from full response
    if (!rationale) {
      rationale = response.substring(0, 200);
    }
    
    return {
      strategicFocus,
      rationale: rationale || "Strategic analysis completed",
      threatAssessment: threatAssessment || "Normal threat level",
      opportunityIdentified: opportunityIdentified || "Multiple opportunities available",
      recommendedActions: recommendedActions.length > 0 ? recommendedActions : ["Continue balanced development"],
      diplomaticStance,
      confidenceScore,
      turnAnalyzed: turn,
    };
  }
  
  /**
   * Get active strategic plan for a country (if exists and still valid)
   * This allows LLM analysis to persist across turns
   */
  getActiveStrategicPlan(countryId: string, currentTurn: number): LLMStrategicAnalysis | null {
    const plan = this.activeStrategicPlans.get(countryId);
    if (!plan) return null;
    
    // Check if plan is still valid (within LLM_CALL_FREQUENCY turns)
    const turnsSincePlan = currentTurn - plan.turnAnalyzed;
    if (turnsSincePlan >= 0 && turnsSincePlan < this.LLM_CALL_FREQUENCY) {
      return plan;
    }
    
    // Plan expired, remove it
    this.activeStrategicPlans.delete(countryId);
    return null;
  }
  
  /**
   * Convert LLM analysis to StrategyIntent for use by AIController
   * Phase 2.2+: Now checks for active strategic plans
   */
  enhanceStrategyIntent(
    llmAnalysis: LLMStrategicAnalysis | null,
    ruleBasedIntent: StrategyIntent,
    currentTurn: number,
    countryId: string
  ): StrategyIntent {
    // Check if there's an active strategic plan (from previous LLM call)
    const activePlan = this.getActiveStrategicPlan(countryId, currentTurn);
    const guidingAnalysis = llmAnalysis || activePlan;
    
    // If no LLM guidance (new or cached), use rule-based intent
    if (!guidingAnalysis) {
      return ruleBasedIntent;
    }
    
    // Determine if this is a fresh LLM call or using cached plan
    const planAge = currentTurn - guidingAnalysis.turnAnalyzed;
    const planSource = planAge === 0 ? "Fresh LLM" : `LLM (T${guidingAnalysis.turnAnalyzed}, ${planAge}t ago)`;
    
    // Combine LLM insight with rule-based safety
    // LLM provides strategic direction, rules ensure execution safety
    return {
      focus: guidingAnalysis.strategicFocus,
      rationale: `[${planSource}] ${guidingAnalysis.rationale}`,
    };
  }
  
  /**
   * Get cost tracking information
   */
  getCostTracking(): LLMCostTracking {
    return { ...this.costTracking };
  }
  
  /**
   * Reset cost tracking (useful for testing)
   */
  resetCostTracking(): void {
    this.costTracking = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCost: 0,
      lastCallTimestamp: new Date().toISOString(),
    };
  }
}
