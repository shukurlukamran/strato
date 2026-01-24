import type { GameAction } from "@/types/actions";
import type { CountryStats } from "@/types/country";
import { GameState } from "@/lib/game-engine/GameState";
import { ECONOMIC_BALANCE } from "./EconomicBalance";
import { CombatResolver } from "./CombatResolver";
import { CityTransfer } from "./CityTransfer";
import { ResourceCost } from "./ResourceCost";
import { ActionPricing } from "./ActionPricing";

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
   * AI actions (non-immediate) now properly enforce resource requirements and shortage penalties.
   */
  resolve(state: GameState, action: GameAction): GameAction {
    if (!state.data.countryStatsByCountryId[action.countryId]) {
      return { ...action, status: "failed" };
    }

    const prev = state.data.countryStatsByCountryId[action.countryId];
    const actionData = action.actionData as any;
    const immediate = actionData?.immediate === true;

    // For AI actions (non-immediate), calculate and enforce costs/resources
    if (!immediate) {
      let pricingResult;

      try {
        if (action.actionType === "research") {
          pricingResult = ActionPricing.calculateResearchPricing(prev);
        } else if (action.actionType === "economic" && actionData?.subType === "infrastructure") {
          pricingResult = ActionPricing.calculateInfrastructurePricing(prev);
        } else if (action.actionType === "military" && actionData?.subType === "recruit") {
          const amount = actionData?.amount || 10;
          pricingResult = ActionPricing.calculateRecruitmentPricing(amount, prev);
        } else if (action.actionType === "military" && actionData?.subType === "attack") {
          // Attack actions are handled separately in combat resolution
          // Cost is already deducted at declaration time
          return { ...action, status: "executed" };
        } else {
          console.error(`Unknown action type for AI enforcement: ${action.actionType}, subType: ${actionData?.subType}`);
          return { ...action, status: "failed" };
        }

        // Check if country can afford the action
        if (!ActionPricing.canAffordAction(pricingResult, prev.budget)) {
          console.log(`AI action failed: insufficient funds/resources. Cost: $${pricingResult.cost}, Budget: $${prev.budget}, Can afford resources: ${pricingResult.resourceCostInfo.canAfford}`);
          return { ...action, status: "failed" };
        }

        // Apply cost and resource deduction
        const updatedStats = ActionPricing.applyActionCost(pricingResult, prev);

        // Record pricing info in action data for history/UI
        actionData.cost = pricingResult.cost;
        actionData.requiredResources = pricingResult.requiredResources;
        actionData.shortage = pricingResult.resourceCostInfo.shortage;
        actionData.penaltyMultiplier = pricingResult.resourceCostInfo.penaltyMultiplier;

        state.withUpdatedStats(action.countryId, updatedStats);
      } catch (error) {
        console.error(`Failed to calculate pricing for AI action:`, error);
        return { ...action, status: "failed" };
      }
    }

    // Apply action effects (cost/resource deduction already handled above for AI actions)
    let next: CountryStats = state.data.countryStatsByCountryId[action.countryId];

    if (action.actionType === "research") {
      // Technology upgrade: increase by 1 level
      next = {
        ...next,
        technologyLevel: next.technologyLevel + 1,
        // Budget already deducted above for AI actions
        budget: immediate ? Math.max(0, next.budget - (actionData?.cost || 0)) : next.budget,
      };
    } else if (action.actionType === "economic") {
      const subType = actionData?.subType;

      if (subType === "infrastructure") {
        // Infrastructure upgrade: increase by 1 level
        next = {
          ...next,
          infrastructureLevel: (next.infrastructureLevel || 0) + 1,
          // Budget already deducted above for AI actions
          budget: immediate ? Math.max(0, next.budget - (actionData?.cost || 0)) : next.budget,
        };
      }
    } else if (action.actionType === "military") {
      const subType = actionData?.subType;

      if (subType === "recruit") {
        const amount = actionData?.amount || 10;
        // Military recruitment: increase strength
        next = {
          ...next,
          militaryStrength: next.militaryStrength + amount,
          // Budget already deducted above for AI actions
          budget: immediate ? Math.max(0, next.budget - (actionData?.cost || 0)) : next.budget,
        };
      } else if (subType === "attack") {
        // Attack actions are resolved later (combat resolution phase).
        // Cost is deducted at declaration time, not here.
      }
    }

    state.withUpdatedStats(action.countryId, next);
    return { ...action, status: "executed" };
  }
}

