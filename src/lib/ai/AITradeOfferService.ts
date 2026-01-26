import { TradeProposal } from './TradePlanner';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import { ChatHandler } from './ChatHandler';

// Track last AI offer sent per (gameId, aiCountryId, playerCountryId) to prevent spam
// Key format: "${gameId}|${aiCountryId}|${playerCountryId}"
const lastOfferTurnByKey = new Map<string, number>();

export class AITradeOfferService {
  constructor() {}

  private async getSupabaseClient() {
    const { getSupabaseServerClient } = await import('../supabase/server');
    return getSupabaseServerClient();
  }

  /**
   * Determine if AI should offer a trade to player this turn
   * AI treats player countries the same as AI countries - if there's a beneficial trade, offer it
   */
  shouldOfferTrade(
    aiCountryId: string,
    playerCountryId: string,
    turn: number,
    gameId: string,
    gameState: GameStateSnapshot
  ): boolean {
    // Minimal cooldown to prevent spam within same turn (but allow frequent offers)
    const key = `${gameId}|${aiCountryId}|${playerCountryId}`;
    const lastOfferTurn = lastOfferTurnByKey.get(key);
    if (lastOfferTurn !== undefined && turn - lastOfferTurn < 2) {
      console.log(`[AI Trade Offer] Cooldown active for ${aiCountryId} -> ${playerCountryId} (last offer: turn ${lastOfferTurn}, current: ${turn})`);
      return false;
    }

    // No turn modulo restrictions - AI can offer whenever there's a beneficial trade
    // This matches how AI-to-AI trading works

    console.log(`[AI Trade Offer] Checking if ${aiCountryId} should offer trade to ${playerCountryId} on turn ${turn}`);
    
    // Let TradePlanner determine if there's a beneficial trade
    // This function just gates the frequency, not the quality
    return true;
  }

  /**
   * Generate and send trade offer message via diplomacy chat
   * Creates a proposed deal that requires player confirmation
   */
  async sendTradeOffer(
    gameId: string,
    aiCountryId: string,
    playerCountryId: string,
    proposal: TradeProposal,
    currentTurn: number
  ): Promise<void> {
    try {
      const supabase = await this.getSupabaseClient();
      const now = new Date().toISOString();

      // Create a proposed deal in the database
      const dealData = {
        game_id: gameId,
        proposing_country_id: aiCountryId,
        receiving_country_id: playerCountryId,
        deal_type: 'trade',
        deal_terms: {
          proposerCommitments: proposal.terms.proposerCommitments,
          receiverCommitments: proposal.terms.receiverCommitments
        },
        status: 'proposed', // Requires player confirmation
        proposed_at: now,
        accepted_at: null,
        turn_created: currentTurn,
        turn_expires: currentTurn + 3, // Offer expires in 3 turns
        created_at: now,
        updated_at: now
      };

      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert(dealData)
        .select()
        .single();

      if (dealError || !deal) {
        console.error('[AI Trade Offer] Failed to create deal:', dealError);
        return;
      }

      console.log(
        `[AI Trade Offer] Created proposed deal ${deal.id} game=${gameId} proposer=${aiCountryId} receiver=${playerCountryId} status=${deal.status}`,
      );

      // Find or create diplomacy chat between AI and player
      const chatId = await this.findOrCreateDiplomacyChat(gameId, aiCountryId, playerCountryId);

      if (!chatId) {
        console.warn(`[AI Trade Offer] Could not find or create chat between ${aiCountryId} and ${playerCountryId}`);
        return;
      }

      // Generate offer message with deal reference
      const offerMessage = this.generateOfferMessage(proposal, deal.id);

      // Insert message directly into database
      const messageInsert = await supabase
        .from("chat_messages")
        .insert({
          chat_id: chatId,
          sender_country_id: aiCountryId,
          message_text: offerMessage,
          is_ai_generated: true,
          created_at: now,
        })
        .select("id")
        .single();

      if (messageInsert.error) {
        throw new Error(`Failed to insert chat message: ${messageInsert.error.message}`);
      }

      // Update chat last_message_at
      await supabase
        .from("diplomacy_chats")
        .update({
          last_message_at: now,
          updated_at: now
        })
        .eq("id", chatId);

      // Update cooldown tracker
      const key = `${gameId}|${aiCountryId}|${playerCountryId}`;
      lastOfferTurnByKey.set(key, currentTurn);

      // Fetch country names for logging
      const countriesRes = await supabase
        .from('countries')
        .select('id, name')
        .in('id', [aiCountryId, playerCountryId]);
      
      const countryNames = new Map(countriesRes.data?.map(c => [c.id, c.name]) || []);
      const aiName = countryNames.get(aiCountryId) || 'Unknown';
      const playerName = countryNames.get(playerCountryId) || 'Unknown';

      console.log(`[AI Trade Offer] ${aiName} (${aiCountryId}) sent trade offer to ${playerName} (${playerCountryId}) - Deal ID: ${deal.id}`);
    } catch (error) {
      console.error('[AI Trade Offer] Failed to send trade offer:', error);
    }
  }

