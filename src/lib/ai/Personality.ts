export interface AIPersonality {
  // 0..1 scales
  aggression: number;
  cooperativeness: number;
  riskTolerance: number;
  honesty: number;
}

export const DefaultPersonality: AIPersonality = {
  aggression: 0.5,
  cooperativeness: 0.5,
  riskTolerance: 0.5,
  honesty: 0.7,
};

