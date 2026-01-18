export interface Country {
  id: string;
  gameId: string;
  name: string;
  isPlayerControlled: boolean;
  color: string;
  positionX: number;
  positionY: number;
}

import type { ResourceProfile } from '@/lib/game-engine/ResourceProfile';

export interface CountryStats {
  id: string;
  countryId: string;
  turn: number;
  population: number;
  budget: number;
  technologyLevel: number;
  infrastructureLevel?: number; // Infrastructure level (0-based)
  militaryStrength: number;
  militaryEquipment: Record<string, unknown>;
  resources: Record<string, number>;
  diplomaticRelations: Record<string, number>;
  resourceProfile?: ResourceProfile; // Resource specialization profile
  createdAt: string;
}

