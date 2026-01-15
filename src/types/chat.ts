export interface DiplomacyChat {
  id: string;
  gameId: string;
  countryAId: string;
  countryBId: string;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderCountryId: string;
  messageText: string;
  isAiGenerated: boolean;
  createdAt: string;
}

