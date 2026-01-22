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
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getDiplomaticScore } from "@/lib/game-engine/DiplomaticRelations";

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
 * UPDATED: Economic redesign - Tech and Infra have distinct roles
 */
const CACHED_GAME_RULES = `
GAME MECHANICS (v2.0 - Redesign):

TECHNOLOGY (Production & Military):
- Resource Production: Base × techMultiplier × profileModifiers
- Tech Multipliers: L0=1.0x, L1=1.25x, L2=1.6x, L3=2.0x, L4=2.5x, L5=3.0x
- Military Effectiveness: +20% per level (Level 3 = 60% stronger army)
- Military Cost: -5% per level (max -25%)
- Upgrade Cost: 800 × 1.35^level × profileMod (varies by profile)

INFRASTRUCTURE (Capacity & Admin):
- Tax Collection: +12% per level (ONLY infra affects tax, NOT tech!)
- Population Capacity: 200k + (50k × level). OVERCROWDING if exceeded = -50% growth, -20% tax
- Trade Capacity: 2 + level (max deals per turn)
- Trade Efficiency: +10% per level
- Maintenance: 35 per level per turn
- Upgrade Cost: 700 × 1.30^level × profileMod

BUDGET:
- Tax: Population/10k × 12 × infraBonus × capacityPenalty × profileMod
- Military Upkeep: 0.8 per strength
- Maintenance: 1% of treasury

PROFILE COST MODIFIERS:
- Tech Hub: 0.75x tech, 0.90x military (cheap tech & army)
- Industrial: 0.80x infra, 1.10x trade (cheap infrastructure)
- Coastal Hub: 0.85x infra, 1.25x trade (trade powerhouse)
- Agriculture/Mining: 1.15x tech (expensive, focus resources)
- Precious Metals: 1.20x everything (wealthy but inefficient)

KEY CHANGES:
- Tech NO LONGER affects tax! Only production & military
- Infra NO LONGER affects production! Only capacity & admin
- Population caps force infra investment
- Profiles significantly affect upgrade costs
- Military tech bonus makes Level 3+ armies much stronger

STRATEGIC PRIORITIES:
- Tech Hub: Rush tech for production & military advantage
- Industrial/Coastal: Build infra for trade & capacity
- Resource Nations: Export resources to afford expensive upgrades
- Watch population capacity! Overcrowding hurts growth & economy
- Military power scales with tech - Level 3+ makes big difference
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

  private getPlanKey(gameId: string, countryId: string): string {
    return `${gameId}:${countryId}`;
  }
  
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
   * Call on turn 2, then every 5 turns (2, 5, 10, 15, 20...)
   */
  shouldCallLLM(turn: number): boolean {
    // Call on turn 2 (after initial setup), then every 5 turns after that
    return turn === 2 || (turn >= 5 && turn % this.LLM_CALL_FREQUENCY === 0);
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
      const planKey = this.getPlanKey(state.gameId, countryId);
      this.activeStrategicPlans.set(planKey, analysis);
      await this.persistStrategicPlan(state.gameId, countryId, analysis);
      
      // Enhanced logging for development
      const country = state.countries.find(c => c.id === countryId);
      const countryName = country?.name || countryId;
      const neighborDistance = 200;
      const currentNeighborRelations = country
        ? state.countries
            .filter((c) => c.id !== countryId)
            .map((other) => {
              const dx = country.positionX - other.positionX;
              const dy = country.positionY - other.positionY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              return { other, distance };
            })
            .filter(({ distance }) => distance < neighborDistance)
            .map(({ other }) => {
              const otherStats = state.countryStatsByCountryId[other.id];
              const ourToThem = getDiplomaticScore(stats.diplomaticRelations, other.id);
              const theirToUs = getDiplomaticScore(otherStats?.diplomaticRelations, countryId);
              return `${other.name} (${other.id}): our→them ${ourToThem}/100, them→us ${theirToUs}/100`;
            })
        : [];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`🤖 LLM STRATEGIC DECISION - Turn ${state.turn}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`Country: ${countryName} (${countryId})`);
      if (currentNeighborRelations.length > 0) {
        console.log(`Current Diplomatic Relations (neighbors):`);
        currentNeighborRelations.forEach((line) => console.log(`  - ${line}`));
      }
      console.log(`Focus: ${analysis.strategicFocus.toUpperCase()}`);
      console.log(`Rationale: ${analysis.rationale}`);
      console.log(`Threats: ${analysis.threatAssessment}`);
      console.log(`Opportunities: ${analysis.opportunityIdentified}`);
      console.log(`Recommended Actions:`);
      analysis.recommendedActions.forEach((action, i) => {
        console.log(`  ${i + 1}. ${action}`);
      });
      // Note: diplomaticStance is the LLM's recommended posture, which may differ from the game's
      // current diplomatic relation scores shown in the UI. We log both to avoid confusion.
      console.log(`LLM Diplomatic Stance (recommended):`, analysis.diplomaticStance);
      console.log(`Confidence: ${(analysis.confidenceScore * 100).toFixed(0)}%`);
      console.log(`Plan Valid Until: Turn ${state.turn + this.LLM_CALL_FREQUENCY - 1}`);
      console.log(`${'='.repeat(80)}\n`);
      
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
    const neighbors = this.getNeighborsSummary(state, countryId, stats);
    
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

