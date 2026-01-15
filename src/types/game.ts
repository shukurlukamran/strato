export type GameStatus = "active" | "paused" | "finished";

export interface Game {
  id: string;
  name: string;
  currentTurn: number;
  status: GameStatus;
  playerCountryId: string;
  createdAt: string;
  updatedAt: string;
}

