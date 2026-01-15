import type { GameAction } from "@/types/actions";
import type { CountryStats } from "@/types/country";
import { GameState } from "@/lib/game-engine/GameState";

export class ActionResolver {
  resolve(state: GameState, action: GameAction): GameAction {
    // Placeholder: for now we just mark as executed.
    // Later: validate, apply state mutations, and produce events.
    if (!state.data.countryStatsByCountryId[action.countryId]) {
      return { ...action, status: "failed" };
    }

    // Example: basic research increases tech slightly.
    if (action.actionType === "research") {
      const prev = state.data.countryStatsByCountryId[action.countryId];
      const next: CountryStats = {
        ...prev,
        technologyLevel: prev.technologyLevel + 1,
      };
      state.withUpdatedStats(action.countryId, next);
    }

    return { ...action, status: "executed" };
  }
}

