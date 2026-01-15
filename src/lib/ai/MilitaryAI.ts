import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";

export class MilitaryAI {
  decideActions(_state: GameStateSnapshot, _countryId: string, _intent: StrategyIntent): GameAction[] {
    // Placeholder: later decide on deployments, threats, attacks, defenses.
    void _state;
    void _countryId;
    void _intent;
    return [];
  }
}

