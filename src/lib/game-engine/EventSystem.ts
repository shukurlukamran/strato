import { GameState } from "@/lib/game-engine/GameState";

export class EventSystem {
  generateEvents(_state: GameState): Array<{ type: string; message: string; data?: Record<string, unknown> }> {
    // Placeholder: later we’ll implement deterministic seeded events per game.
    void _state;
    return [];
  }
}

