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

export interface Country {
  id: string;
  name: string;
  flag: string;
  government: string;
  gdp: number;
  militaryStrength: number;
  population: number;
  techLevel: number;
}

