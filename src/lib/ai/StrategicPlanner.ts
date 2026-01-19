import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { RuleBasedAI } from "./RuleBasedAI";
import { DefaultPersonality, type AIPersonality } from "./Personality";

export interface StrategyIntent {
  focus: "economy" | "military" | "diplomacy" | "research" | "balanced";
  rationale: string;
}

/**
 * Strategic Planner
 * Analyzes game state and determines high-level strategic focus for the country
 * Uses rule-based logic to make intelligent decisions
 */
export class StrategicPlanner {
  private personality: AIPersonality;

  constructor(personality: AIPersonality = DefaultPersonality) {
    this.personality = personality;
  }

  /**
   * Determine strategic focus for this turn
   */
  plan(state: GameStateSnapshot, countryId: string): StrategyIntent {
    const stats = state.countryStatsByCountryId[countryId];
    
    if (!stats) {
      return { focus: "balanced", rationale: "Country not found, using default strategy." };
    }

    // Analyze current situation
    const analysis = RuleBasedAI.analyzeEconomicSituation(state, countryId, stats);
    
    // CRISIS PRIORITIES (override everything)
    
    // Food crisis - focus on economy/infrastructure
    if (analysis.foodTurnsRemaining !== null && analysis.foodTurnsRemaining < 5) {
      return {
        focus: "economy",
        rationale: `CRISIS: Food shortage in ${analysis.foodTurnsRemaining} turns. Must boost production.`,
      };
    }
    
    // Bankruptcy crisis - focus on economy
    if (analysis.turnsUntilBankrupt !== null && analysis.turnsUntilBankrupt < 3) {
      return {
        focus: "economy",
        rationale: `CRISIS: Bankruptcy in ${analysis.turnsUntilBankrupt} turns. Minimize spending, boost revenue.`,
      };
    }
    
    // Military crisis - focus on defense
    if (analysis.isUnderDefended && analysis.militaryDeficit > 40) {
      return {
        focus: "military",
        rationale: `THREAT: Military strength ${analysis.militaryDeficit} below recommended. Need defense.`,
      };
    }
    
    // STRATEGIC PRIORITIES (normal gameplay)
    
    // Early game - focus on economy/research
    if (state.turn < 10) {
      if (stats.technologyLevel < 2) {
        return {
          focus: "research",
          rationale: "Early game: Invest in technology for long-term growth.",
        };
      } else {
        return {
          focus: "economy",
          rationale: "Early game: Build economic foundation with infrastructure.",
        };
      }
    }
    
    // Technology advantage opportunity
    if (analysis.researchROI < 35 && stats.technologyLevel < 4) {
      return {
        focus: "research",
        rationale: `Excellent research ROI (${analysis.researchROI} turns). Invest in technology.`,
      };
    }
    
    // Infrastructure advantage opportunity
    if (analysis.infrastructureROI < 25 && (stats.infrastructureLevel || 0) < 5) {
      return {
        focus: "economy",
        rationale: `Excellent infrastructure ROI (${analysis.infrastructureROI} turns). Build economy.`,
      };
    }
    
    // Wealthy nation - can afford to invest in tech
    if (analysis.currentBudget > 10000 && analysis.netIncome > 500) {
      return {
        focus: "research",
        rationale: "Strong economy. Invest in advanced technology for future dominance.",
      };
    }
    
    // Military buildup (aggressive personality or defensive need)
    if (this.personality.aggression > 0.6 && analysis.militaryDeficit > 10) {
      return {
        focus: "military",
        rationale: "Aggressive stance. Build military strength for expansion.",
      };
    }
    
    // Cooperative personality - focus on diplomacy
    if (this.personality.cooperativeness > 0.7 && !analysis.isUnderDefended) {
      return {
        focus: "diplomacy",
        rationale: "Cooperative approach. Seek alliances and trade partnerships.",
      };
    }
    
    // Resource profile specialization strategy
    if (stats.resourceProfile) {
      const profile = stats.resourceProfile;
      
      // Agriculture/Coastal - leverage food advantage
      if (profile.name === "Agriculture" || profile.name === "Coastal Trading Hub") {
        if (analysis.foodBalance > 50) {
          return {
            focus: "diplomacy",
            rationale: `${profile.name}: Food surplus. Trade for technology and resources.`,
          };
        }
      }
      
      // Mining/Industrial - need infrastructure for production
      if (profile.name === "Mining Empire" || profile.name === "Industrial Complex") {
        if ((stats.infrastructureLevel || 0) < 4) {
          return {
            focus: "economy",
            rationale: `${profile.name}: Build infrastructure to maximize resource extraction.`,
          };
        }
      }
      
      // Technological Hub - double down on tech
      if (profile.name === "Technological Hub") {
        if (stats.technologyLevel < 5) {
          return {
            focus: "research",
            rationale: `${profile.name}: Leverage tech advantage. Pursue advanced research.`,
          };
        }
      }
      
      // Oil Kingdom / Precious Metals - trade focus
      if (profile.name === "Oil Kingdom" || profile.name === "Precious Metals Trader") {
        return {
          focus: "diplomacy",
          rationale: `${profile.name}: High-value resources. Trade for strategic advantage.`,
        };
      }
    }
    
    // Mid-game balanced approach (if no clear priority)
    if (state.turn >= 10 && state.turn < 30) {
      const techDeficit = 3 - stats.technologyLevel;
      const infraDeficit = 3 - (stats.infrastructureLevel || 0);
      
      if (techDeficit > infraDeficit) {
        return {
          focus: "research",
          rationale: "Mid-game: Technology lagging behind. Catch up on research.",
        };
      } else if (infraDeficit > 0) {
        return {
          focus: "economy",
          rationale: "Mid-game: Infrastructure needs development. Strengthen economy.",
        };
      }
    }
    
    // Late game - maintain advantage
    if (state.turn >= 30) {
      if (analysis.averageNeighborStrength > stats.militaryStrength * 1.2) {
        return {
          focus: "military",
          rationale: "Late game: Neighbors are stronger. Build deterrent force.",
        };
      } else {
        return {
          focus: "balanced",
          rationale: "Late game: Maintain balanced development. Secure victory conditions.",
        };
      }
    }
    
    // Default fallback
    return {
      focus: "balanced",
      rationale: "No urgent priorities. Maintain balanced development.",
    };
  }
}

