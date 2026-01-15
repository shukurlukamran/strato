import type { GameStateSnapshot } from "@/lib/game-engine/GameState";

export interface StrategyIntent {
  focus: "economy" | "military" | "diplomacy" | "research" | "balanced";
  rationale: string;
}

export class StrategicPlanner {
  plan(_state: GameStateSnapshot, _countryId: string): StrategyIntent {
    // Placeholder; later we derive from threats/resources.
    void _state;
    void _countryId;
    return { focus: "balanced", rationale: "Default balanced strategy." };
  }
}

