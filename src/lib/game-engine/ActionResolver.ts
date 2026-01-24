import type { GameAction } from "@/types/actions";
import type { CountryStats } from "@/types/country";
import { GameState } from "@/lib/game-engine/GameState";
import { ECONOMIC_BALANCE } from "./EconomicBalance";
import { CombatResolver } from "./CombatResolver";
import { CityTransfer } from "./CityTransfer";
import { ResourceCost } from "./ResourceCost";

export class ActionResolver {
  /**
   * Calculate research cost based on current technology level
   * Uses ECONOMIC_BALANCE constants for consistency
   */
  static calculateResearchCost(currentLevel: number): number {
    return Math.floor(ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, currentLevel));
  }

  /**
   * Calculate infrastructure cost based on current infrastructure level
   * Uses ECONOMIC_BALANCE constants for consistency
   */
  static calculateInfrastructureCost(currentLevel: number): number {
    return Math.floor(ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER, currentLevel));
  }

  /**
   * Resolve an action (including combat for attack actions)
   * Returns the updated action with results
   * 
   * Resource validation:
   * - Immediate actions (player actions): Resources already deducted at submission time
   * - Turn-based actions (AI actions): Resources validated and deducted here at execution time
   */
  resolve(state: GameState, action: GameAction): GameAction {
    if (!state.data.countryStatsByCountryId[action.countryId]) {
      return { ...action, status: "failed" };
    }

    const prev = state.data.countryStatsByCountryId[action.countryId];
    const cost = (action.actionData as any)?.cost || 0;
    const immediate = (action.actionData as any)?.immediate === true;
    
    let next: CountryStats = { ...prev };
    let finalCost = cost;
    let updatedResources = prev.resources;

    // For turn-based actions (AI actions), validate and deduct resources at execution time
    if (!immediate) {
      // Calculate required resources based on action type
      let requiredResources: Array<{ resourceId: string; amount: number }> = [];
      let militaryAmount: number | undefined;

      if (action.actionType === "research") {
        requiredResources = ResourceCost.getResourceCostForAction("research", prev);
      } else if (action.actionType === "economic") {
        const subType = (action.actionData as any)?.subType;
        if (subType === "infrastructure") {
          requiredResources = ResourceCost.getResourceCostForAction("infrastructure", prev);
        }
      } else if (action.actionType === "military") {
        const subType = (action.actionData as any)?.subType;
        if (subType === "recruit") {
          militaryAmount = (action.actionData as any)?.amount || 10;
          requiredResources = ResourceCost.getResourceCostForAction("military", prev, militaryAmount);
        }
        // Attack actions don't require resources (only budget)
      }

      // Check resource affordability and apply penalty multiplier
      if (requiredResources.length > 0) {
        const affordability = ResourceCost.checkResourceAffordability(requiredResources, prev.resources);
        
        // Apply penalty multiplier to cost if resources are missing
        finalCost = Math.floor(cost * affordability.penaltyMultiplier);
        
        // Check if country can afford the final cost (with penalty)
        if (prev.budget < finalCost) {
          return { ...action, status: "failed" };
        }
        
        // Deduct resources if available (even if missing, we still deduct what we have)
        if (affordability.canAfford) {
          updatedResources = ResourceCost.deductResources(prev.resources, requiredResources);
        } else {
          // Partial deduction: deduct what we have, even if not enough
          updatedResources = ResourceCost.deductResources(prev.resources, requiredResources);
        }
      } else {
        // No resource requirements, just check budget
        if (prev.budget < finalCost) {
          return { ...action, status: "failed" };
        }
      }
    } else {
      // Immediate actions: resources already deducted at submission time
      // Just verify budget (should already be checked, but double-check for safety)
      if (prev.budget < finalCost) {
        return { ...action, status: "failed" };
      }
    }

    // Apply action effects and deduct cost
    if (action.actionType === "research") {
      // Technology upgrade: increase by 1 level
      next = {
        ...next,
        technologyLevel: next.technologyLevel + 1,
        budget: immediate ? next.budget : Math.max(0, next.budget - finalCost),
        resources: updatedResources,
      };
    } else if (action.actionType === "economic") {
      const subType = (action.actionData as any)?.subType;
      
      if (subType === "infrastructure") {
        // Infrastructure upgrade: increase by 1 level
        next = {
          ...next,
          infrastructureLevel: (next.infrastructureLevel || 0) + 1,
          budget: immediate ? next.budget : Math.max(0, next.budget - finalCost),
          resources: updatedResources,
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
          budget: immediate ? next.budget : Math.max(0, next.budget - finalCost),
          resources: updatedResources,
        };
      } else if (subType === "attack") {
        // Attack actions are resolved later (combat resolution phase).
        // Budget and resources already deducted at submission time for immediate actions.
      }
    }
    
    state.withUpdatedStats(action.countryId, next);
    return { ...action, status: "executed" };
  }
}

