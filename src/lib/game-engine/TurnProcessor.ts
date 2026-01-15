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

  processTurn(state: GameState): TurnProcessResult {
    // 1) Execute/advance deals
    const dealEvents = this.dealExecutor.processDeals(state);

    // 2) Resolve actions
    const executedActions: GameAction[] = [];
    for (const action of state.data.pendingActions) {
      executedActions.push(this.actionResolver.resolve(state, action));
    }

    // 3) Run events (randomness controlled later via seeded RNG)
    const events = [...dealEvents, ...this.eventSystem.generateEvents(state)];

    return { executedActions, events };
  }
}

