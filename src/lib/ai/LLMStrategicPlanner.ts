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
import { MilitaryCalculator } from "@/lib/game-engine/MilitaryCalculator";
import { ActionPricing } from "@/lib/game-engine/ActionPricing";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import type { City } from "@/types/city";
import { calculateCityValue } from "@/types/city";

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
   * Primary strategic plan (6-8 steps)
   */
  primaryPlan?: LLMPlanItem[];
  /**
   * Fallback plan triggered by numeric condition (2-3 steps)
   */
  fallbackPlan?: {
    condition: string; // e.g. "budget < 500"
    steps: LLMPlanItem[];
  };
  /**
   * Top risks to the primary plan
   */
  risks?: string[];
  /**
   * Why these specific steps/plan
   */
  planRationale?: string;
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
1. TECHNOLOGY UPGRADE: Boosts production (1.25x→3.0x) & military (+20%/level). Cost: ${ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST}×${ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER}^level×profile×resources
2. INFRASTRUCTURE UPGRADE: Boosts tax (+12%/level) & capacity (200k+50k×level). Cost: ${ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST}×${ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER}^level×profile×resources
3. RECRUIT MILITARY: Add strength. Cost: ${ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT}/point base (tech/profile reduce, resources increase). 15 units standard.
4. ATTACK CITY: Conquer enemies to expand territory. Success requires strength advantage. Cost: 100 + 10×strength allocated

RESOURCES (8 types, simpler system):
- Basic: Food (pop survival), Timber (infra/military)
- Strategic: Iron (military), Oil (adv military)
- Economic: Gold (diplomacy), Copper (research)
- Industrial: Steel (tech/infra), Coal (energy/research)

SHORTAGE PENALTY: Missing resources increase budget cost (+40%/resource, max 2.5x)
→ Plan around resource availability or accept higher costs
→ Trade deals can secure missing resources

RESOURCE STRATEGY:
- Early game: Secure Food + Timber for growth
- Military focus: Need Iron (always) + Oil (tech 2+)
- Tech focus: Need Copper + Coal + Steel
- Trade focus: Gold valuable for diplomacy

WINNING STRATEGIES:
- Economic: Build tech + infra for long-term dominance
- Military: Build strength, then attack weak neighbors to expand
- Balanced: Alternate economic growth with strategic conquests

