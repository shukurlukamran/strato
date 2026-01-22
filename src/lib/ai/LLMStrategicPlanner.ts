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

STRATEGIC ADVISOR FOR: ${country.name} (Turn ${state.turn})

STATS:
Pop: ${stats.population.toLocaleString()} | Budget: $${stats.budget.toLocaleString()} | Tech: L${stats.technologyLevel} | Infra: L${stats.infrastructureLevel || 0} | Mil: ${stats.militaryStrength}
Profile: ${stats.resourceProfile?.name || "Balanced"}

ECONOMY:
Income: $${economicAnalysis.netIncome}/turn | ${economicAnalysis.isUnderDefended ? 'UNDER-DEFENDED' : 'Defended OK'} | ${economicAnalysis.turnsUntilBankrupt !== null ? `Bankruptcy: ${economicAnalysis.turnsUntilBankrupt}t` : 'Stable'}

TOP RESOURCES: ${Object.entries(stats.resources).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, amt]) => `${r}:${amt}`).join(' | ')}

NEIGHBORS:
${neighbors}

What should ${country.name} do for the next ${this.LLM_CALL_FREQUENCY} turns?

RESPOND WITH ONLY THIS JSON (no markdown, no text):
{
  "focus": "economy"|"military"|"research"|"balanced",
  "rationale": "Why this focus? (max 150 chars)",
  "threats": "Specific threats with numbers",
  "opportunities": "Specific opportunities with numbers",
  "action_plan": [
    {
      "id": "upgrade_tech_l3",
      "instruction": "Upgrade Technology to Level 3",
      "priority": 1,
      "execution": { "actionType": "research", "actionData": { "targetLevel": 3 } }
    },
    {
      "id": "upgrade_infra_l2",
      "instruction": "Upgrade Infrastructure to Level 2",
      "priority": 2,
      "execution": { "actionType": "economic", "actionData": { "subType": "infrastructure", "targetLevel": 2 } }
    },
    {
      "id": "recruit_to_50",
      "instruction": "Recruit to 50 strength",
      "priority": 3,
      "stop_when": { "military_strength_gte": 50 },
      "execution": { "actionType": "military", "actionData": { "subType": "recruit", "amount": 10 } }
    }
  ],
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

RULES:
1. ONLY create EXECUTABLE steps (tech/infra upgrades, recruit, attack)
2. NO passive steps (maintain, monitor, avoid, delay)
3. ALL steps MUST have "execution" field with correct format
4. Use exact examples above for format
5. diplomacy keys = neighbor IDs (in parentheses)
6. 3-5 steps max, prioritized by urgency`;
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