IMPORTANT: You must respond with ONLY valid JSON in the following exact format (no markdown, no extra text):

{
  "focus": "economy" | "military" | "diplomacy" | "research" | "balanced",
  "rationale": "One concise sentence explaining your strategic choice (max 150 characters)",
  "threats": "Specific threats this country faces (e.g., 'Neighbor military 180 vs our 60, food shortage in 3 turns')",
  "opportunities": "Specific opportunities to exploit (e.g., 'Excellent Research ROI of 15 turns, abundant iron resources')",
  "actions": [
    "Specific action 1 (e.g., 'Build infrastructure to level 3 immediately')",
    "Specific action 2 (e.g., 'Recruit 20 military units to address deficit')",
    "Specific action 3 (e.g., 'Research technology to leverage 2.2x multiplier')",
    "Specific action 4 (optional)",
    "Specific action 5 (optional)"
  ],
  "diplomacy": {
${neighbors
  .split('\n')
  .filter(n => n.trim())
  .map(n => {
    // Neighbor lines are formatted as: "- <Name> (<id>): ..."
    const match = n.match(/- .*\\(([^)]+)\\):/);
    return match ? `    "${match[1].trim()}": "neutral"` : '';
  })
  .filter(Boolean)
  .join(',\n')}
  },
  "confidence": 0.85
}

CRITICAL RULES:
1. Return ONLY the JSON object (no markdown code blocks, no extra text)
2. "actions" must contain 3-5 SPECIFIC, actionable items (NOT "Continue balanced development")
3. "diplomacy" must include ALL neighbors listed above with stance: "friendly", "neutral", or "hostile"
4. IMPORTANT: keys in "diplomacy" MUST be the NEIGHBOR COUNTRY IDs (the values inside parentheses), NOT country names
5. "threats" and "opportunities" must be SPECIFIC with numbers and details
6. "rationale" must be under 150 characters
7. All text fields must be complete (not truncated)

