export type ActionType = "diplomacy" | "military" | "economic" | "research";
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

