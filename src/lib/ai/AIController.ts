import type { GameAction } from "@/types/actions";
import type { GameStateSnapshot } from "@/lib/game-engine/GameState";
import { StrategicPlanner } from "@/lib/ai/StrategicPlanner";
import { DiplomacyAI } from "@/lib/ai/DiplomacyAI";
import { EconomicAI } from "@/lib/ai/EconomicAI";
import { MilitaryAI } from "@/lib/ai/MilitaryAI";

export class AIController {
  constructor(
    private readonly planner = new StrategicPlanner(),
    private readonly diplomacyAI = new DiplomacyAI(),
    private readonly economicAI = new EconomicAI(),
    private readonly militaryAI = new MilitaryAI(),
  ) {}

  decideTurnActions(state: GameStateSnapshot, countryId: string): GameAction[] {
    const intent = this.planner.plan(state, countryId);
    return [
      ...this.diplomacyAI.decideActions(state, countryId, intent),
      ...this.economicAI.decideActions(state, countryId, intent),
      ...this.militaryAI.decideActions(state, countryId, intent),
    ];
  }
}