Be strategic, realistic, and consider long-term implications.`;
  }
  
  /**
   * Get summary of neighboring countries
   */
  private getNeighborsSummary(state: GameStateSnapshot, countryId: string, stats: CountryStats): string {
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
          // IMPORTANT: Include real diplomatic relations so the LLM doesn't assume "neutral" incorrectly.
          const ourToThem = getDiplomaticScore(stats.diplomaticRelations, otherCountry.id);
          const theirToUs = getDiplomaticScore(otherStats.diplomaticRelations, countryId);
          neighbors.push(
            `- ${otherCountry.name} (${otherCountry.id}): Relations our→them ${ourToThem}/100, them→us ${theirToUs}/100, Military ${otherStats.militaryStrength}, Tech ${otherStats.technologyLevel}, Budget $${otherStats.budget.toLocaleString()}`
          );
        }
      }
    }
    
    return neighbors.length > 0 ? neighbors.join('\n') : "No immediate neighbors";
  }
  
  /**
   * Parse LLM response into structured analysis
   * Updated to handle JSON format for better reliability
   */
  private parseStrategicAnalysis(response: string, turn: number): LLMStrategicAnalysis {
    try {
      // Clean response (remove markdown code blocks if present)
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.substring(7);
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.substring(3);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3);
      }
      cleanedResponse = cleanedResponse.trim();
      
      // Parse JSON
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate and extract fields
      const strategicFocus = ["economy", "military", "diplomacy", "research", "balanced"].includes(parsed.focus)
        ? parsed.focus as LLMStrategicAnalysis["strategicFocus"]
        : "balanced";
      
      const rationale = (parsed.rationale || "Strategic analysis completed").substring(0, 200);
      const threatAssessment = parsed.threats || "Normal threat level";
      const opportunityIdentified = parsed.opportunities || "Multiple opportunities available";
      const recommendedActions = Array.isArray(parsed.actions) && parsed.actions.length > 0
        ? parsed.actions.slice(0, 5)
        : ["Continue balanced development"];
      
      const diplomaticStance: Record<string, "friendly" | "neutral" | "hostile"> = {};
      if (parsed.diplomacy && typeof parsed.diplomacy === 'object') {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const uuidInStringRegex =
          /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
        let warnedAboutNonIdKeys = false;
        for (const [country, stance] of Object.entries(parsed.diplomacy)) {
          if (["friendly", "neutral", "hostile"].includes(stance as string)) {
            // Prefer country IDs as keys (see prompt rules). If the model returns names,
            // we still keep them (best-effort) but log a warning for observability.
            let key = country.trim();
            if (!uuidRegex.test(key)) {
              // Common model failure modes:
              // - Trailing punctuation/characters: "<uuid>,", "<uuid>d"
              // - Embedded IDs: "France (<uuid>)"
              const match = key.match(uuidInStringRegex);
              if (match?.[1]) {
                const recovered = match[1];
                if (!warnedAboutNonIdKeys && recovered !== key) {
                  console.warn(
                    "[LLM Planner] Normalized diplomacy key to UUID:",
                    { original: country, normalized: recovered }
                  );
                  warnedAboutNonIdKeys = true;
                }
                key = recovered;
              } else if (!warnedAboutNonIdKeys) {
                console.warn(
                  "[LLM Planner] Diplomacy keys should be country IDs; received non-UUID key(s). Example:",
                  country
                );
                warnedAboutNonIdKeys = true;
              }
            }

            diplomaticStance[key] = stance as "friendly" | "neutral" | "hostile";
          }
        }
      }
      
      const confidenceScore = typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.7;
      
      return {
        strategicFocus,
        rationale,
        threatAssessment,
        opportunityIdentified,
        recommendedActions,
        diplomaticStance,
        confidenceScore,
        turnAnalyzed: turn,
      };
    } catch (error) {
      // Fallback: If JSON parsing fails, try old format
      console.warn("[LLM Planner] Failed to parse JSON response, using fallback parsing:", error);
      return this.parseStrategicAnalysisFallback(response, turn);
    }
  }
  
  /**
   * Fallback parser for non-JSON responses
   */
  private parseStrategicAnalysisFallback(response: string, turn: number): LLMStrategicAnalysis {
    const lines = response.split('\n');
    
    let strategicFocus: LLMStrategicAnalysis["strategicFocus"] = "balanced";
    let rationale = "";
    let threatAssessment = "";
    let opportunityIdentified = "";
    let recommendedActions: string[] = [];
    let diplomaticStance: Record<string, "friendly" | "neutral" | "hostile"> = {};
    let confidenceScore = 0.7;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.match(/^FOCUS:/i)) {
        const focus = trimmed.substring(6).trim().toLowerCase();
        if (["economy", "military", "diplomacy", "research", "balanced"].includes(focus)) {
          strategicFocus = focus as any;
        }
      } else if (trimmed.match(/^RATIONALE:/i)) {
        rationale = trimmed.substring(10).trim();
      } else if (trimmed.match(/^THREATS:/i)) {
        threatAssessment = trimmed.substring(8).trim();
      } else if (trimmed.match(/^OPPORTUNITIES:/i)) {
        opportunityIdentified = trimmed.substring(14).trim();
      } else if (trimmed.match(/^ACTIONS:/i)) {
        const actionsText = trimmed.substring(8).trim();
        recommendedActions = actionsText.split(/[,;]/).map(a => a.trim()).filter(Boolean);
      } else if (trimmed.match(/^CONFIDENCE:/i)) {
        const conf = parseFloat(trimmed.substring(11).trim());
        if (!isNaN(conf)) confidenceScore = Math.min(1, Math.max(0, conf));
      }
    }
    
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
   * Convert LLM analysis to StrategyIntent for use by AIController
   * Phase 2.2+: Now checks for active strategic plans
   */
  enhanceStrategyIntent(
    llmAnalysis: LLMStrategicAnalysis | null,
    ruleBasedIntent: StrategyIntent,
    currentTurn: number,
    activePlan: LLMStrategicAnalysis | null
  ): StrategyIntent {
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

  async getActiveStrategicPlan(
    countryId: string,
    currentTurn: number,
    gameId: string
  ): Promise<LLMStrategicAnalysis | null> {
    const cached = this.getCachedPlan(countryId, currentTurn, gameId);
    if (cached) return cached;

    try {
      const supabase = getSupabaseServerClient();
      const planRes = await supabase
        .from("llm_strategic_plans")
        .select(
          "turn_analyzed, valid_until_turn, strategic_focus, rationale, threat_assessment, opportunity_identified, recommended_actions, diplomatic_stance, confidence_score"
        )
        .eq("game_id", gameId)
        .eq("country_id", countryId)
        .lte("turn_analyzed", currentTurn)
        .gte("valid_until_turn", currentTurn)
        .order("turn_analyzed", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planRes.error || !planRes.data) {
        return null;
      }

      const analysis: LLMStrategicAnalysis = {
        strategicFocus: planRes.data.strategic_focus,
        rationale: planRes.data.rationale,
        threatAssessment: planRes.data.threat_assessment,
        opportunityIdentified: planRes.data.opportunity_identified,
        recommendedActions: Array.isArray(planRes.data.recommended_actions)
          ? planRes.data.recommended_actions
          : [],
        diplomaticStance: (planRes.data.diplomatic_stance as Record<string, "friendly" | "neutral" | "hostile">) ?? {},
        confidenceScore: Number(planRes.data.confidence_score ?? 0.7),
        turnAnalyzed: Number(planRes.data.turn_analyzed),
      };

      const planKey = this.getPlanKey(gameId, countryId);
      this.activeStrategicPlans.set(planKey, analysis);
      return analysis;
    } catch (error) {
      console.warn("[LLM Planner] Failed to fetch strategic plan from DB:", error);
      return null;
    }
  }

  private getCachedPlan(
    countryId: string,
    currentTurn: number,
    gameId?: string
  ): LLMStrategicAnalysis | null {
    if (!gameId) return null;
    const planKey = this.getPlanKey(gameId, countryId);
    const plan = this.activeStrategicPlans.get(planKey);
    if (!plan) return null;

    const turnsSincePlan = currentTurn - plan.turnAnalyzed;
    if (turnsSincePlan >= 0 && turnsSincePlan < this.LLM_CALL_FREQUENCY) {
      return plan;
    }

    this.activeStrategicPlans.delete(planKey);
    return null;
  }

  private async persistStrategicPlan(
    gameId: string,
    countryId: string,
    analysis: LLMStrategicAnalysis
  ): Promise<void> {
    try {
      const supabase = getSupabaseServerClient();
      const validUntilTurn = analysis.turnAnalyzed + this.LLM_CALL_FREQUENCY - 1;

      const { error } = await supabase
        .from("llm_strategic_plans")
        .upsert(
          {
            game_id: gameId,
            country_id: countryId,
            turn_analyzed: analysis.turnAnalyzed,
            valid_until_turn: validUntilTurn,
            strategic_focus: analysis.strategicFocus,
            rationale: analysis.rationale,
            threat_assessment: analysis.threatAssessment,
            opportunity_identified: analysis.opportunityIdentified,
            recommended_actions: analysis.recommendedActions,
            diplomatic_stance: analysis.diplomaticStance,
            confidence_score: analysis.confidenceScore,
            created_at: new Date().toISOString(),
          },
          { onConflict: "game_id,country_id,turn_analyzed" }
        );

      if (error) {
        console.warn("[LLM Planner] Failed to persist strategic plan:", error.message);
      }
    } catch (error) {
      console.warn("[LLM Planner] Failed to persist strategic plan:", error);
    }
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
