import type { GameAction, MilitaryAttackData } from "@/types/actions";
import type { CountryStats, City } from "@/types/country";
import { GameState } from "@/lib/game-engine/GameState";
import { ECONOMIC_BALANCE } from "./EconomicBalance";
import { CombatResolver } from "./CombatResolver";
import { DefenseAI } from "@/lib/ai/DefenseAI";

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

  async resolve(state: GameState, action: GameAction): Promise<GameAction> {
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
      } else if (subType === "attack") {
        const attackData = action.actionData as any; // MilitaryAttackData
        const targetCity = state.getCity(attackData.targetCityId);
        const defenderCountryId = targetCity?.countryId;

        if (!targetCity || !defenderCountryId || !state.data.countryStatsByCountryId[defenderCountryId]) {
          return { ...action, status: "failed" };
        }

        // Check if cities are neighbors
        const attackerCities = state.getCitiesByCountry(action.countryId);
        const canAttack = attackerCities.some(attackerCity =>
          CombatResolver.canAttackCity(attackerCity, targetCity)
        );

        if (!canAttack) {
          return { ...action, status: "failed" };
        }

        const defenderStats = state.data.countryStatsByCountryId[defenderCountryId];

        // Calculate attack cost and deduct from budget
        const attackCost = CombatResolver.calculateAttackCost(
          next,
          targetCity,
          Math.floor(next.militaryStrength * (attackData.attackingMilitaryAllocated / 100))
        );

        next = {
          ...next,
          budget: Math.max(0, next.budget - attackCost.economicCost),
        };

        // For live resolution, resolve immediately
        if (attackData.isLiveResolution) {
          // Determine defense allocation
          let defenderMilitaryPercentage: number;

          const defenderCountry = state.data.countries.find(c => c.id === defenderCountryId);
          const attackerCountry = state.data.countries.find(c => c.id === action.countryId);
          const isDefenderAI = defenderCountry && !defenderCountry.isPlayerControlled;
          const isAttackerPlayer = attackerCountry && attackerCountry.isPlayerControlled;

          if (isDefenderAI && isAttackerPlayer) {
            // Use LLM for AI defense against player attack (fairness)
            const defenseAI = new DefenseAI();
            defenderMilitaryPercentage = await defenseAI.decideDefenseAllocation(
              defenderStats,
              targetCity,
              attackerCountry.name
            );
          } else {
            // Rule-based or player-vs-player: use 50% as default
            defenderMilitaryPercentage = 50;
          }

          const combatResult = CombatResolver.resolveCombat(
            next, // attacker stats
            defenderStats,
            targetCity,
            attackData.attackingMilitaryAllocated,
            defenderMilitaryPercentage,
            true
          );

          // Apply combat results
          const { attackerStats: updatedAttackerStats, defenderStats: updatedDefenderStats } =
            CombatResolver.applyCombatResults(combatResult, next, defenderStats);

          // Update stats
          state.withUpdatedStats(action.countryId, updatedAttackerStats);
          state.withUpdatedStats(defenderCountryId, updatedDefenderStats);

          // If city was captured, transfer it
          if (combatResult.cityCaptured) {
            // Update city ownership
            const updatedCities = state.data.cities.map(city =>
              city.id === targetCity.id
                ? { ...city, countryId: action.countryId }
                : city
            );
            state.setCities(updatedCities);

            // TODO: Redistribute resources/population
          }

          return {
            ...action,
            status: "executed",
            actionData: {
              ...attackData,
              combatResult
            }
          };
        } else {
          // For turn-end resolution, mark as pending resolution
          state.withUpdatedStats(action.countryId, next);

          return {
            ...action,
            status: "executed",
            actionData: {
              ...attackData,
              resolvedAtTurnEnd: true
            }
          };
        }
      }
    }
    
    state.withUpdatedStats(action.countryId, next);
    return { ...action, status: "executed" };
  }
}

