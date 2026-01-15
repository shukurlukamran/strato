import type { StrategyIntent } from "@/lib/ai/StrategicPlanner";
import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";

export class DiplomacyAI {
  decideActions(_state: GameStateSnapshot, _countryId: string, _intent: StrategyIntent): GameAction[] {
    // Placeholder: AI diplomacy actions will be driven by deals/chat later.
    void _state;
    void _countryId;
    void _intent;
    return [];
  }
}

