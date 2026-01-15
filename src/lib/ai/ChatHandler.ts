import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Country, CountryStats } from "@/types/country";
import type { ChatMessage } from "@/types/chat";

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

interface GameContext {
  gameId: string;
  turn: number;
  senderCountry: Country;
  receiverCountry: Country;
  senderStats: CountryStats;
  receiverStats: CountryStats;
  chatHistory: ChatMessage[];
}

/**
 * Handles diplomatic chat with AI countries using LLM integration.
 * Falls back to stub responses if Google Gemini API key is not configured.
 */
export class ChatHandler {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || "AIzaSyDqT4HScdQUQtTHweKC9sZiH2wLZf2C3oY";
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Use gemini-1.5-flash for faster responses, or gemini-1.5-flash-lite for even faster
      this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }
  }

  private async fetchGameContext(turn: ChatTurn): Promise<GameContext | null> {
    if (!turn.gameId || !turn.senderCountryId || !turn.receiverCountryId) {
      return null;
    }

    try {
      const supabase = getSupabaseServerClient();

      // Fetch game info
      const gameRes = await supabase
        .from("games")
        .select("id, current_turn")
        .eq("id", turn.gameId)
        .single();
      if (gameRes.error) {
        console.error("Failed to fetch game:", gameRes.error);
        return null;
      }

      // Fetch countries
      const countriesRes = await supabase
        .from("countries")
        .select("id, game_id, name, is_player_controlled, color, position_x, position_y")
        .in("id", [turn.senderCountryId, turn.receiverCountryId]);
      if (countriesRes.error || !countriesRes.data || countriesRes.data.length !== 2) {
        console.error("Failed to fetch countries:", countriesRes.error);
        return null;
      }

      const senderCountry = countriesRes.data.find((c) => c.id === turn.senderCountryId);
      const receiverCountry = countriesRes.data.find((c) => c.id === turn.receiverCountryId);
      if (!senderCountry || !receiverCountry) {
        console.error("Could not find sender or receiver country");
        return null;
      }

      // Fetch country stats
      const statsRes = await supabase
        .from("country_stats")
        .select(
          "id, country_id, turn, population, budget, technology_level, military_strength, military_equipment, resources, diplomatic_relations, created_at",
        )
        .eq("turn", gameRes.data.current_turn)
        .in("country_id", [turn.senderCountryId, turn.receiverCountryId]);
      if (statsRes.error) {
        console.error("Failed to fetch country stats:", statsRes.error);
        return null;
      }

      const senderStats = statsRes.data.find((s) => s.country_id === turn.senderCountryId);
      const receiverStats = statsRes.data.find((s) => s.country_id === turn.receiverCountryId);
      if (!senderStats || !receiverStats) {
        console.error("Could not find sender or receiver stats");
        return null;
      }

      // Fetch chat history (only if chatId is provided)
      let chatHistory: ChatMessage[] = [];
      if (turn.chatId) {
        const messagesRes = await supabase
          .from("chat_messages")
          .select("id, chat_id, sender_country_id, message_text, is_ai_generated, created_at")
          .eq("chat_id", turn.chatId)
          .order("created_at", { ascending: true })
          .limit(20);
        if (!messagesRes.error && messagesRes.data) {
          chatHistory = messagesRes.data.map((m) => ({
            id: m.id,
            chatId: m.chat_id,
            senderCountryId: m.sender_country_id,
            messageText: m.message_text,
            isAiGenerated: m.is_ai_generated,
            createdAt: m.created_at,
          }));
        }
      }

      return {
        gameId: turn.gameId,
        turn: gameRes.data.current_turn,
        senderCountry: {
          id: senderCountry.id,
          gameId: senderCountry.game_id,
          name: senderCountry.name,
          isPlayerControlled: senderCountry.is_player_controlled,
          color: senderCountry.color,
          positionX: Number(senderCountry.position_x),
          positionY: Number(senderCountry.position_y),
        },
        receiverCountry: {
          id: receiverCountry.id,
          gameId: receiverCountry.game_id,
          name: receiverCountry.name,
          isPlayerControlled: receiverCountry.is_player_controlled,
          color: receiverCountry.color,
          positionX: Number(receiverCountry.position_x),
          positionY: Number(receiverCountry.position_y),
        },
        senderStats: {
          id: senderStats.id,
          countryId: senderStats.country_id,
          turn: senderStats.turn,
          population: senderStats.population,
          budget: Number(senderStats.budget),
          technologyLevel: Number(senderStats.technology_level),
          militaryStrength: senderStats.military_strength,
          militaryEquipment: senderStats.military_equipment ?? {},
          resources: senderStats.resources ?? {},
          diplomaticRelations: senderStats.diplomatic_relations ?? {},
          createdAt: senderStats.created_at,
        },
        receiverStats: {
          id: receiverStats.id,
          countryId: receiverStats.country_id,
          turn: receiverStats.turn,
          population: receiverStats.population,
          budget: Number(receiverStats.budget),
          technologyLevel: Number(receiverStats.technology_level),
          militaryStrength: receiverStats.military_strength,
          militaryEquipment: receiverStats.military_equipment ?? {},
          resources: receiverStats.resources ?? {},
          diplomaticRelations: receiverStats.diplomatic_relations ?? {},
          createdAt: receiverStats.created_at,
        },
        chatHistory,
      };
    } catch {
      return null;
    }
  }

  private buildSystemPrompt(context: GameContext): string {
    const { senderCountry, receiverCountry, senderStats, receiverStats, turn } = context;

    return `You are the diplomatic representative of ${receiverCountry.name}, an AI-controlled country in a turn-based strategy game.

GAME CONTEXT:
- Current Turn: ${turn}
- You represent: ${receiverCountry.name}
- You are negotiating with: ${senderCountry.name}

YOUR COUNTRY (${receiverCountry.name}) STATS:
- Population: ${receiverStats.population.toLocaleString()}
- Budget: ${receiverStats.budget.toLocaleString()} credits
- Technology Level: ${receiverStats.technologyLevel}
- Military Strength: ${receiverStats.militaryStrength}
- Resources: ${JSON.stringify(receiverStats.resources)}

THEIR COUNTRY (${senderCountry.name}) STATS:
- Population: ${senderStats.population.toLocaleString()}
- Budget: ${senderStats.budget.toLocaleString()} credits
- Technology Level: ${senderStats.technologyLevel}
- Military Strength: ${senderStats.militaryStrength}
- Resources: ${JSON.stringify(senderStats.resources)}

DIPLOMATIC RELATIONS:
- Your relations with them: ${receiverStats.diplomaticRelations[senderCountry.id] ?? 0}/100

INSTRUCTIONS:
1. Respond as a strategic, realistic diplomatic representative who acts in ${receiverCountry.name}'s best interests
2. Consider your country's resources, military strength, and economic situation when negotiating
3. Be diplomatic but firm - you're not easily manipulated
4. If a deal is proposed, evaluate it based on mutual benefit and your country's needs
5. Keep responses concise (2-4 sentences typically, up to 2 paragraphs max)
6. Match the tone of the conversation - formal for serious negotiations, more casual for friendly chats
7. Reference specific stats or resources when relevant to show you're paying attention
8. If they propose something unreasonable, politely decline or counter-propose

Respond naturally and strategically.`;
  }

  private buildHistoryMessages(context: GameContext): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
    const messages: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

    // Add chat history
    for (const msg of context.chatHistory) {
      if (msg.senderCountryId === context.senderCountry.id) {
        messages.push({ role: "user", parts: [{ text: msg.messageText }] });
      } else {
        messages.push({ role: "model", parts: [{ text: msg.messageText }] });
      }
    }

    return messages;
  }

  async respond(turn: ChatTurn): Promise<ChatResponse> {
    // If Gemini is not configured, use fallback
    if (!this.model) {
      console.error("ChatHandler: Gemini model not initialized. Check GOOGLE_GEMINI_API_KEY.");
      return {
        messageText: `Acknowledged. What exactly are you proposing, and for how many turns? (You said: "${turn.messageText}")`,
      };
    }

    // Fetch game context
    const context = await this.fetchGameContext(turn);
    if (!context) {
      console.error("ChatHandler: Failed to fetch game context.", {
        gameId: turn.gameId,
        senderCountryId: turn.senderCountryId,
        receiverCountryId: turn.receiverCountryId,
        chatId: turn.chatId,
      });
      // Fallback if we can't fetch context
      return {
        messageText: `I understand your message: "${turn.messageText}". However, I need more context to provide a proper response.`,
      };
    }

    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const historyMessages = this.buildHistoryMessages(context);

      // Start a chat session with the system prompt and history
      const chat = this.model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: systemPrompt }],
          },
          {
            role: "model",
            parts: [{ text: "Understood. I'm ready to negotiate as the representative of " + context.receiverCountry.name + "." }],
          },
          // Add conversation history
          ...historyMessages,
        ],
      });

      // Send the current message
      const result = await chat.sendMessage(turn.messageText);
      const response = result.response;
      const responseText = response.text().trim() || "I'm considering your proposal.";

      // Try to extract deal information from the response (simple heuristic for now)
      // In the future, we could use function calling or structured output
      const suggestedDeal = this.extractDealSuggestion(responseText, context);

      return {
        messageText: responseText,
        suggestedDeal,
      };
    } catch (error) {
      console.error("Google Gemini API error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        // Check for specific error types
        if (error.message.includes("API_KEY")) {
          console.error("API key issue detected. Check GOOGLE_GEMINI_API_KEY environment variable.");
        }
        if (error.message.includes("quota") || error.message.includes("rate limit")) {
          console.error("API quota or rate limit exceeded.");
        }
      }
      // Fallback response on error
      return {
        messageText: `I've received your message: "${turn.messageText}". Let me consider this carefully and get back to you.`,
      };
    }
  }

  private extractDealSuggestion(response: string, context: GameContext): ChatResponse["suggestedDeal"] | undefined {
    // Simple heuristic: if the response mentions specific deal terms, try to extract them
    // This is a basic implementation - could be enhanced with structured output or function calling
    const lowerResponse = response.toLowerCase();

    // Check for trade deals
    if (lowerResponse.includes("trade") || lowerResponse.includes("exchange")) {
      const resources = Object.keys(context.receiverStats.resources);
      const mentionedResources = resources.filter((r) => lowerResponse.includes(r.toLowerCase()));

      if (mentionedResources.length > 0) {
        return {
          dealType: "trade",
          dealTerms: {
            resources: mentionedResources,
            description: "Resource trade agreement",
          },
        };
      }
    }

    // Check for alliance/military deals
    if (lowerResponse.includes("alliance") || lowerResponse.includes("military cooperation")) {
      return {
        dealType: "alliance",
        dealTerms: {
          description: "Military alliance or cooperation",
        },
      };
    }

    return undefined;
  }
}