  /**
   * Find existing diplomacy chat or create a new one
   */
  private async findOrCreateDiplomacyChat(
    gameId: string,
    countryId1: string,
    countryId2: string
  ): Promise<string | null> {
    try {
      const { getSupabaseServerClient } = await import('../supabase/server');
      const supabase = getSupabaseServerClient();

      // Look for existing diplomacy chat between these countries (try both orderings)
      const { data: chatA, error: errorA } = await supabase
        .from('diplomacy_chats')
        .select('id')
        .eq('game_id', gameId)
        .eq('country_a_id', countryId1)
        .eq('country_b_id', countryId2)
        .maybeSingle();

      if (chatA && !errorA) {
        return chatA.id;
      }

      const { data: chatB, error: errorB } = await supabase
        .from('diplomacy_chats')
        .select('id')
        .eq('game_id', gameId)
        .eq('country_a_id', countryId2)
        .eq('country_b_id', countryId1)
        .maybeSingle();

      if (chatB && !errorB) {
        return chatB.id;
      }

      // Create new diplomacy chat if none exists
      const { data: newChat, error: createError } = await supabase
        .from('diplomacy_chats')
        .insert({
          game_id: gameId,
          country_a_id: countryId1,
          country_b_id: countryId2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (createError) {
        console.error('[AI Trade Offer] Failed to create diplomacy chat:', createError);
        return null;
      }

      return newChat?.id || null;
    } catch (error) {
      console.error('[AI Trade Offer] Error finding/creating diplomacy chat:', error);
      return null;
    }
  }

  /**
   * Generate a natural language trade offer message
   */
  private generateOfferMessage(proposal: TradeProposal, dealId: string): string {
    const proposerCommitments = proposal.terms.proposerCommitments;
    const receiverCommitments = proposal.terms.receiverCommitments;

    let message = "Greetings, esteemed leader. ";

    // Describe what we're offering and what we want
    if (proposerCommitments.length > 0 && receiverCommitments.length > 0) {
      const proposerDesc = this.describeCommitments(proposerCommitments, true);
      const receiverDesc = this.describeCommitments(receiverCommitments, false);

      message += `We have surplus ${proposerDesc} and are seeking ${receiverDesc}. `;
      message += `Would you be interested in this trade proposal: ${this.formatCommitments(proposerCommitments)} in exchange for ${this.formatCommitments(receiverCommitments)}?`;

      message += `\n\n📋 **Trade Offer ID: ${dealId}**\nThis offer will expire in 3 turns. You will receive a notification to accept or reject this trade.`;
    } else {
      message += "We are interested in establishing trade relations. Perhaps we can discuss mutual benefits.";
    }

    return message;
  }

  /**
   * Describe commitments in natural language
   */
  private describeCommitments(commitments: any[], isProposer: boolean): string {
    const resourceCommitments = commitments.filter(c => c.type === 'resource_transfer');
    const budgetCommitments = commitments.filter(c => c.type === 'budget_transfer');

    const descriptions: string[] = [];

    if (resourceCommitments.length > 0) {
      const resources = resourceCommitments.map(c => c.resource).join(' and ');
      descriptions.push(resources);
    }

    if (budgetCommitments.length > 0) {
      const totalBudget = budgetCommitments.reduce((sum, c) => sum + (c.amount || 0), 0);
      descriptions.push(`budget funds ($${totalBudget})`);
    }

    return descriptions.join(' and ') || 'resources';
  }

  /**
   * Format commitments for display in trade offer
   */
  private formatCommitments(commitments: any[]): string {
    return commitments.map(c => {
      if (c.type === 'resource_transfer') {
        return `${c.amount}x ${c.resource}`;
      } else if (c.type === 'budget_transfer') {
        return `$${c.amount}`;
      }
      return c.type;
    }).join(' + ');
  }
}