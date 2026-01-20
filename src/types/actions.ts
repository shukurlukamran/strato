export type ActionType = "diplomacy" | "military" | "economic" | "research";

export type MilitaryActionSubtype = "recruit" | "attack";

export interface MilitaryAttackData {
  subType: "attack";
  targetCityId: string;
  attackingMilitaryAllocated: number; // Percentage (0-100) of military strength allocated to attack
  isLiveResolution: boolean; // true for immediate resolution, false for turn-end
}

export interface MilitaryRecruitData {
  subType: "recruit";
  amount: number;
  cost: number;
}
export type ActionStatus = "pending" | "executed" | "failed";

export interface GameAction<TData = Record<string, unknown>> {
  id: string;
  gameId: string;
  countryId: string;
  turn: number;
  actionType: ActionType;
  actionData: TData;
  status: ActionStatus;
  createdAt: string;
}

