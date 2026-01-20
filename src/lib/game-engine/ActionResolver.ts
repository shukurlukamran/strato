import type { GameAction } from "@/types/actions";
import type { CountryStats } from "@/types/country";
import { GameState } from "@/lib/game-engine/GameState";
import { ECONOMIC_BALANCE } from "./EconomicBalance";

export class ActionResolver {
  /**
   * Calculate research cost based on current technology level
   */
  static calculateResearchCost(currentLevel: number): number {
    return Math.floor(500 * Math.pow(1.4, currentLevel)); // Lower base, steeper curve
  }

  /**
   * Calculate infrastructure cost based on current infrastructure level
   */
  static calculateInfrastructureCost(currentLevel: number): number {
    return Math.floor(600 * Math.pow(1.3, currentLevel)); // Slightly cheaper
  }

  resolve(state: GameState, action: GameAction): GameAction {
    if (!state.data.countryStatsByCountryId[action.countryId]) {
      return { ...action, status: "failed" };
    }

    const prev = state.data.countryStatsByCountryId[action.countryId];
    const cost = (action.actionData as any)?.cost || 0;
    
    // Check if country has enough budget
    if (prev.budget < cost) {
      return { ...action, status: "failed" };
    }

    let next: CountryStats = { ...prev };

    // Apply action effects and deduct cost
    if (action.actionType === "research") {
      // Technology upgrade: increase by 1 level
      next = {
        ...next,
        technologyLevel: next.technologyLevel + 1,
        budget: Math.max(0, next.budget - cost),
      };
    } else if (action.actionType === "economic") {
      const subType = (action.actionData as any)?.subType;
      
      if (subType === "infrastructure") {
        // Infrastructure upgrade: increase by 1 level
        next = {
          ...next,
          infrastructureLevel: (next.infrastructureLevel || 0) + 1,
          budget: Math.max(0, next.budget - cost),
        };
      }
    } else if (action.actionType === "military") {
      const subType = (action.actionData as any)?.subType;
      
      if (subType === "recruit") {
        const amount = (action.actionData as any)?.amount || 1;
        // Military recruitment: increase strength
        next = {
          ...next,
          militaryStrength: next.militaryStrength + amount,
          budget: Math.max(0, next.budget - cost),
        };
      }
    }
    
    state.withUpdatedStats(action.countryId, next);
    return { ...action, status: "executed" };
  }
}

