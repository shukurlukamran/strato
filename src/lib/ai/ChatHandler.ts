import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { LLMStrategicAnalysis } from "@/lib/ai/LLMStrategicPlanner";
import { getDiplomaticScore } from "@/lib/game-engine/DiplomaticRelations";
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
  strategicPlan?: (LLMStrategicAnalysis & { validUntilTurn?: number }) | null;
}

/**
 * Handles diplomatic chat with AI countries using LLM integration.
 * Falls back to stub responses if Google Gemini API key is not configured.
 */
export class ChatHandler {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null = null;

  constructor() {
    // Use environment variable for API key (never hardcode in production)
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("ChatHandler: GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY environment variable is not set.");
      return;
    }
    
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Use Gemini 2.x models (1.5 models were retired on Sept 24, 2025)
      // Primary: gemini-2.5-flash (fastest, recommended)
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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

      let strategicPlan: (LLMStrategicAnalysis & { validUntilTurn?: number }) | null = null;

      try {
        const planRes = await supabase
          .from("llm_strategic_plans")
          .select(
            "turn_analyzed, valid_until_turn, strategic_focus, rationale, threat_assessment, opportunity_identified, recommended_actions, diplomatic_stance, confidence_score"
          )
          .eq("game_id", turn.gameId)
          .eq("country_id", turn.receiverCountryId)
          .lte("turn_analyzed", gameRes.data.current_turn)
          .gte("valid_until_turn", gameRes.data.current_turn)
          .order("turn_analyzed", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planRes.data) {
          strategicPlan = {
            strategicFocus: planRes.data.strategic_focus,
            rationale: planRes.data.rationale,
            threatAssessment: planRes.data.threat_assessment,
            opportunityIdentified: planRes.data.opportunity_identified,
            recommendedActions: Array.isArray(planRes.data.recommended_actions)
              ? planRes.data.recommended_actions
              : [],
            diplomaticStance: (planRes.data.diplomatic_stance as Record<string, "friendly" | "neutral" | "hostile">) ?? {},
            confidenceScore: Number(planRes.data.confidence_score ?? 0.7),
            turnAnalyzed: Number(planRes.data.turn_analyzed),
            validUntilTurn: Number(planRes.data.valid_until_turn),
          };
        }
      } catch (planError) {
        console.warn("ChatHandler: Failed to fetch strategic plan:", planError);
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
        strategicPlan,
      };
    } catch {
      return null;
    }
  }

  private buildSystemPrompt(context: GameContext): string {
    const { senderCountry, receiverCountry, senderStats, receiverStats, turn } = context;
    const diplomaticScore = getDiplomaticScore(
      receiverStats.diplomaticRelations,
      senderCountry.id
    );

    const strategicPlanBlock = context.strategicPlan
      ? `
CURRENT STRATEGIC PLAN (valid through turn ${context.strategicPlan.validUntilTurn ?? turn}):
- Focus: ${context.strategicPlan.strategicFocus}
- Rationale: ${context.strategicPlan.rationale}
- Threats: ${context.strategicPlan.threatAssessment}
- Opportunities: ${context.strategicPlan.opportunityIdentified}
- Recommended Actions: ${context.strategicPlan.recommendedActions.join("; ") || "None"}
- Diplomatic Stance Guidance: ${JSON.stringify(context.strategicPlan.diplomaticStance)}`
      : `
CURRENT STRATEGIC PLAN:
- No active LLM plan found. Use pragmatic, risk-aware judgment.`;

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
- Your relations with them: ${diplomaticScore}/100

${strategicPlanBlock}

INSTRUCTIONS:
1. Respond as a strategic, realistic diplomatic representative who acts in ${receiverCountry.name}'s best interests
2. Consider your country's resources, military strength, and economic situation when negotiating
3. Be diplomatic but firm - you're not easily manipulated
4. If a deal is proposed, evaluate it based on mutual benefit and your country's needs
5. Keep responses concise (2-4 sentences typically, up to 2 paragraphs max)
6. Match the tone of the conversation - formal for serious negotiations, more casual for friendly chats
7. Reference specific stats or resources when relevant to show you're paying attention
8. If they propose something unreasonable, politely decline or counter-propose
9. Align your response with the current strategic plan focus and recommended actions when present

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

  /**
   * Rule-based response system for common messages (avoids LLM calls)
   * Returns null if LLM is needed for complex response
   */
  private getRuleBasedResponse(messageText: string): string | null {
    const lower = messageText.toLowerCase().trim();
    
    // Greetings
    if (lower.match(/^(hi|hello|hey|greetings|good (morning|afternoon|evening))\.?$/)) {
      const responses = [
        "Greetings. How can I assist you?",
        "Hello. What brings you to our diplomatic table?",
        "Welcome. I'm listening.",
        "Greetings. What matters do you wish to discuss?"
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Simple affirmations
    if (lower.match(/^(ok|okay|sure|fine|alright|sounds good|agreed|yes|yep|yeah)\.?$/)) {
      const responses = [
        "Understood.",
        "Acknowledged.",
        "Very well.",
        "Noted."
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Thanks
    if (lower.match(/^(thanks|thank you|thx|ty|appreciated)\.?$/)) {
      const responses = [
        "You're welcome.",
        "My pleasure.",
        "Glad we could reach an understanding.",
        "Anytime."
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Goodbyes
    if (lower.match(/^(bye|goodbye|see you|later|farewell|talk later)\.?$/)) {
      const responses = [
        "Farewell.",
        "Until next time.",
        "Goodbye.",
        "Safe travels."
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Simple questions that need LLM
    // But we can provide basic responses for very simple queries
    if (lower.match(/^(what|how|why|when|where)\s/)) {
      return null; // Needs LLM for context-aware response
    }
    
    // Deal/trade keywords - needs LLM for proper negotiation
    if (lower.match(/(trade|deal|exchange|alliance|war|attack|military|resources?|budget)/)) {
      return null; // Needs LLM for strategic response
    }
    
    // Short messages (< 5 words) that aren't matched above might be simple
    const wordCount = lower.split(/\s+/).length;
    if (wordCount <= 2 && lower.length < 20) {
      // Very short unmatched message - give generic acknowledgment
      return "I understand. Please elaborate if you have specific proposals.";
    }
    
    return null; // Needs LLM for complex response
  }

  async respond(turn: ChatTurn): Promise<ChatResponse> {
    // Try rule-based response first (avoids LLM call for simple messages)
    const ruleBasedResponse = this.getRuleBasedResponse(turn.messageText);
    if (ruleBasedResponse) {
      console.log(`[ChatHandler] Using rule-based response (saved API call)`);
      return {
        messageText: ruleBasedResponse,
      };
    }
    
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
      
      // Try to use Gemini even without full context - provide a basic prompt
      try {
        const basicPrompt = `You are a diplomatic representative in a strategy game. A player has sent you this message: "${turn.messageText}". Respond diplomatically and strategically, as if you represent an AI-controlled country. Keep your response concise (2-3 sentences).`;
        
        const result = await this.model!.generateContent(basicPrompt);
        const response = result.response;
        const responseText = response.text().trim() || "I'm considering your proposal.";
        
        return {
          messageText: responseText,
        };
      } catch (fallbackError) {
        console.error("Even fallback Gemini call failed:", fallbackError);
        // Final fallback
        return {
          messageText: `I understand your message: "${turn.messageText}". However, I need more context to provide a proper response.`,
        };
      }
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const historyMessages = this.buildHistoryMessages(context);

    try {
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
        
        // If model not found error, try alternative models
        if (error.message.includes("not found") || error.message.includes("404")) {
          console.warn("Model not found, trying alternative models...");
          return await this.tryAlternativeModels(context, turn.messageText, systemPrompt, historyMessages);
        }
        
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

  private async tryAlternativeModels(
    context: GameContext,
    messageText: string,
    systemPrompt: string,
    historyMessages: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>
  ): Promise<ChatResponse> {
    // Try alternative Gemini 2.x models (1.5 models were retired on Sept 24, 2025)
    const alternativeModels = [
      "gemini-2.5-flash-lite",  // Fallback 1: Even faster variant
      "gemini-2.0-flash",       // Fallback 2: Previous generation
      "gemini-3-flash-preview"  // Fallback 3: Preview version
    ];
    
    for (let i = 0; i < alternativeModels.length; i++) {
      const modelName = alternativeModels[i];
      try {
        console.log(`[${i + 1}/${alternativeModels.length}] Trying alternative model: ${modelName}`);
        
        // Exponential backoff: wait before retrying (except first attempt)
        if (i > 0) {
          const delayMs = Math.min(1000 * Math.pow(2, i - 1), 5000); // Max 5 seconds
          console.log(`Waiting ${delayMs}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        const altModel = this.genAI!.getGenerativeModel({ model: modelName });
        
        const chat = altModel.startChat({
          history: [
            {
              role: "user",
              parts: [{ text: systemPrompt }],
            },
            {
              role: "model",
              parts: [{ text: "Understood. I'm ready to negotiate as the representative of " + context.receiverCountry.name + "." }],
            },
            ...historyMessages,
          ],
        });

        const result = await chat.sendMessage(messageText);
        const response = result.response;
        const responseText = response.text().trim() || "I'm considering your proposal.";
        
        console.log(`✓ Successfully used model: ${modelName}`);
        return {
          messageText: responseText,
        };
      } catch (altError) {
        const errorMsg = altError instanceof Error ? altError.message : String(altError);
        console.warn(`✗ Model ${modelName} failed:`, errorMsg);
        
        // Log full error details for debugging
        if (altError instanceof Error && altError.stack) {
          console.warn(`Error stack:`, altError.stack);
        }
        
        // Check for specific error types
        if (errorMsg.includes("quota") || errorMsg.includes("rate limit")) {
          console.error("API quota or rate limit exceeded. Please check your Google Cloud quota.");
          break; // Don't try more models if quota is exceeded
        }
        
        if (errorMsg.includes("API_KEY") || errorMsg.includes("401") || errorMsg.includes("403")) {
          console.error("API key authentication failed. Check GOOGLE_GEMINI_API_KEY environment variable.");
          break; // Don't try more models if auth fails
        }
        
        continue;
      }
    }
    
    // If all models fail, return fallback
    console.error("All Gemini models failed. Returning fallback response.");
    return {
      messageText: `I've received your message: "${messageText}". Let me consider this carefully and get back to you.`,
    };
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

