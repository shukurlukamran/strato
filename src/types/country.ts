export interface Country {
  id: string;
  gameId: string;
  name: string;
  isPlayerControlled: boolean;
  color: string;
  positionX: number;
  positionY: number;
}

export interface CountryStats {
  id: string;
  countryId: string;
  turn: number;
  population: number;
  budget: number;
  technologyLevel: number;
  militaryStrength: number;
  militaryEquipment: Record<string, unknown>;
  resources: Record<string, number>;
  diplomaticRelations: Record<string, number>;
  createdAt: string;
}

