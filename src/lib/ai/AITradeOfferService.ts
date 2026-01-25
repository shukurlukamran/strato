import { TradeProposal } from './TradePlanner';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import { ChatHandler } from './ChatHandler';

export class AITradeOfferService {
  constructor() {}

  private async getSupabaseClient() {
    const { getSupabaseServerClient } = await import('../supabase/server');
    return getSupabaseServerClient();
  }

  /**
   * Determine if AI should offer a trade to player this turn
   * Frequency: ~every 5 turns if AI has surplus and player has shortages
   */
  shouldOfferTrade(
    aiCountryId: string,
    playerCountryId: string,
    turn: number,
    gameState: GameStateSnapshot
  ): boolean {
    // Only offer trades every ~5 turns to avoid spam
    const turnModulo = turn % 5;
    if (turnModulo !== 0 && turnModulo !== 2) {
      return false;
    }

    // Check if AI country has surplus resources
    const aiStats = gameState.countryStatsByCountryId[aiCountryId];
    if (!aiStats) return false;

    // Check if player country has resource shortages
    const playerStats = gameState.countryStatsByCountryId[playerCountryId];
    if (!playerStats) return false;

    // Simple surplus/shortage detection
    const aiResources = aiStats.resources || {};
    const playerResources = playerStats.resources || {};

    // Check for potential trade opportunities
    let aiHasSurplus = false;
    let playerHasShortage = false;

    // Define critical resource thresholds (these should match game rules)
    const criticalResources = ['food', 'steel', 'coal', 'iron', 'timber'];

    for (const resource of criticalResources) {
      const aiAmount = aiResources[resource] || 0;
      const playerAmount = playerResources[resource] || 0;

      // AI has surplus if they have more than 50 units of a resource
      if (aiAmount > 50) {
        aiHasSurplus = true;
      }

      // Player has shortage if they have less than 20 units of a resource
      if (playerAmount < 20) {
        playerHasShortage = true;
      }
    }

    // Only offer trade if both conditions are met
    return aiHasSurplus && playerHasShortage;
  }

  /**
   * Generate and send trade offer message via diplomacy chat
   */
  async sendTradeOffer(
    gameId: string,
    aiCountryId: string,
    playerCountryId: string,
    proposal: TradeProposal
  ): Promise<void> {
    try {
      // Find or create diplomacy chat between AI and player
      const chatId = await this.findOrCreateDiplomacyChat(gameId, aiCountryId, playerCountryId);

      if (!chatId) {
        console.warn(`[AI Trade Offer] Could not find or create chat between ${aiCountryId} and ${playerCountryId}`);
        return;
      }

      // Generate offer message using existing TradePlanner logic
      const offerMessage = this.generateOfferMessage(proposal);

      // Insert message directly into database
      const supabase = await this.getSupabaseClient();
      const now = new Date().toISOString();

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
        .from("chats")
        .update({
          last_message_at: now,
          updated_at: now
        })
        .eq("id", chatId);

      console.log(`[AI Trade Offer] ${aiCountryId} sent trade offer to ${playerCountryId}`);
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

      // Look for existing diplomacy chat between these countries
      const { data: existingChat, error } = await supabase
        .from('chats')
        .select('id')
        .eq('game_id', gameId)
        .eq('chat_type', 'diplomacy')
        .contains('participant_country_ids', [countryId1, countryId2])
        .single();

      if (existingChat && !error) {
        return existingChat.id;
      }

      // Create new diplomacy chat if none exists
      const { data: newChat, error: createError } = await supabase
        .from('chats')
        .insert({
          game_id: gameId,
          chat_type: 'diplomacy',
          participant_country_ids: [countryId1, countryId2],
          created_at: new Date().toISOString()
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
  private generateOfferMessage(proposal: TradeProposal): string {
    const proposerCommitments = proposal.terms.proposerCommitments;
    const receiverCommitments = proposal.terms.receiverCommitments;

    let message = "Greetings, esteemed leader. ";

    // Describe what we're offering and what we want
    if (proposerCommitments.length > 0 && receiverCommitments.length > 0) {
      const proposerDesc = this.describeCommitments(proposerCommitments, true);
      const receiverDesc = this.describeCommitments(receiverCommitments, false);

      message += `We have surplus ${proposerDesc} and are seeking ${receiverDesc}. `;
      message += `Would you be interested in this trade proposal: ${this.formatCommitments(proposerCommitments)} in exchange for ${this.formatCommitments(receiverCommitments)}?`;

      message += "\n\nYou can accept this offer by using the 'Extract Deal' feature in our chat.";
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