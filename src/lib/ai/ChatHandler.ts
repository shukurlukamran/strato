import { z } from "zod";

export const ChatTurnSchema = z.object({
  gameId: z.string().uuid().optional(),
  chatId: z.string().uuid().optional(),
  senderCountryId: z.string().uuid().optional(),
  receiverCountryId: z.string().uuid().optional(),
  messageText: z.string().min(1),
});

export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export interface ChatResponse {
  messageText: string;
  // If the model thinks a deal is being proposed, it can emit a structured suggestion.
  suggestedDeal?: {
    dealType: string;
    dealTerms: Record<string, unknown>;
  };
}

/**
 * For V1 we default to a safe stub (no external LLM calls).
 * Later we can plug in OpenAI/Claude/etc. behind this same interface.
 */
export class ChatHandler {
  async respond(turn: ChatTurn): Promise<ChatResponse> {
    // Minimal behavior so the UI/API works without keys:
    // - Acknowledge
    // - Ask a follow-up question
    return {
      messageText: `Acknowledged. What exactly are you proposing, and for how many turns? (You said: "${turn.messageText}")`,
    };
  }
}

