/**
 * LLM Strategic Planner - Phase 2.2
 * Uses Perplexity Sonar for complex strategic decisions
 * Called sparingly (once per 5 turns) to minimize costs
 * Provides high-level strategic guidance that enhances rule-based AI
 */
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import type { CountryStats } from "@/types/country";
import type { StrategyIntent } from "./StrategicPlanner";
import { RuleBasedAI } from "./RuleBasedAI";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getDiplomaticScore } from "@/lib/game-engine/DiplomaticRelations";
import type { ActionType } from "@/types/actions";

/**
 * IMPORTANT: We do NOT constrain what the LLM can *advise* (instruction is always free text).
 * We only optionally constrain what can be *executed* by the game engine via `execution`.
 */
export type LLMPlanItem =
  | {
      kind: "step";
      id: string;
      instruction: string;
      /**
       * Optional machine-executable action. If omitted/null, the step is still valid advice,
       * but may require future systems (diplomacy deals, multi-action, etc).
       */
      execution?: {
        actionType: ActionType;
        actionData: Record<string, unknown>;
      } | null;
      /** Optional gating conditions (best-effort; unknown keys are ignored). */
      when?: Record<string, unknown>;
      /** Optional completion conditions (best-effort; unknown keys are ignored). */
      stop_when?: Record<string, unknown>;
      /** Lower number = higher priority. Defaults to array order. */
      priority?: number;
    }
  | {
      kind: "constraint";
      id: string;
      instruction: string;
      /**
       * Optional structured effects. `prohibit` is intentionally free-form strings
       * (e.g. ["recruit", "research", "infrastructure"]) to avoid limiting capability.
       */
      effects?: { prohibit?: string[] };
    };

