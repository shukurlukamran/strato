import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";

export class EconomicAI {
  decideActions(_state: GameStateSnapshot, _countryId: string, _intent: StrategyIntent): GameAction[] {
    // Placeholder: later decide on extraction, infrastructure, trade offers, etc.
    void _state;
    void _countryId;
    void _intent;
    return [];
  }
}

