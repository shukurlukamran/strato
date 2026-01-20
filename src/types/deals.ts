export type DealType =
  | "trade"
  | "alliance"
  | "non_aggression"
  | "military_aid"
  | "technology_share"
  | "custom";

export type DealStatus =
  | "draft"
  | "proposed"
  | "accepted"
  | "rejected"
  | "active"
  | "completed"
  | "violated";

export type DealConfirmationAction = "propose" | "accept" | "reject" | "modify";

export interface DealCommitment {
  type: string;
  resource?: string;
  amount?: number;
  durationTurns?: number;
  cityId?: string; // For city transfers
}

export interface DealTerms {
  proposerCommitments: DealCommitment[];
  receiverCommitments: DealCommitment[];
  conditions?: string[];
}

export interface Deal {
  id: string;
  gameId: string;
  proposingCountryId: string;
  receivingCountryId: string;
  dealType: DealType;
  dealTerms: DealTerms;
  status: DealStatus;
  proposedAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  turnCreated: number;
  turnExpires: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealConfirmation {
  id: string;
  dealId: string;
  countryId: string;
  action: DealConfirmationAction;
  message: string | null;
  createdAt: string;
}

