import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/chat";
import type { DealType, DealTerms, DealCommitment } from "@/types/deals";
import type { Country, CountryStats } from "@/types/country";

export interface DealExtractionResult {
  dealType: DealType;
  dealTerms: DealTerms;
  confidence: number; // 0-1
  extractedFromMessages: string[]; // message IDs
  reasoning?: string; // Why this deal was extracted
}

interface ExtractionContext {
  gameId: string;
  turn: number;
  countryA: Country;
  countryB: Country;
  countryAStats: CountryStats;
  countryBStats: CountryStats;
  chatMessages: ChatMessage[];
}

/**
 * Extracts structured deal terms from chat conversations using LLM.
 * Falls back to null if no deal is detected or if extraction fails.
 */
export class DealExtractor {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

  constructor() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("DealExtractor: GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY environment variable is not set.");
      return;
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  }

  /**
   * Fetches game context needed for deal extraction
   */
  private async fetchContext(
    gameId: string,
    chatId: string,
    countryAId: string,
    countryBId: string
  ): Promise<ExtractionContext | null> {
    try {
      const supabase = getSupabaseServerClient();

      // Fetch game info
      const gameRes = await supabase
        .from("games")
        .select("id, current_turn")
        .eq("id", gameId)
        .single();
      if (gameRes.error) {
        console.error("Failed to fetch game:", gameRes.error);
        return null;
      }

      // Fetch countries
      const countriesRes = await supabase
        .from("countries")
        .select("id, game_id, name, is_player_controlled, color, position_x, position_y")
        .in("id", [countryAId, countryBId]);
      if (countriesRes.error || !countriesRes.data || countriesRes.data.length !== 2) {
        console.error("Failed to fetch countries:", countriesRes.error);
        return null;
      }

      const countryA = countriesRes.data.find((c) => c.id === countryAId);
      const countryB = countriesRes.data.find((c) => c.id === countryBId);
      if (!countryA || !countryB) {
        console.error("Could not find countries");
        return null;
      }

      // Fetch country stats
      const statsRes = await supabase
        .from("country_stats")
        .select(
          "id, country_id, turn, population, budget, technology_level, military_strength, military_equipment, resources, diplomatic_relations, created_at"
        )
        .eq("turn", gameRes.data.current_turn)
        .in("country_id", [countryAId, countryBId]);
      if (statsRes.error) {
        console.error("Failed to fetch country stats:", statsRes.error);
        return null;
      }

      const countryAStats = statsRes.data.find((s) => s.country_id === countryAId);
      const countryBStats = statsRes.data.find((s) => s.country_id === countryBId);
      if (!countryAStats || !countryBStats) {
        console.error("Could not find country stats");
        return null;
      }

      // Fetch recent chat messages (last 20 messages)
      const messagesRes = await supabase
        .from("chat_messages")
        .select("id, chat_id, sender_country_id, message_text, is_ai_generated, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(20);
      
      const chatMessages: ChatMessage[] = [];
      if (!messagesRes.error && messagesRes.data) {
        chatMessages.push(
          ...messagesRes.data
            .reverse() // Reverse to get chronological order
            .map((m) => ({
              id: m.id,
              chatId: m.chat_id,
              senderCountryId: m.sender_country_id,
              messageText: m.message_text,
              isAiGenerated: m.is_ai_generated,
              createdAt: m.created_at,
            }))
        );
      }

      return {
        gameId,
        turn: gameRes.data.current_turn,
        countryA: {
          id: countryA.id,
          gameId: countryA.game_id,
          name: countryA.name,
          isPlayerControlled: countryA.is_player_controlled,
          color: countryA.color,
          positionX: Number(countryA.position_x),
          positionY: Number(countryA.position_y),
        },
        countryB: {
          id: countryB.id,
          gameId: countryB.game_id,
          name: countryB.name,
          isPlayerControlled: countryB.is_player_controlled,
          color: countryB.color,
          positionX: Number(countryB.position_x),
          positionY: Number(countryB.position_y),
        },
        countryAStats: {
          id: countryAStats.id,
          countryId: countryAStats.country_id,
          turn: countryAStats.turn,
          population: countryAStats.population,
          budget: Number(countryAStats.budget),
          technologyLevel: Number(countryAStats.technology_level),
          militaryStrength: countryAStats.military_strength,
          militaryEquipment: countryAStats.military_equipment ?? {},
          resources: countryAStats.resources ?? {},
          diplomaticRelations: countryAStats.diplomatic_relations ?? {},
          createdAt: countryAStats.created_at,
        },
        countryBStats: {
          id: countryBStats.id,
          countryId: countryBStats.country_id,
          turn: countryBStats.turn,
          population: countryBStats.population,
          budget: Number(countryBStats.budget),
          technologyLevel: Number(countryBStats.technology_level),
          militaryStrength: countryBStats.military_strength,
          militaryEquipment: countryBStats.military_equipment ?? {},
          resources: countryBStats.resources ?? {},
          diplomaticRelations: countryBStats.diplomatic_relations ?? {},
          createdAt: countryBStats.created_at,
        },
        chatMessages,
      };
    } catch (error) {
      console.error("Error fetching extraction context:", error);
      return null;
    }
  }

  /**
   * Builds the prompt for LLM to extract deal terms
   */
  private buildExtractionPrompt(context: ExtractionContext): string {
    const { countryA, countryB, countryAStats, countryBStats, chatMessages, turn } = context;

    // Build chat history string with clear formatting
    const chatHistory = chatMessages
      .map((msg, idx) => {
        const sender = msg.senderCountryId === countryA.id ? countryA.name : countryB.name;
        return `[Message ${idx + 1}] ${sender}: ${msg.messageText}`;
      })
      .join("\n\n");

    return `You are analyzing a diplomatic conversation between two countries in a strategy game to extract any deal or agreement that has been discussed.

GAME CONTEXT:
- Current Turn: ${turn}
- Country A: ${countryA.name} (${countryA.isPlayerControlled ? "Player" : "AI"})
- Country B: ${countryB.name} (${countryB.isPlayerControlled ? "Player" : "AI"})

COUNTRY A (${countryA.name}) RESOURCES:
- Budget: ${countryAStats.budget.toLocaleString()} credits
- Resources: ${JSON.stringify(countryAStats.resources)}
- Technology Level: ${countryAStats.technologyLevel}
- Military Strength: ${countryAStats.militaryStrength}

COUNTRY B (${countryB.name}) RESOURCES:
- Budget: ${countryBStats.budget.toLocaleString()} credits
- Resources: ${JSON.stringify(countryBStats.resources)}
- Technology Level: ${countryBStats.technologyLevel}
- Military Strength: ${countryBStats.militaryStrength}

CHAT HISTORY:
${chatHistory}

DEAL TYPES:
- "trade": Exchange of resources, budget, or goods
- "alliance": Mutual defense or cooperation agreement
- "non_aggression": Peace pact, no military action
- "military_aid": Military equipment, budget, or support
- "technology_share": Sharing technology or research
- "custom": Complex multi-term agreement

COMMITMENT TYPES:
- "resource_transfer": Transfer a resource (oil, minerals, food, etc.)
- "budget_transfer": Transfer budget/credits
- "military_equipment_transfer": Transfer military equipment
- "diplomatic_commitment": Change in diplomatic relations
- "technology_boost": Increase technology level
- "action_commitment": Commit to specific actions (e.g., "no_attack", "mutual_defense")

INSTRUCTIONS:
1. CAREFULLY analyze the conversation to determine if a deal or agreement has been discussed
2. A deal can be:
   - Explicitly stated (e.g., "I'll give you 100 oil for 200 credits")
   - Implied through negotiation (e.g., "How about 100 oil?" followed by "That works for me")
   - Mentioned in any form (trade, exchange, agreement, deal, alliance, etc.)
3. If a deal IS present (even if not fully finalized), extract:
   - Deal type (one of the types above)
   - What Country A commits to give/do
   - What Country B commits to give/do
   - Duration (in turns, if specified, default to 1 turn for one-time trades)
   - Any conditions or requirements

4. Be specific with amounts, resources, and durations mentioned in the conversation
5. If amounts are vague (e.g., "some oil", "a lot"), use reasonable estimates based on context and available resources
6. If duration is not specified, use 1 turn for trades, 5 turns for alliances/non-aggression
7. Extract deals even if they're still being negotiated - if both parties are discussing terms, that's a deal
8. Look for keywords: "trade", "exchange", "deal", "agreement", "alliance", "give", "receive", "for", "in return", etc.
9. If one party proposes something and the other responds positively (even with "ok", "sure", "yes", "agreed"), extract it

Return your analysis as JSON in this exact format:
{
  "hasDeal": true/false,
  "dealType": "trade" | "alliance" | "non_aggression" | "military_aid" | "technology_share" | "custom" | null,
  "proposerCommitments": [
    {
      "type": "resource_transfer",
      "resource": "oil",
      "amount": 100,
      "durationTurns": 1
    }
  ],
  "receiverCommitments": [
    {
      "type": "budget_transfer",
      "amount": 200,
      "durationTurns": 1
    }
  ],
  "conditions": ["optional condition strings"],
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this deal was extracted"
}

If no deal is present, return: {"hasDeal": false}`;
  }

  /**
   * Extracts deal from chat conversation
   */
  async extractDealFromChat(
    gameId: string,
    chatId: string,
    countryAId: string,
    countryBId: string
  ): Promise<DealExtractionResult | null> {
    if (!this.model) {
      console.error("DealExtractor: Gemini model not initialized. Check GOOGLE_GEMINI_API_KEY.");
      return null;
    }

    // Fetch context
    const context = await this.fetchContext(gameId, chatId, countryAId, countryBId);
    if (!context) {
      console.error("DealExtractor: Failed to fetch context");
      return null;
    }

    if (context.chatMessages.length === 0) {
      return null;
    }

    const prompt = this.buildExtractionPrompt(context);

    try {
      console.log("DealExtractor: Sending prompt to LLM with", {
        messageCount: context.chatMessages.length,
        countryA: context.countryA.name,
        countryB: context.countryB.name,
      });

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text().trim();

      console.log("DealExtractor: LLM raw response:", responseText.substring(0, 500));

      // Parse JSON response
      let parsed: {
        hasDeal: boolean;
        dealType?: DealType | null;
        proposerCommitments?: DealCommitment[];
        receiverCommitments?: DealCommitment[];
        conditions?: string[];
        confidence?: number;
        reasoning?: string;
      };

      try {
        // Try to extract JSON from response (might have markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = JSON.parse(responseText);
        }
        console.log("DealExtractor: Parsed response:", JSON.stringify(parsed, null, 2));
      } catch (parseError) {
        console.error("DealExtractor: Failed to parse LLM response as JSON:", responseText);
        console.error("Parse error:", parseError);
        return null;
      }

      // Check if deal was detected
      if (!parsed.hasDeal || !parsed.dealType) {
        console.log("DealExtractor: No deal detected. Response:", {
          hasDeal: parsed.hasDeal,
          dealType: parsed.dealType,
          reasoning: parsed.reasoning,
        });
        return null;
      }

      // Validate and build deal terms
      const proposerCommitments: DealCommitment[] = parsed.proposerCommitments || [];
      const receiverCommitments: DealCommitment[] = parsed.receiverCommitments || [];

      if (proposerCommitments.length === 0 && receiverCommitments.length === 0) {
        // No actual commitments, not a valid deal
        return null;
      }

      const dealTerms: DealTerms = {
        proposerCommitments,
        receiverCommitments,
        conditions: parsed.conditions || [],
      };

      // Determine which country is the proposer (usually the one who initiated the deal in chat)
      // For now, we'll use countryA as proposer, but this could be improved by analyzing chat
      const extractedFromMessages = context.chatMessages.map((m) => m.id);

      return {
        dealType: parsed.dealType,
        dealTerms,
        confidence: parsed.confidence ?? 0.7,
        extractedFromMessages,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error("Error extracting deal:", error);
      return null;
    }
  }
}
