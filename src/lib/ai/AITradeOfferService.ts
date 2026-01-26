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
   * Frequency: ~every 3-5 turns if AI has surplus and player has shortages
   * Includes cooldown to prevent spam
   */
  shouldOfferTrade(
    aiCountryId: string,
    playerCountryId: string,
    turn: number,
    gameId: string,
    gameState: GameStateSnapshot
  ): boolean {
    // Check cooldown: don't offer to same player more than once per 3 turns
    const key = `${gameId}|${aiCountryId}|${playerCountryId}`;
    const lastOfferTurn = lastOfferTurnByKey.get(key);
    if (lastOfferTurn !== undefined && turn - lastOfferTurn < 3) {
      console.log(`[AI Trade Offer] Cooldown active for ${aiCountryId} -> ${playerCountryId} (last offer: turn ${lastOfferTurn}, current: ${turn})`);
      return false;
    }

    // Only offer trades every few turns to avoid spam (but more frequently than before)
    const turnModulo = turn % 3;
    if (turnModulo !== 0 && turnModulo !== 1) {
      console.log(`[AI Trade Offer] Turn ${turn} doesn't match offer schedule (modulo ${turnModulo})`);
      return false;
    }

    // Check if AI country has surplus resources
    const aiStats = gameState.countryStatsByCountryId[aiCountryId];
    if (!aiStats) {
      console.log(`[AI Trade Offer] No stats found for AI country ${aiCountryId}`);
      return false;
    }

    // Check if player country has resource shortages
    const playerStats = gameState.countryStatsByCountryId[playerCountryId];
    if (!playerStats) {
      console.log(`[AI Trade Offer] No stats found for player country ${playerCountryId}`);
      return false;
    }

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

      // AI has surplus if they have more than 40 units of a resource (lowered threshold)
      if (aiAmount > 40) {
        aiHasSurplus = true;
      }

      // Player has shortage if they have less than 30 units of a resource (raised threshold to be more generous)
      if (playerAmount < 30) {
        playerHasShortage = true;
      }
    }

    const shouldOffer = aiHasSurplus && playerHasShortage;
    
    if (!shouldOffer) {
      console.log(`[AI Trade Offer] No trade opportunity: aiHasSurplus=${aiHasSurplus}, playerHasShortage=${playerHasShortage}`);
    } else {
      console.log(`[AI Trade Offer] Trade opportunity found for ${aiCountryId} -> ${playerCountryId}`);
    }

    // Only offer trade if both conditions are met
    return shouldOffer;
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

      console.log(`[AI Trade Offer] ${aiCountryId} sent trade offer to ${playerCountryId} (Deal ID: ${deal.id})`);
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