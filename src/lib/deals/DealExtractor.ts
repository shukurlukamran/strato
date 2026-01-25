import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MarketPricing } from "@/lib/game-engine/MarketPricing";
import type { ChatMessage } from "@/types/chat";
import type { DealType, DealTerms, DealCommitment } from "@/types/deals";
import type { Country, CountryStats } from "@/types/country";


export interface DealExtractionResult {
  dealType: DealType;
  dealTerms: DealTerms;
  proposerCountryId: string; // Which country is actually the proposer
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
  private async buildExtractionPrompt(context: ExtractionContext): Promise<string> {
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


${await this.getMarketPricesBlock(context)}


CHAT HISTORY:
${chatHistory}


DEAL TYPES:
- "trade": Exchange of resources, budget, or goods
- "alliance": Mutual defense or cooperation agreement
- "non_aggression": Peace pact, no military action
- "military_aid": Military equipment, budget, or support
- "technology_share": Sharing technology or research
- "custom": Complex multi-term agreement


AVAILABLE RESOURCES (8 types):
- Basic: "food" (population survival), "timber" (construction)
- Strategic: "iron" (military), "oil" (advanced military/energy)
- Economic: "gold" (diplomacy/luxury), "copper" (research/trade)
- Industrial: "steel" (tech/infrastructure), "coal" (energy/research)


DIRECTIONALITY - WHO GIVES WHAT:
- CountryA = ${countryA.name} (${countryA.isPlayerControlled ? "Player" : "AI"})
- CountryB = ${countryB.name} (${countryB.isPlayerControlled ? "Player" : "AI"})
- proposerCommitments = what CountryA gives to CountryB
- receiverCommitments = what CountryB gives to CountryA

If CountryA says "I want to SELL you 100 food for 200 credits":
  - proposerCommitments: [{"type": "resource_transfer", "resource": "food", "amount": 100}]
  - receiverCommitments: [{"type": "budget_transfer", "amount": 200}]

If CountryA says "I want to BUY 100 food from you for 200 credits":
  - proposerCommitments: [{"type": "budget_transfer", "amount": 200}]
  - receiverCommitments: [{"type": "resource_transfer", "resource": "food", "amount": 100}]


COMMITMENT TYPES:
- "resource_transfer": Transfer a resource (use resource names from list above)
- "budget_transfer": Transfer budget/credits
- "military_equipment_transfer": Transfer military equipment
- "diplomatic_commitment": Change in diplomatic relations
- "technology_boost": Increase technology level
- "action_commitment": Commit to specific actions (e.g., "no_attack", "mutual_defense")


CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. DETECT DEALS LIBERALLY:
   You should set hasDeal: true if ANY of these are present:
   - Explicit agreements ("I'll give you X for Y", "Deal!", "Agreed", "Sounds good")
   - Implicit negotiations ("How about 100 oil?" followed by "That works", "OK", "Sure", "Yes")
   - One-sided offers being discussed ("I can offer you X" without rejection)
   - Mentions of trade/exchange/alliance/cooperation even without full terms
   - ANY indication both parties are discussing cooperation, trade, or agreements
   - Questions about trades that receive positive responses
   - Proposals that aren't explicitly rejected

2. DEFAULT BEHAVIOR - PREFER FALSE POSITIVES:
   - When in doubt, extract the deal with lower confidence (0.3-0.5)
   - It's better to extract a potential deal than miss it completely
   - Use reasonable defaults if amounts aren't specified
   - Extract deals even if they're still being negotiated
   - If one party proposes and the other doesn't reject, that's a deal in progress

3. HANDLING VAGUE INFORMATION:
   - If amounts are vague ("some", "a bit", "a lot"), estimate based on context
   - If duration not specified: use 1 turn for trades, 5 turns for alliances
   - If only one side commits, that's still valid (military aid, gifts)
   - Look for keywords: "trade", "exchange", "deal", "agreement", "alliance", "give", "offer", "help", "support"

4. EXAMPLES OF WHAT TO EXTRACT:
   - CountryA: "I'll give you 100 oil for 200 credits" → CountryA gives oil (proposer), CountryB gives credits (receiver)
   - CountryB: "Deal!" = hasDeal: true
   - CountryA: "I want to BUY 100 oil for 200 credits" → CountryA gives credits (proposer), CountryB gives oil (receiver)

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "hasDeal": true/false,
  "proposerIsCountryA": true/false,  // true if CountryA is the proposer, false if CountryB is the proposer
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


If absolutely NO negotiation or deal discussion is happening, return: {"hasDeal": false, "reasoning": "No trade or agreement discussion detected"}`;
  }

  private async getMarketPricesBlock(context: ExtractionContext): Promise<string> {
    try {
      const marketPrices = await MarketPricing.computeMarketPricesForGame(context.gameId, context.turn);
      return `
CURRENT MARKET RATES (Turn ${context.turn}):
${Object.entries(marketPrices.marketPrices).map(([r, p]) =>
  `- ${r}: Market $${p.toFixed(1)}, Black Market Buy $${marketPrices.blackMarketBuyPrices[r].toFixed(1)}, Sell $${marketPrices.blackMarketSellPrices[r].toFixed(1)}`
).join('\n')}

Use these prices as reference for fair deal evaluation.`;
    } catch (error) {
      console.error('[DealExtractor] Failed to fetch market prices:', error);
      return `
CURRENT MARKET RATES:
- Market prices currently unavailable. Use reasonable estimates for deal evaluation.`;
    }
  }

  /**
   * Simple pattern matching to detect if there's likely a deal without LLM
   * Returns null if LLM is needed for proper extraction
   */
  private quickDealDetection(messages: ChatMessage[]): { hasDeal: boolean; confidence: number } {
    const chatText = messages.map(m => m.messageText.toLowerCase()).join(' ');

    // Word-boundary regex for deal keywords
    const dealKeywords = ['\\btrade\\b', '\\bdeal\\b', '\\bexchange\\b', '\\bgive\\b', '\\boffer\\b',
                        '\\balliance\\b', '\\bagreement\\b', '\\bpact\\b', '\\bbuy\\b', '\\bsell\\b',
                        '\\bpurchase\\b', '\\bpay\\b'];
    const hasDealKeywords = dealKeywords.some(kw => new RegExp(kw).test(chatText));

    if (!hasDealKeywords) {
      return { hasDeal: false, confidence: 0.9 };
    }

    // Acceptance keywords (word boundaries)
    const acceptanceKeywords = ['\\baccept\\b', '\\bagreed\\b', '\\bdeal\\b', '\\bok\\b', '\\bsure\\b',
                              '\\byes\\b', 'sounds good', 'that works', '\\bfine\\b'];
    const hasAcceptance = acceptanceKeywords.some(kw => new RegExp(kw).test(chatText));

    // Rejection keywords (word boundaries) - removed standalone "no"
    const rejectionKeywords = ['\\breject\\b', '\\bdecline\\b', 'not interested', "can't", "won't", '\\brefuse\\b', 'no way', 'absolutely not'];
    const hasRejection = rejectionKeywords.some(kw => new RegExp(kw).test(chatText));

    // If explicit rejection WITHOUT acceptance, skip LLM
    if (hasRejection && !hasAcceptance) {
      return { hasDeal: false, confidence: 0.8 };
    }

    if (messages.length < 2) {
      return { hasDeal: false, confidence: 0.7 };
    }

    // Likely has a deal - use LLM
    return { hasDeal: true, confidence: 0.0 }; // 0 confidence = "use LLM"
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
      console.log("DealExtractor: No messages in chat");
      return null;
    }
    
    // Quick pattern matching to avoid unnecessary LLM calls
    const quickCheck = this.quickDealDetection(context.chatMessages);
    if (!quickCheck.hasDeal && quickCheck.confidence > 0.6) {
      // High confidence that there's no deal - skip LLM
      console.log(`[DealExtractor] Quick detection: No deal (confidence: ${quickCheck.confidence}), saved API call`);
      return null;
    }

    // Debug logging (gated by environment variable)
    if (process.env.DEAL_DEBUG === "1") {
      console.log("\n=== CHAT MESSAGES DEBUG ===");
      console.log("Number of messages:", context.chatMessages.length);
      context.chatMessages.forEach((msg, idx) => {
        const sender = msg.senderCountryId === context.countryA.id ? context.countryA.name : context.countryB.name;
        console.log(`[${idx + 1}] ${sender}: "${msg.messageText}"`);
      });
      console.log("=== END CHAT DEBUG ===\n");
    }


    const prompt = await this.buildExtractionPrompt(context);


    try {
      if (process.env.DEAL_DEBUG === "1") {
        console.log("DealExtractor: Sending prompt to LLM with", {
          messageCount: context.chatMessages.length,
          countryA: context.countryA.name,
          countryB: context.countryB.name,
        });
      }


      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const responseText = response.text().trim();


      if (process.env.DEAL_DEBUG === "1") {
        console.log("\n=== DEAL EXTRACTION DEBUG ===");
        console.log("Full LLM Response:", responseText);
      }


      // IMPROVED JSON EXTRACTION - Handle markdown code blocks from Gemini
      let cleanedResponse = responseText;
      
      // Remove markdown code blocks (```json, ```, etc.)
      cleanedResponse = cleanedResponse.replace(/^```json\s*/gm, '');
      cleanedResponse = cleanedResponse.replace(/^```\s*/gm, '');
      cleanedResponse = cleanedResponse.replace(/```$/gm, '');
      cleanedResponse = cleanedResponse.trim();