export interface LLMStrategicAnalysis {
  strategicFocus: "economy" | "military" | "diplomacy" | "research" | "balanced";
  rationale: string;
  threatAssessment: string;
  opportunityIdentified: string;
  /**
   * Backward-compatible "display list" of actions. This is derived from `planItems` when present.
   * It remains an array of strings for logging/UI and legacy logic.
   */
  recommendedActions: string[];
  /**
   * Structured plan items (steps + constraints). Prefer this for actual execution.
   * Stored in DB inside `recommended_actions` as a JSONB array (mixed strings/objects supported).
   */
  planItems?: LLMPlanItem[];
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
EXECUTABLE ACTIONS (only these can be done):
1. TECHNOLOGY UPGRADE: Boosts production (1.25x→3.0x) & military (+20%/level). Cost: 800×1.35^level×profile
2. INFRASTRUCTURE UPGRADE: Boosts tax (+12%/level) & capacity (200k+50k×level). Cost: 700×1.30^level×profile
3. RECRUIT MILITARY: Add strength. Cost: 50/point
4. ATTACK CITY: Conquer enemies (risky)

PROFILES:
- Tech Hub: 0.75x tech, 0.90x military
- Industrial: 0.80x infra
- Coastal: 0.85x infra
- Others: 1.0-1.2x
`;

export class LLMStrategicPlanner {
  private apiKey: string | null = null;
  private apiUrl: string = "https://api.groq.com/openai/v1/chat/completions";
  private modelName: string = "openai/gpt-oss-20b"; // Groq's GPT OSS 20B 128K Model
  private costTracking: LLMCostTracking;
  private lastAnalysisCache: Map<string, LLMStrategicAnalysis> = new Map();
  
  // Strategic plan persistence - LLM analysis guides next N turns
  private activeStrategicPlans: Map<string, LLMStrategicAnalysis> = new Map();
  
  // Call LLM every N turns (optimized: 10 turns to reduce API costs by 30%)
  private readonly LLM_CALL_FREQUENCY = 10;

  private getPlanKey(gameId: string, countryId: string): string {
    return `${gameId}:${countryId}`;
  }
  
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || null;
    if (!this.apiKey) {
      console.warn("[LLM Planner] No API key found. LLM strategic planning will be disabled.");
      console.warn("[LLM Planner] Set GROQ_API_KEY environment variable.");
    } else {
      console.log(`[LLM Planner] Using Groq ${this.modelName} for strategic planning`);
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
   * Call on turn 2, then every 10 turns (2, 10, 20, 30, 40...)
   */
  shouldCallLLM(turn: number): boolean {
    // Call on turn 2 (after initial setup), then every 10 turns after that
    return turn === 2 || (turn >= 10 && turn % this.LLM_CALL_FREQUENCY === 0);
  }
  
  /**
   * BATCH analyze multiple countries in a SINGLE API call (80% cost reduction!)
   * This is the most efficient way to get strategic analysis for all AI countries.
   */
  async analyzeSituationBatch(
    state: GameStateSnapshot,
    countries: Array<{ countryId: string; stats: CountryStats }>
  ): Promise<Map<string, LLMStrategicAnalysis>> {
    const results = new Map<string, LLMStrategicAnalysis>();
    
    // Check if LLM is available
    if (!this.apiKey) {
      console.log(`[LLM Planner] Skipping batch LLM analysis - no API key configured`);
      return results;
    }
    
    // Check if we should call LLM this turn
    if (!this.shouldCallLLM(state.turn)) {
      console.log(`[LLM Planner] Skipping batch LLM call - turn ${state.turn} (frequency: every ${this.LLM_CALL_FREQUENCY} turns)`);
      return results;
    }
    
    try {
      const startTime = Date.now();
      console.log(`[LLM Planner] 🚀 BATCH analyzing ${countries.length} countries in SINGLE API call (Turn ${state.turn})`);
      
      // Build batch prompt with all countries
      const batchPrompt = this.buildBatchStrategicPrompt(state, countries);
      
      // Single API call for all countries (Groq format - OpenAI-compatible)
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: "system",
              content: "You are a strategic AI advisor analyzing multiple nations in a turn-based strategy game. Provide strategic recommendations for EACH country in valid JSON array format. Return ONLY the JSON array, no markdown, no explanations."
            },
            {
              role: "user",
              content: batchPrompt
            }
          ],
          temperature: 0.3,
          top_p: 0.95,
          max_tokens: 8000,  // More tokens for multiple countries
          response_format: { type: "json_object" }  // Force JSON output
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM Planner] Groq API error: ${response.status} - ${errorText}`);
        return results;
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || "";
      
      // Track costs (Groq pricing: ~$0.20 per 1M input tokens, ~$0.20 per 1M output tokens)
      const usage = data.usage || {};
      const inputTokens = usage.prompt_tokens || batchPrompt.length / 4;
      const outputTokens = usage.completion_tokens || responseText.length / 4;
      const inputCost = (inputTokens / 1_000_000) * 0.20;  // Groq input pricing
      const outputCost = (outputTokens / 1_000_000) * 0.20;  // Groq output pricing
      
      this.costTracking.totalCalls++;
      this.costTracking.totalInputTokens += inputTokens;
      this.costTracking.totalOutputTokens += outputTokens;
      this.costTracking.estimatedCost += inputCost + outputCost;
      this.costTracking.lastCallTimestamp = new Date().toISOString();
      
      const duration = Date.now() - startTime;
      console.log(`[LLM Planner] ✓ BATCH analysis complete in ${duration}ms for ${countries.length} countries`);
      console.log(`[LLM Planner] 💰 Cost: $${(inputCost + outputCost).toFixed(6)} (Input: ${inputTokens.toFixed(0)} tokens, Output: ${outputTokens.toFixed(0)} tokens)`);
      console.log(`[LLM Planner] 💰 Average per country: $${((inputCost + outputCost) / countries.length).toFixed(6)} (vs $0.0002 individual)`);
      console.log(`[LLM Planner] 💰 Total session cost: $${this.costTracking.estimatedCost.toFixed(4)} (${this.costTracking.totalCalls} calls)`);
      
      // Parse batch response
      const analyses = this.parseBatchStrategicAnalysis(responseText, state.turn, countries);
      
      // Cache and persist each country's analysis
      for (const { countryId } of countries) {
        const analysis = analyses.get(countryId);
        if (analysis) {
          const cacheKey = `${countryId}-${state.turn}`;
          this.lastAnalysisCache.set(cacheKey, analysis);
          
          const planKey = this.getPlanKey(state.gameId, countryId);
          this.activeStrategicPlans.set(planKey, analysis);
          await this.persistStrategicPlan(state.gameId, countryId, analysis);
          
          results.set(countryId, analysis);
          
          // Log summary
          const country = state.countries.find(c => c.id === countryId);
          console.log(`[LLM Planner] ✓ ${country?.name || countryId}: ${analysis.strategicFocus} - ${analysis.rationale}`);
        }
      }
      
      return results;
    } catch (error) {
      console.error("[LLM Planner] Batch analysis error:", error);
      if (error instanceof Error) {
        console.error("[LLM Planner] Error details:", error.message);
      }
      return results;
    }
  }

  /**
   * Get strategic analysis using LLM (SINGLE country - use batch for better efficiency!)
   * This is the expensive operation - call sparingly!
   */
  async analyzeSituation(
    state: GameStateSnapshot,
    countryId: string,
    stats: CountryStats
  ): Promise<LLMStrategicAnalysis | null> {
    // Check if LLM is available
    if (!this.apiKey) {
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
      console.log(`[LLM Planner] 🤖 Calling Groq for strategic analysis (Turn ${state.turn})`);
      
      // Build context-rich prompt
      const prompt = this.buildStrategicPrompt(state, countryId, stats);
      
      // Call Groq API (OpenAI-compatible format)
      // Note: response_format json_object can be strict about schema compliance
      // If model fails to generate valid JSON, it will return 400 error
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: "system",
              content: "You are a strategic AI advisor for a nation in a turn-based strategy game. Analyze the situation and provide strategic recommendations in valid JSON format only. Return ONLY the JSON object, no markdown, no explanations. Ensure the JSON is properly formatted and complete."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2,  // Lower temperature for more consistent JSON generation
          top_p: 0.9,
          max_tokens: 2000,
          response_format: { type: "json_object" }  // Force JSON output
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LLM Planner] Groq API error: ${response.status} - ${errorText}`);
        
        // Check if this is a JSON validation error
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.code === "json_validate_failed") {
            console.error(`[LLM Planner] JSON validation failed - model could not generate valid JSON for the schema`);
            console.error(`[LLM Planner] This usually means the prompt is too complex or the model is struggling with the constraints`);
          }
        } catch {
          // Error text is not JSON, just log it
        }
        
        return null;
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || "";
      
      // Track costs (Groq pricing: ~$0.20 per 1M tokens for input/output)
      const usage = data.usage || {};
      const inputTokens = usage.prompt_tokens || prompt.length / 4;
      const outputTokens = usage.completion_tokens || responseText.length / 4;
      const inputCost = (inputTokens / 1_000_000) * 0.20; // Groq input pricing
      const outputCost = (outputTokens / 1_000_000) * 0.20; // Groq output pricing
      
      this.costTracking.totalCalls++;
      this.costTracking.totalInputTokens += inputTokens;
      this.costTracking.totalOutputTokens += outputTokens;
      this.costTracking.estimatedCost += inputCost + outputCost;
      this.costTracking.lastCallTimestamp = new Date().toISOString();
      
      const duration = Date.now() - startTime;
      console.log(`[LLM Planner] ✓ Analysis complete in ${duration}ms (Groq ${this.modelName})`);
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
      console.error("[LLM Planner] Error calling Groq:", error);
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

${country.name} (T${state.turn}): Pop ${(stats.population/1000).toFixed(0)}k | $${(stats.budget).toFixed(0)} | Tech L${stats.technologyLevel} | Infra L${stats.infrastructureLevel || 0} | Mil ${stats.militaryStrength} | ${stats.resourceProfile?.name || "Balanced"}
Income: $${economicAnalysis.netIncome}/t | ${economicAnalysis.isUnderDefended ? 'UNDER-DEFENDED' : 'OK'} | ${economicAnalysis.turnsUntilBankrupt !== null ? `Bankrupt in ${economicAnalysis.turnsUntilBankrupt}t` : 'Stable'}

NEIGHBORS: ${neighbors}

Plan ${this.LLM_CALL_FREQUENCY} turns (2-3 actions/turn). Use "when" to pace.

JSON ONLY:
{
  "focus": "economy"|"military"|"research"|"balanced",
  "rationale": "Why (max 100 chars)",
  "threats": "Key threats",
  "opportunities": "Key opportunities",
  "action_plan": [
    {"id":"tech_l2","instruction":"Tech→L2","priority":1,"execution":{"actionType":"research","actionData":{"targetLevel":2}}},
    {"id":"infra_l2","instruction":"Infra→L2","priority":2,"when":{"budget_gte":1000},"execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2}}},
    {"id":"recruit_45","instruction":"Recruit→45","priority":3,"when":{"tech_level_gte":2},"stop_when":{"military_strength_gte":45},"execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}},
    {"id":"tech_l3","instruction":"Tech→L3","priority":4,"when":{"budget_gte":1500,"tech_level_gte":2},"execution":{"actionType":"research","actionData":{"targetLevel":3}}},
    {"id":"infra_l3","instruction":"Infra→L3","priority":5,"when":{"budget_gte":1200},"execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":3}}},
    {"id":"recruit_55","instruction":"Recruit→55","priority":6,"when":{"tech_level_gte":3,"budget_gte":800},"stop_when":{"military_strength_gte":55},"execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}}
  ],
  "diplomacy":{${neighbors
  .split('\n')
  .filter(n => n.trim())
  .map(n => {
    const match = n.match(/- .*\\(([^)]+)\\):/);
    return match ? `"${match[1].trim()}":"neutral"` : '';
  })
  .filter(Boolean)
  .join(',')}},
  "confidence":0.9
}

RULES: 6-8 steps, ALL executable (tech/infra/recruit/attack), use "when" for pacing, NO passive steps`;
  }
  
  /**
   * Get summary of neighboring countries (optimized: only show threats/key neighbors)
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
          const ourToThem = getDiplomaticScore(stats.diplomaticRelations, otherCountry.id);
          const isThreat = otherStats.militaryStrength > stats.militaryStrength * 1.2 || ourToThem < 30;
          
          // Only show threats or first 2 neighbors (reduce token usage)
          if (isThreat || neighbors.length < 2) {
            neighbors.push(
              `- ${otherCountry.name} (${otherCountry.id}): Rel ${ourToThem}, Mil ${otherStats.militaryStrength}${isThreat ? ' ⚠️' : ''}`
            );
          }
        }
      }
    }
    
    return neighbors.length > 0 ? neighbors.join('\n') : "No threats detected";
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
      const planItems = this.parsePlanItems(parsed);
      const recommendedActionsFromPlan =
        planItems && planItems.length > 0
          ? planItems
              .filter((i): i is Extract<LLMPlanItem, { kind: "step" }> => i.kind === "step")
              .map((s) => s.instruction)
              .filter(Boolean)
              .slice(0, 5)
          : [];

      // Backward compatibility: accept old "actions": string[]
      const legacyActions =
        Array.isArray(parsed.actions) && parsed.actions.length > 0
          ? parsed.actions.map((a: unknown) => String(a ?? "").trim()).filter(Boolean).slice(0, 5)
          : [];

      const recommendedActions =
        recommendedActionsFromPlan.length > 0
          ? recommendedActionsFromPlan
          : legacyActions.length > 0
            ? legacyActions
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
        planItems: planItems.length > 0 ? planItems : undefined,
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
      planItems: undefined,
      diplomaticStance,
      confidenceScore,
      turnAnalyzed: turn,
    };
  }

  /**
   * Build batch prompt for analyzing multiple countries at once
   */
  private buildBatchStrategicPrompt(
    state: GameStateSnapshot,
    countries: Array<{ countryId: string; stats: CountryStats }>
  ): string {
    const countryPrompts = countries.map(({ countryId, stats }) => {
      const country = state.countries.find(c => c.id === countryId);
      if (!country) return "";
      
      const economicAnalysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
      const neighbors = this.getNeighborsSummary(state, countryId, stats);
      
      return `
### ${country.name} (ID: ${countryId})
Pop: ${(stats.population/1000).toFixed(0)}k | $${(stats.budget).toFixed(0)} | Tech L${stats.technologyLevel} | Infra L${stats.infrastructureLevel || 0} | Mil ${stats.militaryStrength} | ${stats.resourceProfile?.name || "Balanced"}
Income: $${economicAnalysis.netIncome}/t | ${economicAnalysis.isUnderDefended ? 'UNDER-DEFENDED' : 'OK'} | ${economicAnalysis.turnsUntilBankrupt !== null ? `Bankrupt in ${economicAnalysis.turnsUntilBankrupt}t` : 'Stable'}
Neighbors: ${neighbors.split('\n').join('; ')}`;
    }).join('\n');

    return `${CACHED_GAME_RULES}

Plan ${this.LLM_CALL_FREQUENCY} turns (2-3 actions/turn). Use "when" to pace.

COUNTRIES TO ANALYZE:
${countryPrompts}

Return JSON OBJECT with "countries" array containing one analysis per country:
{
  "countries": [
    {
      "countryId": "${countries[0].countryId}",
      "focus": "economy"|"military"|"research"|"balanced",
      "rationale": "Why (max 100 chars)",
      "threats": "Key threats",
      "opportunities": "Key opportunities",
      "action_plan": [
        {"id":"tech_l2","instruction":"Tech→L2","priority":1,"execution":{"actionType":"research","actionData":{"targetLevel":2}}},
        {"id":"infra_l2","instruction":"Infra→L2","priority":2,"when":{"budget_gte":1000},"execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2}}},
        {"id":"recruit_45","instruction":"Recruit→45","priority":3,"when":{"tech_level_gte":2},"stop_when":{"military_strength_gte":45},"execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}}
      ],
      "diplomacy":{"neighbor_id":"neutral"},
      "confidence":0.9
    }
  ]
}

RULES: 6-8 steps, ALL executable (tech/infra/recruit/attack), use "when" for pacing, NO passive steps`;
  }

  /**
   * Parse batch LLM response into individual country analyses
   */
  private parseBatchStrategicAnalysis(
    response: string,
    turn: number,
    countries: Array<{ countryId: string; stats: CountryStats }>
  ): Map<string, LLMStrategicAnalysis> {
    const results = new Map<string, LLMStrategicAnalysis>();
    
    try {
      // Clean response
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
      
      // Parse JSON (Groq returns wrapped object format)
      const parsedObject = JSON.parse(cleanedResponse);
      
      // Extract countries array from wrapper object
      const parsedArray = parsedObject.countries || parsedObject;
      
      if (!Array.isArray(parsedArray)) {
        console.error("[LLM Planner] Expected countries array in batch response, got:", typeof parsedArray);
        return results;
      }
      
      // Process each country's analysis
      for (const parsed of parsedArray) {
        const countryId = parsed.countryId;
        if (!countryId) {
          console.warn("[LLM Planner] Country analysis missing countryId");
          continue;
        }
        
        // Use existing single-country parser logic
        const strategicFocus = ["economy", "military", "diplomacy", "research", "balanced"].includes(parsed.focus)
          ? parsed.focus as LLMStrategicAnalysis["strategicFocus"]
          : "balanced";
        
        const rationale = (parsed.rationale || "Strategic analysis completed").substring(0, 200);
        const threatAssessment = parsed.threats || "Normal threat level";
        const opportunityIdentified = parsed.opportunities || "Multiple opportunities available";
        const planItems = this.parsePlanItems(parsed);
        const recommendedActionsFromPlan =
          planItems && planItems.length > 0
            ? planItems
                .filter((i): i is Extract<LLMPlanItem, { kind: "step" }> => i.kind === "step")
                .map((s) => s.instruction)
                .filter(Boolean)
                .slice(0, 5)
            : [];

        const legacyActions =
          Array.isArray(parsed.actions) && parsed.actions.length > 0
            ? parsed.actions.map((a: unknown) => String(a ?? "").trim()).filter(Boolean).slice(0, 5)
            : [];

        const recommendedActions =
          recommendedActionsFromPlan.length > 0
            ? recommendedActionsFromPlan
            : legacyActions.length > 0
              ? legacyActions
              : ["Continue balanced development"];
        
        const diplomaticStance: Record<string, "friendly" | "neutral" | "hostile"> = {};
        if (parsed.diplomacy && typeof parsed.diplomacy === 'object') {
          for (const [country, stance] of Object.entries(parsed.diplomacy)) {
            if (["friendly", "neutral", "hostile"].includes(stance as string)) {
              diplomaticStance[country.trim()] = stance as "friendly" | "neutral" | "hostile";
            }
          }
        }
        
        const confidenceScore = typeof parsed.confidence === 'number'
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.7;
        
        const analysis: LLMStrategicAnalysis = {
          strategicFocus,
          rationale,
          threatAssessment,
          opportunityIdentified,
          recommendedActions,
          planItems: planItems.length > 0 ? planItems : undefined,
          diplomaticStance,
          confidenceScore,
          turnAnalyzed: turn,
        };
        
        results.set(countryId, analysis);
      }
      
      console.log(`[LLM Planner] ✓ Successfully parsed ${results.size}/${countries.length} country analyses`);
      
      return results;
    } catch (error) {
      console.error("[LLM Planner] Failed to parse batch response:", error);
      console.error("Response:", response.substring(0, 500));
      return results;
    }
  }

  private parsePlanItems(parsed: any): LLMPlanItem[] {
    const items: LLMPlanItem[] = [];

    // Constraints first (optional)
    if (Array.isArray(parsed.constraints)) {
      for (const c of parsed.constraints) {
        if (!c || typeof c !== "object") continue;
        const id = typeof c.id === "string" ? c.id.trim() : "";
        const instruction = typeof c.instruction === "string" ? c.instruction.trim() : "";
        if (!id || !instruction) continue;
        const prohibit = Array.isArray(c.effects?.prohibit)
          ? c.effects.prohibit.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
          : undefined;
        items.push({
          kind: "constraint",
          id,
          instruction,
          effects: prohibit && prohibit.length > 0 ? { prohibit } : undefined,
        });
      }
    }

    // Action plan steps (preferred)
    if (Array.isArray(parsed.action_plan)) {
      for (const s of parsed.action_plan) {
        if (!s || typeof s !== "object") continue;
        const id = typeof s.id === "string" ? s.id.trim() : "";
        const instruction = typeof s.instruction === "string" ? s.instruction.trim() : "";
        if (!id || !instruction) continue;

        let execution: Extract<LLMPlanItem, { kind: "step" }>["execution"] = null;
        if (s.execution && typeof s.execution === "object") {
          const actionType = typeof s.execution.actionType === "string" ? s.execution.actionType : "";
          const actionData = s.execution.actionData && typeof s.execution.actionData === "object" ? s.execution.actionData : null;
          if (
            (actionType === "diplomacy" || actionType === "military" || actionType === "economic" || actionType === "research") &&
            actionData
          ) {
            execution = { actionType, actionData: actionData as Record<string, unknown> };
          }
        }

        items.push({
          kind: "step",
          id,
          instruction,
          execution,
          when: s.when && typeof s.when === "object" ? (s.when as Record<string, unknown>) : undefined,
          stop_when: s.stop_when && typeof s.stop_when === "object" ? (s.stop_when as Record<string, unknown>) : undefined,
          priority: typeof s.priority === "number" ? s.priority : undefined,
        });
      }
    }

    return items;
  }
  
  /**
   * Convert LLM analysis to StrategyIntent for use by AIController
   * Phase 2.2+: Now checks for active strategic plans
   */
  enhanceStrategyIntent(
    llmAnalysis: LLMStrategicAnalysis | null,
    ruleBasedIntent: StrategyIntent,
    currentTurn: number,
    activePlan: LLMStrategicAnalysis | null,
    executedSteps: string[] = []
  ): StrategyIntent {
    const guidingAnalysis = llmAnalysis || activePlan;
    
    // If no LLM guidance (new or cached), use rule-based intent
    if (!guidingAnalysis) {
      return ruleBasedIntent;
    }
    
    // Determine if this is a fresh LLM call or using cached plan
    const planAge = currentTurn - guidingAnalysis.turnAnalyzed;
    const planSource = planAge === 0 ? "Fresh LLM" : `LLM (T${guidingAnalysis.turnAnalyzed}, ${planAge}t ago)`;
    const planSourceKey: "fresh" | "cached" = planAge === 0 ? "fresh" : "cached";
    const validUntilTurn = guidingAnalysis.turnAnalyzed + this.LLM_CALL_FREQUENCY - 1;
    
    // Combine LLM insight with rule-based safety
    // LLM provides strategic direction, rules ensure execution safety
    return {
      focus: guidingAnalysis.strategicFocus,
      rationale: `[${planSource}] ${guidingAnalysis.rationale}`,
      llmPlan: {
        source: planSourceKey,
        turnAnalyzed: guidingAnalysis.turnAnalyzed,
        validUntilTurn,
        recommendedActions: guidingAnalysis.recommendedActions ?? [],
        planItems: guidingAnalysis.planItems,
        executedStepIds: executedSteps,
        diplomaticStance: guidingAnalysis.diplomaticStance ?? {},
        confidenceScore: guidingAnalysis.confidenceScore ?? 0.7,
      },
    };
  }

  /**
   * Best-effort: fetch which LLM steps were already executed for this plan turn.
   * Uses the `actions.action_data.llmPlanTurn` + `actions.action_data.llmStep` metadata we attach
   * when creating AI actions.
   */
  async getExecutedLLMStepsForPlan(
    gameId: string,
    countryId: string,
    planTurnAnalyzed: number
  ): Promise<Set<string>> {
    try {
      const supabase = getSupabaseServerClient();
      const res = await supabase
        .from("actions")
        .select("action_data,status")
        .eq("game_id", gameId)
        .eq("country_id", countryId)
        .in("status", ["pending", "executed"])
        // Postgres jsonb path query: action_data->>'llmPlanTurn'
        .eq("action_data->>llmPlanTurn", String(planTurnAnalyzed))
        .limit(200);

      if (res.error || !res.data) return new Set();

      const steps = new Set<string>();
      for (const row of res.data as Array<{ action_data: unknown }>) {
        const data = row.action_data as Record<string, unknown> | null;
        const stepId = typeof data?.llmStepId === "string" ? data.llmStepId.trim() : "";
        if (stepId) {
          steps.add(stepId);
          continue;
        }
        // Backward compatibility (older actions wrote llmStep as raw text)
        const step = typeof data?.llmStep === "string" ? data.llmStep.trim() : "";
        if (step) steps.add(step);
      }
      return steps;
    } catch (error) {
      console.warn("[LLM Planner] Failed to fetch executed LLM steps:", error);
      return new Set();
    }
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
        recommendedActions: [],
        planItems: undefined,
        diplomaticStance: (planRes.data.diplomatic_stance as Record<string, "friendly" | "neutral" | "hostile">) ?? {},
        confidenceScore: Number(planRes.data.confidence_score ?? 0.7),
        turnAnalyzed: Number(planRes.data.turn_analyzed),
      };

      // CRITICAL FIX: Load plan from DB (jsonb array) with proper reconstruction
      // Backward compatible:
      // - ["string", ...] legacy
      // - [{kind:"step"|...}, ...] structured
      const ra = planRes.data.recommended_actions as unknown;
      if (Array.isArray(ra)) {
        const steps: LLMPlanItem[] = [];
        const actionStrings: string[] = [];
        for (const item of ra) {
          if (typeof item === "string") {
            const s = item.trim();
            if (s) actionStrings.push(s);
            continue;
          }
          if (!item || typeof item !== "object") continue;
          const kind = (item as any).kind;
          if (kind === "step" || kind === "constraint") {
            steps.push(item as LLMPlanItem);
            if (kind === "step" && typeof (item as any).instruction === "string") {
              const s = (item as any).instruction.trim();
              if (s) actionStrings.push(s);
            }
          }
        }
        analysis.planItems = steps.length > 0 ? steps : undefined;
        analysis.recommendedActions = actionStrings.length > 0 ? actionStrings.slice(0, 5) : [];
        
        // DEBUG: Log what we retrieved
        if (steps.length > 0) {
          console.log(`[LLM Planner] ✓ Retrieved plan for ${countryId}: ${steps.length} plan items`);
        } else if (actionStrings.length > 0) {
          console.log(`[LLM Planner] ✓ Retrieved legacy plan for ${countryId}: ${actionStrings.length} action strings`);
        }
      }

      if (!analysis.recommendedActions || analysis.recommendedActions.length === 0) {
        analysis.recommendedActions = ["Continue balanced development"];
      }

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

      // CRITICAL FIX: Store plan items properly as structured objects at the start of the array
      // This ensures they survive the round trip to/from database
      const recommendedActionsToStore = Array.isArray(analysis.planItems) && analysis.planItems.length > 0
        ? analysis.planItems // Store ONLY plan items, no mixing with strings
        : analysis.recommendedActions; // Fallback to legacy strings

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
            recommended_actions: recommendedActionsToStore,
            diplomatic_stance: analysis.diplomaticStance,
            confidence_score: analysis.confidenceScore,
            created_at: new Date().toISOString(),
          },
          { onConflict: "game_id,country_id,turn_analyzed" }
        );

      if (error) {
        console.warn("[LLM Planner] Failed to persist strategic plan:", error.message);
      } else {
        console.log(`[LLM Planner] ✓ Persisted strategic plan for ${countryId}: ${recommendedActionsToStore.length} items`);
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