PROFILES:
- Tech Innovator: 0.75x tech, 0.90x military
- Industrial Powerhouse: 0.80x infra
- Trade Hub: 0.85x infra, 1.25x trade
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

  /**
   * Generate a stable version string for game mechanics to detect drift
   */
  private static getMechanicsVersion(): string {
    return `v1.${ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST}.${ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER}.${ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT}`;
  }

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
   * BATCH analyze multiple countries in a SINGLE API call.
   * 
   * ⚠️ DEPRECATED: This method is prone to json_validate_failed errors from Groq
   * when generating complex nested JSON for multiple countries. Replaced by parallel
   * individual calls in turn/route.ts which are:
   * - More reliable (simpler JSON = fewer validation failures)
   * - Just as fast (parallel execution = 2-4s vs 3-4s for batch)
   * - No extra cost (Grok doesn't charge per request)
   * 
   * Kept for reference but not actively used.
   */
  async analyzeSituationBatch(
    state: GameStateSnapshot,
    countries: Array<{ countryId: string; stats: CountryStats }>,
    cities: City[]
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
      const batchPrompt = this.buildBatchStrategicPrompt(state, countries, cities);
      
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
              content: "You are a strategic AI advisor in a turn-based conquest game. Analyze each country's situation using the provided mechanics and context. Produce the best strategic plan considering economic growth, military security, and expansion opportunities. YOU MUST RESPOND WITH VALID JSON ONLY. NO MARKDOWN, NO EXPLANATIONS, ONLY JSON."
            },
            {
              role: "user",
              content: batchPrompt
            }
          ],
          temperature: 0.4,  // Lower temperature for more reliable JSON in batch mode
          top_p: 0.9,
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
      let analyses = this.parseBatchStrategicAnalysis(responseText, state.turn, countries);

      // Quality-safe retry: If batch parsing failed, retry once with simplified prompt
      if (analyses.size === 0) {
        console.log(`[LLM Planner] ⚠️ Batch parsing failed, retrying with simplified prompt...`);
        const retryPrompt = this.buildRetryBatchPrompt(state, countries, cities);

        const retryResponse = await fetch(this.apiUrl, {
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
                content: "You are a strategic AI advisor. Return ONLY valid JSON. No explanations, no markdown."
              },
              {
                role: "user",
                content: retryPrompt
              }
            ],
            temperature: 0.3,  // Lower temperature for more reliable JSON
            top_p: 0.9,
            max_tokens: 6000,  // Slightly fewer tokens for retry
            response_format: { type: "json_object" }
          })
        });

        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryResponseText = retryData.choices?.[0]?.message?.content || "";
          analyses = this.parseBatchStrategicAnalysis(retryResponseText, state.turn, countries);

          if (analyses.size > 0) {
            console.log(`[LLM Planner] ✓ Retry successful: parsed ${analyses.size} countries`);
            
            // Validate retry quality
            for (const [countryId, analysis] of analyses.entries()) {
              const stepCount = analysis.planItems?.filter(i => i.kind === 'step').length || 0;
              if (stepCount < 8) {
                console.error(`[LLM Planner] ⚠️ RETRY QUALITY FAILURE: ${countryId} got only ${stepCount}/8 steps after retry`);
              }
            }
          } else {
            console.log(`[LLM Planner] ✗ Retry also failed, falling back to rule-based planning`);
          }
        } else {
          console.log(`[LLM Planner] ✗ Retry API call failed: ${retryResponse.status}`);
        }
      }

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
          
          // Log summary with recommended actions
          const country = state.countries.find(c => c.id === countryId);
          const planSource = analysis.planItems ? 'structured' : 'legacy';
          const planItemsCount = analysis.planItems?.length || 0;
          const executableSteps = analysis.planItems?.filter(item => item.kind === 'step' && item.execution).length || 0;

          // PHASE D: Enhanced logging for plan quality tracking
          if (analysis.planItems && analysis.planItems.length > 0) {
            const steps = analysis.planItems.filter(i => i.kind === 'step');
            const countryName = country?.name || countryId.substring(0, 8);
            
            // Count by action type
            const byType: Record<string, number> = {};
            const repeatableCount = steps.filter(s => s.stop_when && Object.keys(s.stop_when).length > 0).length;
            
            steps.forEach(step => {
              if (step.execution?.actionType) {
                const type = step.execution.actionType;
                byType[type] = (byType[type] || 0) + 1;
              }
            });
            
            const typeStr = Object.entries(byType)
              .map(([type, count]) => `${type}=${count}`)
              .join(', ');
            
            console.log(`[LLM Planner] ${countryName}: ${steps.length} steps | By Type: ${typeStr} | Repeatable: ${repeatableCount}`);
            
            // Quality warnings
            if (steps.length < 8) {
              console.warn(`[LLM Planner] ⚠️ QUALITY WARNING: ${countryName} has only ${steps.length}/8 steps (BELOW MINIMUM)`);
            }
            
            if (steps.length > 10) {
              console.warn(`[LLM Planner] ⚠️ QUALITY WARNING: ${countryName} has ${steps.length}/10 steps (ABOVE MAXIMUM)`);
            }
            
            const executableCount = steps.filter(s => s.execution).length;
            if (executableCount < steps.length * 0.8) {
              console.warn(`[LLM Planner] ⚠️ QUALITY WARNING: ${countryName} has only ${executableCount}/${steps.length} executable steps (low ratio)`);
            }
          } else {
            console.log(`[LLM Planner] ✓ ${country?.name || countryId}: ${analysis.strategicFocus} (${planSource}, ${planItemsCount} items, ${executableSteps} executable)`);
          }
          
          console.log(`[LLM Planner]   Rationale: ${analysis.rationale.substring(0, 80)}${analysis.rationale.length > 80 ? '...' : ''}`)

          // Log recommended actions (always show in batch mode for Vercel visibility)
          if (analysis.recommendedActions.length > 0) {
            console.log(`[LLM Planner]   Actions: ${analysis.recommendedActions.slice(0, 3).join(' | ')}${analysis.recommendedActions.length > 3 ? ` (+${analysis.recommendedActions.length - 3} more)` : ''}`);
          }

          // Verbose logging (env-gated to avoid log spam)
          if (process.env.LLM_PLANNER_LOG_ACTIONS === '1') {
            if (analysis.planItems && analysis.planItems.length > 0) {
              console.log(`[LLM Planner]   Plan Items:`);
              analysis.planItems.slice(0, 3).forEach((item, i) => {
                const execInfo = item.kind === 'step' && item.execution ? ` (${item.execution.actionType})` : '';
                console.log(`[LLM Planner]     ${i+1}. ${item.instruction.substring(0, 60)}${item.instruction.length > 60 ? '...' : ''}${execInfo}`);
              });
              if (analysis.planItems.length > 3) {
                console.log(`[LLM Planner]     ... and ${analysis.planItems.length - 3} more items`);
              }
            }
          }
        }
      }
      
      // PHASE D: Log batch summary statistics
      if (results.size > 0) {
        const stats = {
          total: results.size,
          withPlans: 0,
          avgSteps: 0,
          minSteps: Infinity,
          maxSteps: 0,
          lowQuality: 0, // < 8 steps
        };
        
        for (const [countryId, analysis] of results.entries()) {
          if (analysis.planItems && analysis.planItems.length > 0) {
            stats.withPlans++;
            const stepCount = analysis.planItems.filter(i => i.kind === 'step').length;
            stats.avgSteps += stepCount;
            stats.minSteps = Math.min(stats.minSteps, stepCount);
            stats.maxSteps = Math.max(stats.maxSteps, stepCount);
            if (stepCount < 8) stats.lowQuality++;
          }
        }
        
        if (stats.withPlans > 0) {
          stats.avgSteps = Math.round(stats.avgSteps / stats.withPlans);
          console.log(`[LLM Planner] 📊 Batch Summary: ${stats.total} countries | Avg steps: ${stats.avgSteps} | Range: ${stats.minSteps}-${stats.maxSteps} | Low quality: ${stats.lowQuality}`);
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
      
      // Attempt 1: Normal analysis with higher token cap
      let response = await fetch(this.apiUrl, {
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
              content: "You are a strategic AI advisor for a nation in a turn-based conquest game. Analyze the country's situation using accurate mechanics and context. Produce the best strategic plan considering economic growth, military security, and expansion opportunities. Return ONLY valid JSON, no explanations."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.4,  // Balanced temperature for varied strategies with reliable JSON
          top_p: 0.9,
          max_tokens: 3000,  // Increased from 2000 to accommodate fuller plans
          response_format: { type: "json_object" }  // Force JSON output
        })
      });

      if (response.ok) {
        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || "";
        
        // Track costs
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
        
        // Cache and persist
        this.lastAnalysisCache.set(cacheKey, analysis);
        const planKey = this.getPlanKey(state.gameId, countryId);
        this.activeStrategicPlans.set(planKey, analysis);
        await this.persistStrategicPlan(state.gameId, countryId, analysis);
        
        this.logStrategyDetails(state, countryId, analysis);
        
        // Clean old cache entries
        if (this.lastAnalysisCache.size > 10) {
          const oldestKeys = Array.from(this.lastAnalysisCache.keys()).slice(0, this.lastAnalysisCache.size - 10);
          oldestKeys.forEach(key => this.lastAnalysisCache.delete(key));
        }
        
        return analysis;
      } else {
        const errorText = await response.text();
        const errorData = JSON.parse(errorText).error || {};
        
        if (errorData.code === "json_validate_failed") {
          console.warn(`[LLM Planner] JSON validation failed on attempt 1, retrying with simplified prompt...`);
          
          // Attempt 2: Retry with simplified prompt and lower temperature
          const simplifiedPrompt = this.buildSimplifiedStrategicPrompt(state, countryId, stats);
          const retryResponse = await fetch(this.apiUrl, {
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
                  content: "You are a strategic AI advisor. Return ONLY valid JSON. No explanations, no markdown."
                },
                {
                  role: "user",
                  content: simplifiedPrompt
                }
              ],
              temperature: 0.2,  // Much lower temperature for reliable JSON
              top_p: 0.8,
              max_tokens: 2000,  // Reduced for simpler schema
              response_format: { type: "json_object" }
            })
          });

          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const retryResponseText = retryData.choices?.[0]?.message?.content || "";
            const analysis = this.parseStrategicAnalysis(retryResponseText, state.turn);
            
            // Validate retry quality
            const stepCount = analysis.planItems?.filter(i => i.kind === 'step').length || 0;
            if (stepCount < 8) {
              console.error(`[LLM Planner] ⚠️ RETRY QUALITY FAILURE: ${countryId} got only ${stepCount}/8 steps after retry`);
            } else {
              console.log(`[LLM Planner] ✓ Retry successful with ${stepCount} steps`);
            }
            
            // Cache and persist
            this.lastAnalysisCache.set(cacheKey, analysis);
            const planKey = this.getPlanKey(state.gameId, countryId);
            this.activeStrategicPlans.set(planKey, analysis);
            await this.persistStrategicPlan(state.gameId, countryId, analysis);
            
            return analysis;
          } else {
            console.error(`[LLM Planner] Retry also failed: ${retryResponse.status}`);
            return null;
          }
        } else {
          console.error(`[LLM Planner] Groq API error: ${response.status} - ${errorText}`);
          return null;
        }
      }
    } catch (error) {
      console.error("[LLM Planner] Error calling Groq:", error);
      if (error instanceof Error) {
        console.error("[LLM Planner] Error details:", error.message);
      }
      return null;
    }
  }
  
  /**
   * Build simplified prompt for retry attempts (minimal schema, fewer examples)
   */
  private buildSimplifiedStrategicPrompt(
    state: GameStateSnapshot,
    countryId: string,
    stats: CountryStats
  ): string {
    const country = state.countries.find(c => c.id === countryId);
    if (!country) return "";
    
    const economicAnalysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
    const resourcesStr = this.compactResourceString(stats.resources || {});
    
    return `SIMPLIFIED RETRY MODE: Previous attempt failed. Generate strategic plan for ${country.name}:

Budget: $${stats.budget} | Tech L${stats.technologyLevel} | Mil ${stats.militaryStrength} (${economicAnalysis.effectiveMilitaryStrength} effective)
Status: ${economicAnalysis.isUnderDefended ? 'Under-defended' : 'OK'} | ${economicAnalysis.turnsUntilBankrupt !== null ? `Bankrupt in ${economicAnalysis.turnsUntilBankrupt}t` : 'Stable'}
Resources: ${resourcesStr}

⚠️ CRITICAL: You MUST generate EXACTLY 8-10 action steps. Plans with fewer than 8 will FAIL VALIDATION.

VALIDATION CHECKLIST (verify before responding):
✓ action_plan has 8-10 steps (MINIMUM 8, MAXIMUM 10) - COUNT THEM!
✓ EVERY step has complete execution object with actionType and actionData
✓ Military steps have subType: "recruit" or "attack"
✓ Economic steps have subType: "infrastructure" and targetLevel
✓ Research steps have targetLevel
✓ NO escaped quotes, NO markdown formatting

Return ONLY this JSON (copy this structure with 8+ steps):
{
  "focus": "economy|military|balanced",
  "rationale": "Brief reason max 80 chars",
  "action_plan": [
    {"id":"s1","instruction":"Research tech level 2","execution":{"actionType":"research","actionData":{"targetLevel":2}}},
    {"id":"s2","instruction":"Recruit 15 troops for defense","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":15}}},
    {"id":"s3","instruction":"Upgrade infrastructure L2","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2}}},
    {"id":"s4","instruction":"Research tech level 3","execution":{"actionType":"research","actionData":{"targetLevel":3}}},
    {"id":"s5","instruction":"Recruit 10 more troops","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}},
    {"id":"s6","instruction":"Upgrade infrastructure L3","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":3}}},
    {"id":"s7","instruction":"Research tech level 4","execution":{"actionType":"research","actionData":{"targetLevel":4}}},
    {"id":"s8","instruction":"Final military buildup","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}}
  ],
  "risks":["Main risk"],
  "diplomacy":{},
  "confidence":0.8
}`;
  }
  
  /**
   * Log detailed strategy information
   */
  private logStrategyDetails(state: GameStateSnapshot, countryId: string, analysis: LLMStrategicAnalysis): void {
    const country = state.countries.find((c: any) => c.id === countryId);
    const stats = state.countryStatsByCountryId[countryId];
    const neighborDistance = 200;
    const currentNeighborRelations = country
      ? state.countries
          .filter((c: any) => c.id !== countryId)
          .map((other: any) => {
            const dx = country.positionX - other.positionX;
            const dy = country.positionY - other.positionY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return { other, distance };
          })
          .filter(({ distance }: any) => distance < neighborDistance)
          .map(({ other }: any) => {
            const otherStats = state.countryStatsByCountryId[other.id];
            const ourToThem = getDiplomaticScore(stats?.diplomaticRelations, other.id);
            const theirToUs = getDiplomaticScore(otherStats?.diplomaticRelations, countryId);
            return `${other.name} (${other.id}): our→them ${ourToThem}/100, them→us ${theirToUs}/100`;
          })
      : [];
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🤖 LLM STRATEGIC DECISION - Turn ${state.turn}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Country: ${country?.name || countryId} (${countryId})`);
    if (currentNeighborRelations.length > 0) {
      console.log(`Current Diplomatic Relations (neighbors):`);
      currentNeighborRelations.forEach((line: any) => console.log(`  - ${line}`));
    }
    console.log(`Focus: ${analysis.strategicFocus.toUpperCase()}`);
    console.log(`Rationale: ${analysis.rationale}`);
    console.log(`Threats: ${analysis.threatAssessment}`);
    console.log(`Opportunities: ${analysis.opportunityIdentified}`);
    console.log(`Recommended Actions:`);
    analysis.recommendedActions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action}`);
    });
    console.log(`LLM Diplomatic Stance (recommended):`, analysis.diplomaticStance);
    console.log(`Confidence: ${(analysis.confidenceScore * 100).toFixed(0)}%`);
    console.log(`Plan Valid Until: Turn ${analysis.turnAnalyzed + this.LLM_CALL_FREQUENCY - 1}`);
    console.log(`${'='.repeat(80)}\n`);
  }
  
  /**
   * Build simplified retry prompt for failed batch parsing
   * Uses shorter, stricter instructions to improve JSON compliance
   */
  private buildRetryBatchPrompt(
    state: GameStateSnapshot,
    countries: Array<{ countryId: string; stats: CountryStats }>,
    cities: City[]
  ): string {
    // Build country details with EXPLICIT countryId mapping
    const countryDetails = countries.map(({ countryId, stats }) => {
      const country = state.countries.find(c => c.id === countryId);
      if (!country) return "";

      const economicAnalysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);

      return `
### ${country.name}
- EXACT countryId TO USE: "${countryId}"
- DO NOT USE: "${country.name}" (this is the name, not the ID!)
- Pop: ${Math.floor(stats.population/1000)}k | Mil: ${stats.militaryStrength} | Budget: $${stats.budget}
- Status: ${economicAnalysis.isUnderDefended ? `UNDER-DEFENDED (deficit: ${Math.round(economicAnalysis.militaryDeficit)})` : 'OK'}`;
    }).join('\n');

    return `${CACHED_GAME_RULES}

PREVIOUS ATTEMPT FAILED JSON VALIDATION. THIS IS A RETRY.

COUNTRIES TO ANALYZE (use EXACT countryId shown below):
${countryDetails}

⚠️ CRITICAL: You MUST use the EXACT countryId UUID shown above. DO NOT use country names!
Example CORRECT: "countryId": "${countries[0]?.countryId}"
Example WRONG: "countryId": "${state.countries.find(c => c.id === countries[0]?.countryId)?.name}" ❌

Return ONLY this JSON structure. NO markdown. NO code blocks. NO explanations. JUST THE JSON:

{
  "countries": [
    {
      "countryId": "USE_EXACT_UUID_FROM_ABOVE",
      "focus": "economy|military|balanced",
      "rationale": "Brief reason max 80 chars",
      "action_plan": [
        {"id":"step1","instruction":"Research tech level 2","execution":{"actionType":"research","actionData":{"targetLevel":2}}},
        {"id":"step2","instruction":"Recruit troops for defense","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":15}}},
        {"id":"step3","instruction":"Upgrade infrastructure","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2}}},
        {"id":"step4","instruction":"Research tech level 3","execution":{"actionType":"research","actionData":{"targetLevel":3}}},
        {"id":"step5","instruction":"More recruitment","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}},
        {"id":"step6","instruction":"Attack if strong enough","execution":{"actionType":"military","actionData":{"subType":"attack","targetCityId":"CITY_UUID","allocatedStrength":25}}},
        {"id":"step7","instruction":"Upgrade infrastructure again","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":3}}},
        {"id":"step8","instruction":"Final tech push","execution":{"actionType":"research","actionData":{"targetLevel":4}}}
      ],
      "diplomacy": {}
    }
  ]
}

VALIDATION CHECKLIST:
✓ EVERY country has EXACT countryId UUID from list above (NOT country name!)
✓ EVERY country has 8-10 action steps (MINIMUM 8, MAXIMUM 10)
✓ EVERY step has complete execution object with actionType and actionData
✓ Military steps have subType: "recruit" or "attack"
✓ Economic steps have subType: "infrastructure" and targetLevel
✓ Research steps have targetLevel
✓ NO country names in countryId field
✓ ALL braces and brackets properly closed

Return ONLY the JSON object. No markdown, no extra text.`;
  }

  /**
   * Generate attack candidate list for a country
   * Returns top 3-5 attackable cities ranked by value/opportunity
   */
  private getAttackCandidates(
    state: GameStateSnapshot,
    countryId: string,
    stats: CountryStats,
    cities: City[]
  ): string {
    const ourEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(stats);
    const candidates: Array<{
      city: City;
      defenderStats: CountryStats;
      defenderEffectiveStrength: number;
      cityValue: number;
      estimatedCost: number;
      strengthRatio: number;
    }> = [];

    // Find attackable cities (not owned by us, not under attack)
    for (const city of cities) {
      if (city.countryId === countryId || city.isUnderAttack) continue;

      const defenderStats = state.countryStatsByCountryId[city.countryId];
      if (!defenderStats) continue;

      const defenderEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(defenderStats);
      const strengthRatio = ourEffectiveStrength / defenderEffectiveStrength;
      const cityValue = calculateCityValue(city);

      // Only consider cities where we have a strength advantage
      if (strengthRatio >= 1.2) {
        // Estimate attack cost (typical allocation: 80% of our strength)
        const typicalAllocation = Math.floor(stats.militaryStrength * 0.8);
        const estimatedCost = ActionPricing.calculateAttackPricing(typicalAllocation).cost;

        candidates.push({
          city,
          defenderStats,
          defenderEffectiveStrength,
          cityValue,
          estimatedCost,
          strengthRatio
        });
      }
    }

    // Sort by city value (highest first) and take top 5
    candidates.sort((a, b) => b.cityValue - a.cityValue);
    const topCandidates = candidates.slice(0, 5);

    if (topCandidates.length === 0) {
      return "No attack opportunities (insufficient military advantage)";
    }

    const candidateStrings = topCandidates.map(c => {
      const defender = state.countries.find(co => co.id === c.city.countryId);
      return `cityId:${c.city.id} (owner:${c.city.countryId}, ${defender?.name || 'Unknown'}, Eff ${c.defenderEffectiveStrength}, Value ${c.cityValue}, Cost $${c.estimatedCost}, Ratio ${(c.strengthRatio).toFixed(1)}x)`;
    });

    return candidateStrings.join('; ');
  }

  /**
   * Generate affordability block showing action costs and resource penalties
   * Format: "Research:$1200(1.4x,missing:coal,oil) Infra:$800(1.0x) Recruit15:$450(1.2x,missing:iron)"
   */
  private getAffordabilityBlock(stats: CountryStats): string {
    const parts: string[] = [];

    // Research affordability
    try {
      const researchPricing = ActionPricing.calculateResearchPricing(stats);
      const missing = researchPricing.resourceCostInfo.missing.map(r => r.resourceId).join(',');
      const missingStr = missing ? `,missing:${missing}` : '';
      parts.push(`Research:$${researchPricing.cost}(${researchPricing.resourceCostInfo.penaltyMultiplier}x${missingStr})`);
    } catch (e) {
      parts.push('Research:ERROR');
    }

    // Infrastructure affordability
    try {
      const infraPricing = ActionPricing.calculateInfrastructurePricing(stats);
      const missing = infraPricing.resourceCostInfo.missing.map(r => r.resourceId).join(',');
      const missingStr = missing ? `,missing:${missing}` : '';
      parts.push(`Infra:$${infraPricing.cost}(${infraPricing.resourceCostInfo.penaltyMultiplier}x${missingStr})`);
    } catch (e) {
      parts.push('Infra:ERROR');
    }

    // Recruitment affordability (15 units standard)
    try {
      const recruitPricing = ActionPricing.calculateRecruitmentPricing(15, stats);
      const missing = recruitPricing.resourceCostInfo.missing.map(r => r.resourceId).join(',');
      const missingStr = missing ? `,missing:${missing}` : '';
      parts.push(`Recruit15:$${recruitPricing.cost}(${recruitPricing.resourceCostInfo.penaltyMultiplier}x${missingStr})`);
    } catch (e) {
      parts.push('Recruit15:ERROR');
    }

    return parts.join(' ');
  }

  /**
   * Generate compact resource string for LLM prompts (token-efficient)
   * Format: "Fd200 T80 Fe40 !O !St" = Has food/timber/iron, needs oil/steel
   */
  private compactResourceString(resources: Record<string, number>): string {
    const abbrev: Record<string, string> = {
      food: 'Fd', timber: 'T', iron: 'Fe', oil: 'O',
      gold: 'Au', copper: 'Cu', steel: 'St', coal: 'C'
    };
    
    const parts: string[] = [];
    for (const [id, amt] of Object.entries(resources)) {
      if (amt > 10) {
        // Only show resources with meaningful amounts
        parts.push(`${abbrev[id] || id}${Math.floor(amt)}`);
      } else if (amt === 0) {
        // Show missing critical resources (optional - can be removed to save tokens)
        // For now, only show if it's a strategic resource
        if (['iron', 'oil', 'steel', 'coal'].includes(id)) {
          parts.push(`!${abbrev[id] || id}`);
        }
      }
    }
    
    return parts.length > 0 ? parts.join(' ') : 'None';
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
    
    // Get compact resource string and affordability block
    const resourcesStr = this.compactResourceString(stats.resources || {});
    const affordabilityStr = this.getAffordabilityBlock(stats);

    return `${CACHED_GAME_RULES}

${country.name} (T${state.turn}): Pop ${(stats.population/1000).toFixed(0)}k | $${(stats.budget).toFixed(0)} | Tech L${stats.technologyLevel} | Infra L${stats.infrastructureLevel || 0} | Mil ${stats.militaryStrength} (${economicAnalysis.effectiveMilitaryStrength} effective) | ${stats.resourceProfile?.name || "Balanced"}
Resources: ${resourcesStr}
Affordability: ${affordabilityStr}
Income: $${economicAnalysis.netIncome}/t | ${economicAnalysis.isUnderDefended ? `UNDER-DEFENDED (deficit: ${Math.round(economicAnalysis.militaryDeficit)})` : 'OK'} | ${economicAnalysis.turnsUntilBankrupt !== null ? `Bankrupt in ${economicAnalysis.turnsUntilBankrupt}t` : 'Stable'}

NEIGHBORS: ${neighbors}

Plan ${this.LLM_CALL_FREQUENCY} turns (2-3 actions/turn, capped per turn). Include at least one fallback step with "when" condition. Consider BOTH economic AND military strategies.
IMPORTANT: Use "stop_when" conditions (e.g., stop_when: {tech_level_gte: X}) to allow steps to repeat across multiple turns. Steps without stop_when are executed only once.

CRITICAL REQUIREMENT: You MUST generate between 8-10 action steps. Plans with fewer than 8 steps will be marked as LOW QUALITY and may fail validation.
- If a country is wealthy/stable: Add economic diversification (multiple infra upgrades, trading strategies)
- If a country is weak: Add defensive military steps + economic recovery steps (infrastructure, resource management)
- If a country is aggressive: Add attack sequences with preparatory recruitment
- Use repeatable steps (with stop_when) to ensure plan longevity across multiple turns

JSON ONLY - EXAMPLE STRATEGIES:

ECONOMIC FOCUS:
{"focus":"economy","rationale":"Build tech advantage","action_plan":[
  {"id":"tech_l2","instruction":"Tech→L2","priority":1,"stop_when":{"tech_level_gte":2},"execution":{"actionType":"research","actionData":{"targetLevel":2}}},
  {"id":"recruit_30","instruction":"Recruit→30 for defense","priority":2,"stop_when":{"military_strength_gte":30},"execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}},
  {"id":"infra_l2","instruction":"Infra→L2","priority":3,"when":{"budget_gte":1000},"stop_when":{"infra_level_gte":2},"execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2}}},
  {"id":"conservative_infra","instruction":"Infra→L1 if budget tight","priority":4,"when":{"budget_lt":500},"execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":1}}}
]}

MILITARY FOCUS:
{"focus":"military","rationale":"Strong mil, weak neighbors - expand","action_plan":[
  {"id":"recruit_50","instruction":"Recruit→50","priority":1,"stop_when":{"military_strength_gte":50},"execution":{"actionType":"military","actionData":{"subType":"recruit","amount":15}}},
  {"id":"attack_weak","instruction":"Attack weakest neighbor city","priority":2,"when":{"military_strength_gte":45},"execution":{"actionType":"military","actionData":{"subType":"attack","targetCityId":"<CITY_ID>","allocatedStrength":30}}},
  {"id":"tech_l2","instruction":"Tech→L2 after conquest","priority":3,"when":{"budget_gte":1200},"stop_when":{"tech_level_gte":2},"execution":{"actionType":"research","actionData":{"targetLevel":2}}},
  {"id":"defensive_recruit","instruction":"Recruit→30 for defense if threatened","priority":4,"when":{"budget_lt":300},"stop_when":{"military_strength_gte":30},"execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}}
]}

CRITICAL: MILITARY ACTIONS MUST HAVE CORRECT SCHEMA

❌ WRONG - Missing subType (WILL BE FILTERED OUT and not executed):
{"id":"recruit","instruction":"Recruit troops","execution":{"actionType":"military","actionData":{"amount":15}}}
^ This will be REJECTED. The game engine looks for subType field.

✅ CORRECT - Always include subType:
{"id":"recruit","instruction":"Recruit troops","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":15}}}

EVERY military step MUST specify subType as either "recruit" or "attack". If you omit it, the step will be filtered out and NOT executed.

REQUIRED STRUCTURE:
{
  "focus": "economy"|"military"|"balanced",
  "rationale": "Brief strategic reasoning",
  "action_plan": [
    // REQUIRED: 8-10 executable steps (minimum 8, maximum 10)
    // Use stop_when to allow repeatable steps, omit for one-time steps
    // Example repeatable: {"id":"tech3","instruction":"Upgrade tech to L3","stop_when":{"tech_level_gte":3},"execution":{"actionType":"research","actionData":{"targetLevel":3}}}
    // Example one-time: {"id":"attack1","instruction":"Attack weak neighbor","execution":{"actionType":"military","actionData":{"subType":"attack","targetCityId":"UUID","allocatedStrength":30}}}
  ],
  "risks": ["Top risk #1", "Top risk #2"],
  "plan_rationale": "Why these specific steps",
  "diplomacy": {${neighbors
  .split('\n')
  .filter(n => n.trim())
  .map(n => {
    const match = n.match(/- .*\\(([^)]+)\\):/);
    return match ? `"${match[1].trim()}":"neutral"` : '';
  })
  .filter(Boolean)
  .join(',')}},
  "confidence": 0.9
}

STEP FORMAT: {"id": "unique_id", "instruction": "What to do", "when": {...}, "stop_when": {...}, "execution": {"actionType": "research|economic|military", "actionData": {...}}}

VALIDATION CHECKLIST (verify before responding):
✓ EVERY action has an "execution" object
✓ Military steps have execution.actionData.subType as "recruit" or "attack"
✓ Economic steps have execution.actionData.subType as "infrastructure"
✓ Research steps have execution.actionData.targetLevel
✓ Plan has 8-10 total steps (REQUIRED: minimum 8, maximum 10)
✓ countryId matches exactly one of the provided IDs (case-sensitive)

BE LLM-LED: Choose the best strategy yourself. Only validate executability at engine boundary.`;
  }
  
  /**
   * Get summary of neighboring countries (show threats AND opportunities)
   */
  private getNeighborsSummary(state: GameStateSnapshot, countryId: string, stats: CountryStats): string {
    const country = state.countries.find(c => c.id === countryId);
    if (!country) return "None";

    const neighborDistance = 200;
    const neighbors: string[] = [];
    const ourEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(stats);

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
          const otherEffectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(otherStats);
          const isThreat = otherEffectiveStrength > ourEffectiveStrength * 1.2 || ourToThem < 30;
          const isOpportunity = otherEffectiveStrength < ourEffectiveStrength * 0.7; // We're much stronger

          // Show threats (always), opportunities (always), and first 2 regular neighbors
          if (isThreat || isOpportunity || neighbors.length < 2) {
            let label = '';
            if (isThreat) label = ' ⚠️THREAT';
            else if (isOpportunity) label = ' 🎯WEAK (conquest opportunity)';

            const strengthRatio = otherEffectiveStrength / ourEffectiveStrength;
            neighbors.push(
              `- ${otherCountry.name} (${otherCountry.id}): Rel ${ourToThem}, Eff ${otherEffectiveStrength} (Raw ${otherStats.militaryStrength}), Ratio ${(strengthRatio).toFixed(2)}x${label}`
            );
          }
        }
      }
    }

    return neighbors.length > 0 ? neighbors.join('\n') : "No notable neighbors";
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
    countries: Array<{ countryId: string; stats: CountryStats }>,
    cities: City[]
  ): string {
    const countryPrompts = countries.map(({ countryId, stats }) => {
      const country = state.countries.find(c => c.id === countryId);
      if (!country) return "";

      const economicAnalysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
      const neighbors = this.getNeighborsSummary(state, countryId, stats);
      const attackCandidates = this.getAttackCandidates(state, countryId, stats, cities);

      const resourcesStr = this.compactResourceString(stats.resources || {});
      const affordabilityStr = this.getAffordabilityBlock(stats);

      return `
### ${country.name}
⚠️ EXACT countryId TO USE: "${countryId}"
⚠️ DO NOT USE: "${country.name}" (this is the name, NOT the ID!)
Pop: ${(stats.population/1000).toFixed(0)}k | $${(stats.budget).toFixed(0)} | Tech L${stats.technologyLevel} | Infra L${stats.infrastructureLevel || 0} | Mil ${stats.militaryStrength} (${economicAnalysis.effectiveMilitaryStrength} effective) | ${stats.resourceProfile?.name || "Balanced"}
Resources: ${resourcesStr}
Affordability: ${affordabilityStr}
Income: $${economicAnalysis.netIncome}/t | ${economicAnalysis.isUnderDefended ? `UNDER-DEFENDED (deficit: ${Math.round(economicAnalysis.militaryDeficit)})` : 'OK'} | ${economicAnalysis.turnsUntilBankrupt !== null ? `Bankrupt in ${economicAnalysis.turnsUntilBankrupt}t` : 'Stable'}
Neighbors: ${neighbors.split('\n').join('; ')}
Attack Candidates: ${attackCandidates}`;
    }).join('\n');

    const countryIdsList = countries.map(c => c.countryId).join(', ');

    return `${CACHED_GAME_RULES}

Mechanics version: ${LLMStrategicPlanner.getMechanicsVersion()}

Plan ${this.LLM_CALL_FREQUENCY} turns (2-3 actions/turn). Consider BOTH economic AND military strategies.

COUNTRIES TO ANALYZE:
${countryPrompts}

⚠️ CRITICAL CONSTRAINT: countryId MUST be EXACT UUID from this list:
${countries.map(c => {
  const country = state.countries.find(co => co.id === c.countryId);
  return `  - "${c.countryId}"  ← Use this exact UUID for ${country?.name || 'country'}`;
}).join('\n')}

⚠️ DO NOT use country names like "Borealis" or "Cyrenia" - these will FAIL validation!
⚠️ ONLY use the full UUID strings shown above!

JSON RULES:
1. Return ONLY JSON with "countries" array
2. Each country: countryId, focus, rationale, action_plan (8-10 items), diplomacy
3. Each action: id, instruction, execution (actionType + actionData)
4. Use exact countryId from list above (full UUID)

EXAMPLE (COPY THIS EXACT STRUCTURE WITH YOUR COUNTRIES):
{
  "countries": [
    {
      "countryId": "${countries[0]?.countryId || 'USE_EXACT_UUID_FROM_LIST_ABOVE'}",
      "focus": "balanced",
      "rationale": "Build economy and military strength",
      "action_plan": [
        {"id":"tech1","instruction":"Upgrade tech to L2","execution":{"actionType":"research","actionData":{"targetLevel":2}}},
        {"id":"recruit1","instruction":"Recruit 15 troops","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":15}}},
        {"id":"infra1","instruction":"Upgrade infrastructure to L1","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":1}}},
        {"id":"tech2","instruction":"Upgrade tech to L3","execution":{"actionType":"research","actionData":{"targetLevel":3}}},
        {"id":"recruit2","instruction":"Recruit 10 more troops","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10}}},
        {"id":"infra2","instruction":"Upgrade infrastructure to L2","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2}}},
        {"id":"attack1","instruction":"Attack weak neighbor","execution":{"actionType":"military","actionData":{"subType":"attack","targetCityId":"CITY_UUID_FROM_ATTACK_CANDIDATES","allocatedStrength":25}}},
        {"id":"tech3","instruction":"Upgrade tech to L4","execution":{"actionType":"research","actionData":{"targetLevel":4}}}
      ],
      "diplomacy": {}
    }
  ]
}

Note: This example has exactly 8 steps. You can add up to 10 steps per country.

STEP REQUIREMENTS BY TYPE:

Research: 
  {"id":"id","instruction":"text","execution":{"actionType":"research","actionData":{"targetLevel":2-5}}}

Economic:
  {"id":"id","instruction":"text","execution":{"actionType":"economic","actionData":{"subType":"infrastructure","targetLevel":2-5}}}

Military (Recruit):
  {"id":"id","instruction":"text","execution":{"actionType":"military","actionData":{"subType":"recruit","amount":10-30}}}

Military (Attack):
  {"id":"id","instruction":"text","execution":{"actionType":"military","actionData":{"subType":"attack","targetCityId":"CITY_UUID","allocatedStrength":20-50}}}

VALIDATION CHECKLIST BEFORE RESPONDING:
✓ countryId is EXACT UUID from list above (NOT country name!)
✓ Plan has 8-10 total steps per country (REQUIRED: minimum 8, maximum 10)
✓ EVERY action has "execution" object with actionType and actionData
✓ Military steps have execution.actionData.subType as "recruit" or "attack"
✓ Economic steps have execution.actionData.subType as "infrastructure" and targetLevel
✓ Research steps have execution.actionData.targetLevel
✓ No country names in countryId field (only UUIDs)
✓ No escaped characters, only valid JSON
✓ All closing braces and brackets match

SCHEMA: Return JSON with "countries" array. Each country MUST have:
- countryId: EXACT UUID from the list above (e.g., "406b9182-a2eb-40c7-9854-190a5ddc6eb5")
  ⚠️ NEVER use country names! ONLY use the full UUID!
- focus: "economy"|"military"|"balanced"
- rationale: Brief reason (max 100 chars)
- action_plan: Array of EXACTLY 8-10 executable steps (REQUIRED: minimum 8, maximum 10)
  ⚠️ Plans with fewer than 8 steps will FAIL validation!
- diplomacy: Object (can be empty {})

STEP SCHEMA: {"id": "unique_id", "instruction": "What to do", "priority": 1-5, "execution": {"actionType": "research"|"economic"|"military", "actionData": {...}}, "when": {...}, "stop_when": {...}}

STEP REPEATABILITY:
- Use "stop_when" for steps that should repeat until goal met (tech upgrades, recruiting to threshold)
- Omit "stop_when" for one-time actions (attacks, specific trades)
- Example repeatable: {"id":"tech_l4","stop_when":{"tech_level_gte":4},"execution":{...}}
- Example one-time: {"id":"attack_city","execution":{"actionType":"military",...}}

CRITICAL: Military steps MUST include subType:
❌ WRONG: {"execution": {"actionType": "military", "actionData": {"amount": 15}}}
✅ CORRECT: {"execution": {"actionType": "military", "actionData": {"subType": "recruit", "amount": 15}}}

For attack actions, include targetCityId from Attack Candidates list.
For recruit actions, include amount (10-15 typical).
Without subType, military steps will be filtered out and NOT executed.

PLAN SIZE REQUIREMENT: Every country MUST have 8-10 steps. No exceptions. If a country is wealthy/stable, add economic diversification. If weak, add defensive military + economic recovery.

ATTACKS: Include when militarily stronger than neighbors. Use targetCityId from Attack Candidates above.

ECONOMIC FOCUS: For weak/bankrupt nations only.`;
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
      
      // Parse JSON - handle multiple formats the LLM might return
      let parsedObject = JSON.parse(cleanedResponse);
      
      // DEFENSIVE: Handle extra array wrapper [{"countries":[...]}] -> {"countries":[...]}
      if (Array.isArray(parsedObject) && parsedObject.length > 0 && parsedObject[0]?.countries) {
        console.log("[LLM Planner] Detected array wrapper, unwrapping to object");
        parsedObject = parsedObject[0];
      }
      
      // PHASE 1 FIX: Validate JSON structure before further processing
      try {
        if (!parsedObject.countries || !Array.isArray(parsedObject.countries)) {
          throw new Error("Invalid structure: missing or non-array 'countries' field");
        }
        
        if (parsedObject.countries.length === 0) {
          throw new Error("Invalid structure: 'countries' array is empty");
        }
        
        // Check for malformed objects
        for (let i = 0; i < parsedObject.countries.length; i++) {
          const country = parsedObject.countries[i];
          
          if (!country || typeof country !== 'object') {
            throw new Error(`Country ${i}: invalid type (not an object)`);
          }
          
          if (!country.countryId || typeof country.countryId !== 'string') {
            throw new Error(`Country ${i}: missing or invalid countryId field`);
          }
          
          if (!country.focus || typeof country.focus !== 'string') {
            throw new Error(`Country ${i}: missing or invalid focus field`);
          }
          
          if (!Array.isArray(country.action_plan)) {
            throw new Error(`Country ${i}: missing or non-array action_plan field`);
          }
          
          // PHASE 3: Updated requirement - 8-10 steps (was 6-8)
          if (country.action_plan.length < 8) {
            throw new Error(`Country ${i}: action_plan has only ${country.action_plan.length} steps (minimum 8 required, UPDATED from 6)`);
          }
          
          if (country.action_plan.length > 10) {
            throw new Error(`Country ${i}: action_plan has ${country.action_plan.length} steps (maximum 10 allowed)`);
          }
          
          // Validate each action in the plan
          for (let j = 0; j < country.action_plan.length; j++) {
            const action = country.action_plan[j];
            
            if (!action || typeof action !== 'object') {
              throw new Error(`Country ${i}, action ${j}: invalid type (not an object)`);
            }
            
            if (!action.id || typeof action.id !== 'string') {
              throw new Error(`Country ${i}, action ${j}: missing or invalid id field`);
            }
            
            if (!action.instruction || typeof action.instruction !== 'string') {
              throw new Error(`Country ${i}, action ${j}: missing or invalid instruction field`);
            }
            
            if (!action.execution || typeof action.execution !== 'object') {
              throw new Error(`Country ${i}, action ${j} (${action.id}): missing or invalid execution field`);
            }
            
            const exec = action.execution;
            if (!exec.actionType || typeof exec.actionType !== 'string') {
              throw new Error(`Country ${i}, action ${j} (${action.id}): missing or invalid execution.actionType`);
            }
            
            if (!exec.actionData || typeof exec.actionData !== 'object') {
              throw new Error(`Country ${i}, action ${j} (${action.id}): missing or invalid execution.actionData`);
            }
          }
        }
      } catch (validationError) {
        console.error("[LLM Planner] Batch JSON validation failed:", validationError);
        console.error("[LLM Planner] Raw response (first 800 chars):", cleanedResponse.substring(0, 800));
        return results; // Early return to trigger retry
      }
      
      // Extract countries array from wrapper object
      const parsedArray = parsedObject.countries || parsedObject;
      
      if (!Array.isArray(parsedArray)) {
        console.error("[LLM Planner] Expected countries array in batch response, got:", typeof parsedArray);
        return results;
      }
      
      // Build allowed country IDs set for validation
      const allowedCountryIds = new Set(countries.map(c => c.countryId));
      
      // UUID regex for normalization
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidInStringRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
      
      let parsedCount = 0;
      let matchedAllowedCount = 0;
      let warnedAboutNormalization = false;
      
      // Process each country's analysis
      for (const parsed of parsedArray) {
        let countryId = parsed.countryId;
        if (!countryId) {
          console.warn("[LLM Planner] Country analysis missing countryId");
          continue;
        }
        
        parsedCount++;
        
        // CRITICAL: Normalize countryId - extract UUID if embedded in string
        // Handle cases like: "Eldoria (47d3…)", "47d3…,", "47d3…d", etc.
        if (!uuidRegex.test(String(countryId))) {
          const str = String(countryId);
          
          // Try extracting UUID from various formats
          const match = str.match(uuidInStringRegex);
          if (match?.[1]) {
            countryId = match[1];
            if (!warnedAboutNormalization) {
              console.log("[LLM Planner] Normalized batch countryId (extracted from string):", { original: parsed.countryId, normalized: countryId });
              warnedAboutNormalization = true;
            }
          } else {
            // Try removing common trailing characters
            const cleaned = str.replace(/[,;.\s]+$/, '').trim();
            if (uuidRegex.test(cleaned)) {
              countryId = cleaned;
              if (!warnedAboutNormalization) {
                console.log("[LLM Planner] Normalized batch countryId (removed trailing chars):", { original: parsed.countryId, normalized: countryId });
                warnedAboutNormalization = true;
              }
            }
          }
        }
        
        // Validate against allowed IDs
        if (!allowedCountryIds.has(String(countryId))) {
          // Try case-insensitive match as fallback
          const normalizedId = String(countryId).toLowerCase();
          const matchedId = Array.from(allowedCountryIds).find(id => 
            id.toLowerCase() === normalizedId
          );
          
          if (matchedId) {
            if (!warnedAboutNormalization) {
              console.log("[LLM Planner] Normalized countryId case sensitivity:", { original: countryId, normalized: matchedId });
              warnedAboutNormalization = true;
            }
            countryId = matchedId;
          } else {
            console.warn(`[LLM Planner] ⚠️ Batch countryId not in allowed set (normalized: "${countryId}", original: "${parsed.countryId}")`);
            console.warn(`[LLM Planner] Allowed IDs: [${Array.from(allowedCountryIds).slice(0, 3).join(', ')}${allowedCountryIds.size > 3 ? '...' : ''}]`);
            continue;
          }
        }
        
        matchedAllowedCount++;
        
        // Use existing single-country parser logic
        const strategicFocus = ["economy", "military", "diplomacy", "research", "balanced"].includes(parsed.focus)
          ? parsed.focus as LLMStrategicAnalysis["strategicFocus"]
          : "balanced";
        
        const rationale = (parsed.rationale || "Strategic analysis completed").substring(0, 200);
        const threatAssessment = parsed.threats || "Normal threat level";
        const opportunityIdentified = parsed.opportunities || "Multiple opportunities available";
        const planItems = this.parsePlanItems(parsed);
        
        // PHASE 2 FIX: Validate execution schema for each plan item
        const validatedItems: LLMPlanItem[] = [];
        let invalidCount = 0;
        
        for (const item of planItems) {
          if (item.kind === 'step' && item.execution) {
            const { actionType, actionData } = item.execution;
            let isValid = true;
            
            // Validate military actions
            if (actionType === 'military') {
              if (!actionData?.subType || !['recruit', 'attack'].includes(actionData.subType as string)) {
                console.warn(`[LLM Planner] ⚠️ Invalid military step "${item.id}": missing or invalid subType (got: ${actionData?.subType})`);
                invalidCount++;
                isValid = false;
              }
            }
            
            // Validate economic actions
            if (actionType === 'economic') {
              if (!actionData?.subType || actionData.subType !== 'infrastructure') {
                console.warn(`[LLM Planner] ⚠️ Invalid economic step "${item.id}": missing or invalid subType (expected: infrastructure, got: ${actionData?.subType})`);
                invalidCount++;
                isValid = false;
              }
              if (!actionData?.targetLevel) {
                console.warn(`[LLM Planner] ⚠️ Invalid economic step "${item.id}": missing targetLevel`);
                invalidCount++;
                isValid = false;
              }
            }
            
            // Validate research actions
            if (actionType === 'research') {
              if (!actionData?.targetLevel) {
                console.warn(`[LLM Planner] ⚠️ Invalid research step "${item.id}": missing targetLevel`);
                invalidCount++;
                isValid = false;
              }
            }
            
            if (isValid) {
              validatedItems.push(item);
            }
          } else {
            // Keep constraints and steps without execution
            validatedItems.push(item);
          }
        }
        
        if (invalidCount > 0) {
          console.log(`[LLM Planner] Validated ${validatedItems.length}/${planItems.length} steps (${invalidCount} invalid skipped)`);
        }
        
        const recommendedActionsFromPlan =
          validatedItems && validatedItems.length > 0
            ? validatedItems
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
              // Also normalize diplomacy keys if needed
              let diplomacyKey = country.trim();
              if (!uuidRegex.test(diplomacyKey)) {
                const match = diplomacyKey.match(uuidInStringRegex);
                if (match?.[1]) {
                  diplomacyKey = match[1];
                }
              }
              diplomaticStance[diplomacyKey] = stance as "friendly" | "neutral" | "hostile";
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
          planItems: validatedItems.length > 0 ? validatedItems : undefined,
          diplomaticStance,
          confidenceScore,
          turnAnalyzed: turn,
        };
        
        // VALIDATION: Check plan quality
        const stepCount = validatedItems.filter(i => i.kind === 'step').length;
        const executableCount = validatedItems.filter(i => i.kind === 'step' && i.execution).length;
        
        if (stepCount < 8) {
          console.warn(`[LLM Planner] ⚠️ Plan quality LOW for ${countryId}: only ${stepCount}/8 steps (${executableCount} executable)`);
        }
        
        if (executableCount < 6) {
          console.warn(`[LLM Planner] ⚠️ Plan quality LOW for ${countryId}: only ${executableCount}/8 executable steps`);
        }
        
        results.set(String(countryId), analysis);
      }
      
      console.log(`[LLM Planner] ✓ Successfully parsed ${parsedCount}/${countries.length} analyses, ${matchedAllowedCount}/${parsedCount} matched allowed IDs`);
      
      // If we parsed entries but none matched allowed IDs, log diagnostic
      if (parsedCount > 0 && results.size === 0) {
        console.error(`[LLM Planner] ✗ Batch parsing: ${parsedCount} entries parsed but 0 matched allowed country IDs`);
        console.error(`[LLM Planner] Allowed IDs: [${Array.from(allowedCountryIds).slice(0, 3).join(', ')}${allowedCountryIds.size > 3 ? '...' : ''}]`);
      }
      
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
