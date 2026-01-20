import type { GameAction } from "@/types/actions";
import { ActionResolver } from "@/lib/game-engine/ActionResolver";
import { DealExecutor } from "@/lib/game-engine/DealExecutor";
import { EventSystem } from "@/lib/game-engine/EventSystem";
import { GameState } from "@/lib/game-engine/GameState";

export interface TurnProcessResult {
  executedActions: GameAction[];
  events: Array<{ type: string; message: string; data?: Record<string, unknown> }>;
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

  async processTurn(state: GameState): Promise<TurnProcessResult> {
    // 1) Execute/advance deals
    const dealEvents = this.dealExecutor.processDeals(state);

    // 2) Resolve actions
    const executedActions: GameAction[] = [];
    const actionEvents: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];

    for (const action of state.data.pendingActions) {
      const executedAction = await this.actionResolver.resolve(state, action);
      executedActions.push(executedAction);

      // Extract events from action results
      const eventsFromAction = this.extractEventsFromAction(executedAction, state);
      actionEvents.push(...eventsFromAction);
    }

    // 3) Run events (randomness controlled later via seeded RNG)
    const events = [...dealEvents, ...actionEvents, ...this.eventSystem.generateEvents(state)];

    return { executedActions, events };
  }

  /**
   * Extract history events from executed actions
   */
  private extractEventsFromAction(
    action: GameAction,
    state: GameState
  ): Array<{ type: string; message: string; data?: Record<string, unknown> }> {
    const events: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];

    if (action.actionType === "military" && action.status === "executed") {
      const subType = (action.actionData as any)?.subType;

      if (subType === "recruit") {
        const amount = (action.actionData as any)?.amount || 0;
        const country = state.data.countries.find(c => c.id === action.countryId);
        if (!country) return events; // Skip if country not found
        events.push({
          type: "military",
          message: `${country.name} recruited ${amount} military units`,
          data: { countryId: action.countryId, amount }
        });
      } else if (subType === "attack") {
        const attackData = action.actionData as any;
        const combatResult = attackData?.combatResult;

        if (combatResult) {
          const attackerCountry = state.data.countries.find(c => c.id === action.countryId);
          const defenderCountry = state.data.countries.find(c => c.id === combatResult.defenderCountryId);
          if (!attackerCountry || !defenderCountry) return events; // Skip if countries not found

          const targetCity = state.getCity(combatResult.targetCityId);
          const targetName = targetCity?.name || `City ${combatResult.targetCityId.slice(-4)}`;

          const attackMessage = `${attackerCountry.name} attacked ${targetName} (${defenderCountry.name})`;

          if (combatResult.cityCaptured) {
            events.push({
              type: "military",
              message: `${attackMessage} - City captured!`,
              data: {
                attackerId: action.countryId,
                defenderId: combatResult.defenderCountryId,
                cityId: combatResult.targetCityId,
                attackerCasualties: combatResult.attackerCasualties,
                defenderCasualties: combatResult.defenderCasualties,
                cityCaptured: true
              }
            });
          } else {
            events.push({
              type: "military",
              message: `${attackMessage} - Attack repelled`,
              data: {
                attackerId: action.countryId,
                defenderId: combatResult.defenderCountryId,
                cityId: combatResult.targetCityId,
                attackerCasualties: combatResult.attackerCasualties,
                defenderCasualties: combatResult.defenderCasualties,
                cityCaptured: false
              }
            });
          }

          // Add detailed combat log if available
          if (combatResult.combatLog && combatResult.combatLog.length > 0) {
            events.push({
              type: "military-detail",
              message: `Combat details: ${combatResult.combatLog.join(" | ")}`,
              data: { combatLog: combatResult.combatLog }
            });
          }
        } else if (attackData?.resolvedAtTurnEnd) {
          // Turn-end resolution placeholder
          const country = state.data.countries.find(c => c.id === action.countryId);
          if (!country) return events;

          const targetCity = state.getCity(attackData.targetCityId);
          const targetName = targetCity?.name || `City ${attackData.targetCityId.slice(-4)}`;

          events.push({
            type: "military",
            message: `${country.name} launched attack on ${targetName} (resolving at turn end)`,
            data: { countryId: action.countryId, cityId: attackData.targetCityId }
          });
        }
      }
    } else if (action.actionType === "economic" && action.status === "executed") {
      const subType = (action.actionData as any)?.subType;
      const country = state.data.countries.find(c => c.id === action.countryId);

      if (subType === "infrastructure") {
        events.push({
          type: "economic",
          message: `${country?.name || action.countryId} upgraded infrastructure`,
          data: { countryId: action.countryId }
        });
      }
    } else if (action.actionType === "research" && action.status === "executed") {
      const country = state.data.countries.find(c => c.id === action.countryId);
      events.push({
        type: "research",
        message: `${country?.name || action.countryId} advanced technology`,
        data: { countryId: action.countryId }
      });
    }

    return events;
  }
}