      // Parse JSON response
      let parsed: {
        hasDeal: boolean;
        proposerIsCountryA?: boolean;
        dealType?: DealType | null;
        proposerCommitments?: DealCommitment[];
        receiverCommitments?: DealCommitment[];
        conditions?: string[];
        confidence?: number;
        reasoning?: string;
      };


      try {
        // Try to extract JSON from response
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);  // ✅ FIX: Access first match element
        } else {
          console.error("DealExtractor: No JSON object found in response");
          return null;
        }
        
        if (process.env.DEAL_DEBUG === "1") {
          console.log("Parsed Response:", JSON.stringify(parsed, null, 2));
        }
      } catch (parseError) {
        console.error("DealExtractor: Failed to parse LLM response as JSON");
        console.error("Cleaned response:", cleanedResponse);
        console.error("Parse error:", parseError);
        return null;
      }



      // Log detailed extraction info
      if (process.env.DEAL_DEBUG === "1") {
        console.log("hasDeal:", parsed.hasDeal);
        console.log("dealType:", parsed.dealType);
        console.log("Proposer commitments:", parsed.proposerCommitments?.length || 0);
        console.log("Receiver commitments:", parsed.receiverCommitments?.length || 0);
        console.log("Confidence:", parsed.confidence);
        console.log("Reasoning:", parsed.reasoning);
      }


      // Check for keyword fallback if LLM says no deal
      if (!parsed.hasDeal) {
        const chatText = context.chatMessages.map(m => m.messageText.toLowerCase()).join(' ');
        const dealKeywords = ['trade', 'deal', 'exchange', 'give you', 'offer', 'alliance', 'agreement', 'accept', 'agreed', 'sure', 'ok', 'yes'];
        const hasKeywords = dealKeywords.some(kw => chatText.includes(kw));
        
        if (hasKeywords) {
          console.warn("DealExtractor: Keywords suggest deal, but LLM said no. Reasoning:", parsed.reasoning);
        }
        
        if (process.env.DEAL_DEBUG === "1") {
          console.log("=== END DEBUG (NO DEAL) ===\n");
        }
        return null;
      }


      // RELAXED VALIDATION - Allow deals without explicit type
      const dealType = parsed.dealType || "custom";
      
      if (!dealType) {
        if (process.env.DEAL_DEBUG === "1") {
          console.log("DealExtractor: No deal type specified, rejecting");
          console.log("=== END DEBUG (NO TYPE) ===\n");
        }
        return null;
      }


      // Validate and build deal terms
      const proposerCommitments: DealCommitment[] = parsed.proposerCommitments || [];
      const receiverCommitments: DealCommitment[] = parsed.receiverCommitments || [];


      // RELAXED: Allow empty commitments if confidence is reasonable
      // (e.g., non-aggression pacts, alliances without immediate transfers)
      if (proposerCommitments.length === 0 && receiverCommitments.length === 0) {
        const confidence = parsed.confidence ?? 0;
        if (confidence < 0.4) {
          if (process.env.DEAL_DEBUG === "1") {
            console.log("DealExtractor: No commitments and low confidence, rejecting");
            console.log("=== END DEBUG (NO COMMITMENTS) ===\n");
          }
          return null;
        }
        if (process.env.DEAL_DEBUG === "1") {
          console.log("DealExtractor: No immediate commitments but treating as agreement/pact");
        }
      }


      const dealTerms: DealTerms = {
        proposerCommitments,
        receiverCommitments,
        conditions: parsed.conditions || [],
      };


      const extractedFromMessages = context.chatMessages.map((m) => m.id);


      if (process.env.DEAL_DEBUG === "1") {
        console.log("=== DEAL EXTRACTED SUCCESSFULLY ===\n");
      }


      // Determine who the actual proposer is
      const proposerIsCountryA = parsed.proposerIsCountryA ?? true; // Default to CountryA if not specified
      const proposerCountryId = proposerIsCountryA ? countryAId : countryBId;

      // If CountryB is the proposer, we need to swap the commitments
      let finalDealTerms = dealTerms;
      if (!proposerIsCountryA) {
        // Log directionality swap for validation
        if (process.env.DEAL_DEBUG === "1") {
          console.log(`[DealExtractor] Deal directionality swapped: Proposer is CountryB (${countryBId})`);
          console.log(`[DealExtractor] Swapped commitments:`, {
            proposerA_gives: dealTerms.proposerCommitments,
            proposerB_gives: dealTerms.receiverCommitments
          });
        }
        
        finalDealTerms = {
          proposerCommitments: dealTerms.receiverCommitments, // What B gives becomes proposer commitments
          receiverCommitments: dealTerms.proposerCommitments,  // What A gives becomes receiver commitments
          conditions: dealTerms.conditions,
        };
      } else if (process.env.DEAL_DEBUG === "1") {
        console.log(`[DealExtractor] Deal directionality normal: Proposer is CountryA (${countryAId})`);
      }

      return {
        dealType,
        dealTerms: finalDealTerms,
        proposerCountryId,
        confidence: parsed.confidence ?? 0.5,
        extractedFromMessages,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      console.error("Error extracting deal:", error);
      return null;
    }
  }
}
