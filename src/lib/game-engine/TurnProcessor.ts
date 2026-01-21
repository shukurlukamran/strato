import type { GameAction } from "@/types/actions";
import type { City } from "@/types/city";
import { ActionResolver } from "@/lib/game-engine/ActionResolver";
import { DealExecutor } from "@/lib/game-engine/DealExecutor";
import { EventSystem } from "@/lib/game-engine/EventSystem";
import { GameState } from "@/lib/game-engine/GameState";
import { CombatResolver } from "@/lib/game-engine/CombatResolver";
import { CityTransfer } from "@/lib/game-engine/CityTransfer";

export interface CombatResult {
  attackAction: GameAction;
  attackerWins: boolean;
  attackerLosses: number;
  defenderLosses: number;
  cityTransferred: boolean;
  updatedCity?: City;
}

export interface TurnProcessResult {
  executedActions: GameAction[];
  events: Array<{ type: string; message: string; data?: Record<string, unknown> }>;
  combatResults: CombatResult[];
}

/**
 * Deterministic turn resolution entrypoint.
 * In multiplayer later, the server runs this; clients are observers.
 */
export class TurnProcessor {
  constructor(
    private readonly actionResolver = new ActionResolver(),
    private readonly dealExecutor = new DealExecutor(),
    private readonly eventSystem = new EventSystem(),
  ) {}

  processTurn(state: GameState): TurnProcessResult {
    // 1) Execute/advance deals
    const dealEvents = this.dealExecutor.processDeals(state);

    // 2) Separate attack actions from other actions
    const attackActions = state.data.pendingActions.filter(
      a => a.actionType === "military" && (a.actionData as any)?.subType === "attack"
    );
    const nonAttackActions = state.data.pendingActions.filter(
      a => !(a.actionType === "military" && (a.actionData as any)?.subType === "attack")
    );

    // 3) Resolve non-attack actions first
    const executedActions: GameAction[] = [];
    for (const action of nonAttackActions) {
      executedActions.push(this.actionResolver.resolve(state, action));
    }

    // 4) Resolve combat for attack actions
    const combatResults: CombatResult[] = [];
    for (const attackAction of attackActions) {
      const result = this.resolveCombat(state, attackAction);
      if (result) {
        combatResults.push(result);
        executedActions.push({ ...attackAction, status: "executed" });
      } else {
        executedActions.push({ ...attackAction, status: "failed" });
      }
    }

    // 5) Run events (randomness controlled later via seeded RNG)
    const events = [...dealEvents, ...this.eventSystem.generateEvents(state)];

    return { executedActions, events, combatResults };
  }

  /**
   * Resolve a single combat action
   */
  private resolveCombat(state: GameState, attackAction: GameAction): CombatResult | null {
    const actionData = attackAction.actionData as any;
    const attackerId = actionData.attackerId || attackAction.countryId;
    const defenderId = actionData.defenderId;
    const allocatedStrength = actionData.allocatedStrength || 0;
    const targetCityId = actionData.targetCityId;

    const attackerStats = state.data.countryStatsByCountryId[attackerId];
    const defenderStats = state.data.countryStatsByCountryId[defenderId];

    if (!attackerStats || !defenderStats) {
      console.error(`Combat resolution failed: missing stats for attacker ${attackerId} or defender ${defenderId}`);
      return null;
    }

    // For now, defender uses 50% of their military strength (will be updated to use AI decision later)
    const defenderStrength = Math.floor(defenderStats.militaryStrength * 0.5);

    // Resolve combat using CombatResolver
    const combatResult = CombatResolver.resolveCombat(
      allocatedStrength,
      defenderStrength,
      attackerStats,
      defenderStats
    );

    // Apply military losses to both sides
    const updatedAttackerStats = {
      ...attackerStats,
      militaryStrength: Math.max(0, attackerStats.militaryStrength - combatResult.attackerLosses),
    };
    const updatedDefenderStats = {
      ...defenderStats,
      militaryStrength: Math.max(0, defenderStats.militaryStrength - combatResult.defenderLosses),
    };

    state.withUpdatedStats(attackerId, updatedAttackerStats);
    state.withUpdatedStats(defenderId, updatedDefenderStats);

    // If attacker wins, transfer the city (will be handled in turn/route.ts with database)
    const result: CombatResult = {
      attackAction,
      attackerWins: combatResult.attackerWins,
      attackerLosses: combatResult.attackerLosses,
      defenderLosses: combatResult.defenderLosses,
      cityTransferred: combatResult.attackerWins,
      // City transfer will be handled in the API route where we have access to the actual city data
    };

    return result;
  }
}

