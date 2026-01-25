/**
 * Trade Planner Module
 * AI system for autonomous trading between countries.
 * Detects resource shortages, finds trade partners, and executes beneficial trades.
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ResourceCost } from '@/lib/game-engine/ResourceCost';
import { executeDealTerms } from '@/lib/deals/DealExecutorHelper';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';

export interface TradeProposal {
  proposerId: string;
  receiverId: string;
  terms: {
    proposerCommitments: Array<{
      type: 'resource_transfer' | 'budget_transfer';
      resource?: string;
      amount: number;
    }>;
    receiverCommitments: Array<{
      type: 'resource_transfer' | 'budget_transfer';
      resource?: string;
      amount: number;
    }>;
  };
  netBenefit: number; // Net profit margin for proposer (positive = we get more value than we give)
  confidence: number; // 0-1, how good this trade is
}

export interface TradeExecutionResult {
  success: boolean;
  dealId?: string;
  error?: string;
}

/**
 * AI Trade Planner
 * Handles autonomous trading decisions for AI countries
 */
export class TradePlanner {

  /**
   * Analyze country needs and find trading opportunities
   */
  async planTrades(
    countryId: string,
    gameState: GameStateSnapshot,
    marketPrices: Record<string, number>
  ): Promise<TradeProposal[]> {
    const proposals: TradeProposal[] = [];
    const country = gameState.countries.find(c => c.id === countryId);

    if (!country) {
      console.error(`[TradePlanner] Country ${countryId} not found in game state`);
      return proposals;
    }

    // 1. Detect resource shortages that block planned actions
    const shortages = await this.detectShortages(country, gameState);

    // 2. Find surplus resources we can trade
    const surpluses = this.detectSurpluses(country, gameState);

    if (shortages.length === 0 || surpluses.length === 0) {
      return proposals; // No trading opportunity
    }

    // 3. Find potential trade partners
    const partners = this.findTradePartners(country, gameState, shortages, surpluses);

    // 4. Generate trade proposals
    for (const partner of partners) {
      const partnerProposals = this.generateTradeProposals(
        country,
        partner,
        shortages,
        surpluses,
        marketPrices,
        gameState
      );
      proposals.push(...partnerProposals);
    }

    // 5. Sort by expected value and return top proposals
    return proposals
      .sort((a, b) => b.netBenefit - a.netBenefit)
      .slice(0, 3); // Top 3 proposals
  }

  /**
   * Detect resource shortages that might block future actions
   * Uses actual ResourceCost requirements instead of hardcoded heuristics
   */
  private detectShortages(
    country: any,
    gameState: GameStateSnapshot
  ): Array<{ resourceId: string; needed: number; available: number }> {
    const shortages: Array<{ resourceId: string; needed: number; available: number }> = [];

    // Get country stats from the game state
    const countryStats = gameState.countryStatsByCountryId[country.id];
    if (!countryStats) return shortages;

    // Compute actual resource requirements for common next actions
    // These are based on what the country is likely to do next
    
    // 1. Check research resource requirements
    const researchResources = ResourceCost.calculateResearchResourceCost(countryStats);
    
    // 2. Check infrastructure resource requirements
    const infraResources = ResourceCost.calculateInfrastructureResourceCost(countryStats);
    
    // 3. Check military recruitment resource requirements (estimate ~20 units)
    const militaryResources = ResourceCost.calculateMilitaryResourceCost(20, countryStats);

    // Aggregate all possible resource requirements
    const allRequirements: Record<string, number> = {};
    
    for (const req of [...researchResources, ...infraResources, ...militaryResources]) {
      allRequirements[req.resourceId] = Math.max(
        allRequirements[req.resourceId] || 0,
        req.amount
      );
    }

    // Check for shortages against actual requirements
    for (const [resourceId, requiredAmount] of Object.entries(allRequirements)) {
      const available = countryStats.resources?.[resourceId] || 0;
      if (available < requiredAmount) {
        shortages.push({
          resourceId,
          needed: requiredAmount,
          available
        });
      }
    }

    return shortages;
  }

  /**
   * Detect surplus resources that can be traded
   */
  private detectSurpluses(
    country: any,
    gameState: GameStateSnapshot
  ): Array<{ resourceId: string; amount: number }> {
    const surpluses: Array<{ resourceId: string; amount: number }> = [];
    const consumptionRate = 100; // Estimated consumption per turn

    // Get country stats from the game state
    const countryStats = gameState.countryStatsByCountryId[country.id];
    if (!countryStats) return surpluses;

    for (const [resourceId, amount] of Object.entries(countryStats.resources || {})) {
      const numAmount = amount as number;
      // Consider surplus if we have 2x typical consumption
      if (numAmount >= consumptionRate * 2) {
        surpluses.push({ resourceId, amount: Math.floor(numAmount / 2) }); // Trade half our surplus
      }
    }

    return surpluses;
  }

  /**
   * Find potential trade partners
   */
  private findTradePartners(
    country: any,
    gameState: GameStateSnapshot,
    shortages: Array<{ resourceId: string; needed: number }>,
    surpluses: Array<{ resourceId: string }>
  ): any[] {
    const partners: any[] = [];

    for (const otherCountry of gameState.countries) {
      if (otherCountry.id === country.id) continue;

      // Get other country's stats
      const otherStats = gameState.countryStatsByCountryId[otherCountry.id];
      if (!otherStats) continue;

      // Check if they have what we need
      const theyHaveWhatWeNeed = shortages.some(shortage =>
        (otherStats.resources?.[shortage.resourceId] || 0) >= shortage.needed
      );

      // Check if we have what they might need (compare to our surpluses)
      const weHaveWhatTheyNeed = surpluses.some(surplus =>
        (otherStats.resources?.[surplus.resourceId] || 0) < 50 // They have low stock
      );

      if (theyHaveWhatWeNeed || weHaveWhatTheyNeed) {
        partners.push(otherCountry);
      }
    }

    return partners;
  }

  /**
   * Generate mutually beneficial trade proposals
   */
  private generateTradeProposals(
    country: any,
    partner: any,
    shortages: Array<{ resourceId: string; needed: number }>,
    surpluses: Array<{ resourceId: string; amount: number }>,
    marketPrices: Record<string, number>,
    gameState: GameStateSnapshot
  ): TradeProposal[] {
    const proposals: TradeProposal[] = [];

    // Get stats for both countries
    const countryStats = gameState.countryStatsByCountryId[country.id];
    const partnerStats = gameState.countryStatsByCountryId[partner.id];
    if (!countryStats || !partnerStats) return [];

    // Try to match shortages with partner's surpluses
    for (const shortage of shortages) {
      const partnerHasResource = (partnerStats.resources[shortage.resourceId] || 0) >= shortage.needed;

      if (!partnerHasResource) continue;

      // Find what we can offer in return
      for (const surplus of surpluses) {
        const weHaveResource = (countryStats.resources[surplus.resourceId] || 0) >= surplus.amount;

        if (!weHaveResource) continue;

        // Calculate fair trade amounts near market price
        const giveAmount = Math.min(surplus.amount, shortage.needed);
        const receiveAmount = Math.min(shortage.needed, partnerStats.resources[shortage.resourceId] || 0);

        const giveValue = giveAmount * marketPrices[surplus.resourceId];
        const receiveValue = receiveAmount * marketPrices[shortage.resourceId];

        // Only propose trades where we get fair or better value
        // Allow trades where receive value is at least 90% of give value (slight loss OK for AI)
        const minReceiveValue = giveValue * 0.9;

        if (receiveValue >= minReceiveValue) {
          proposals.push({
            proposerId: country.id,
            receiverId: partner.id,
            terms: {
              proposerCommitments: [{
                type: 'resource_transfer',
                resource: surplus.resourceId,
                amount: giveAmount
              }],
              receiverCommitments: [{
                type: 'resource_transfer',
                resource: shortage.resourceId,
                amount: receiveAmount
              }]
            },
            netBenefit: receiveValue - giveValue, // Positive = we get more value than we give (profit margin)
            confidence: 0.8 // Good confidence for direct shortage resolution
          });
        }
      }
    }

    return proposals;
  }

  /**
   * Execute a trade (create deal, transfer resources)
   */
  async executeTrade(
    gameId: string,
    turn: number,
    proposal: TradeProposal
  ): Promise<TradeExecutionResult> {
    try {
      const supabase = getSupabaseServerClient();

      // Create deal record using correct schema
      const dealData = {
        game_id: gameId,
        proposing_country_id: proposal.proposerId,
        receiving_country_id: proposal.receiverId,
        deal_type: 'trade',
        deal_terms: {
          proposerCommitments: proposal.terms.proposerCommitments,
          receiverCommitments: proposal.terms.receiverCommitments
        },
        status: 'accepted', // AI trades are automatically accepted
        proposed_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        turn_created: turn,
        turn_expires: turn + 1, // Trades expire after 1 turn
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .insert(dealData)
        .select()
        .single();

      if (dealError) {
        console.error('[TradePlanner] Failed to create deal:', dealError);
        return { success: false, error: 'Failed to create deal record' };
      }

      // Execute the resource transfers using the standard deal execution function
      const executionResult = await executeDealTerms(
        gameId,
        turn,
        proposal.proposerId,
        proposal.receiverId,
        {
          proposerCommitments: proposal.terms.proposerCommitments,
          receiverCommitments: proposal.terms.receiverCommitments
        },
        'trade'
      );

      if (!executionResult.success) {
        console.error('[TradePlanner] Failed to execute transfers:', executionResult.errors);
        return { success: false, error: executionResult.errors.join(', ') };
      }

      // Update deal status to active
      await supabase
        .from('deals')
        .update({ status: 'active' })
        .eq('id', deal.id);

      return { success: true, dealId: deal.id };

    } catch (error) {
      console.error('[TradePlanner] Error executing trade:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Generate offer message to player
   */
  generateOfferMessage(proposal: TradeProposal): string {
    const proposerCommitments = proposal.terms.proposerCommitments;
    const receiverCommitments = proposal.terms.receiverCommitments;

    let message = "Greetings. ";

    // Describe what we're offering and what we want
    if (proposerCommitments.length > 0 && receiverCommitments.length > 0) {
      const proposerDesc = this.describeCommitments(proposerCommitments, true);
      const receiverDesc = this.describeCommitments(receiverCommitments, false);

      message += `We have surplus ${proposerDesc} and need ${receiverDesc}. `;
      message += `Would you be interested in trading ${this.formatCommitments(proposerCommitments)} for ${this.formatCommitments(receiverCommitments)}?`;
    }

    return message;
  }



  /**
   * Helper methods for message generation
   */
  private describeCommitments(commitments: any[], isGiving: boolean): string {
    return commitments
      .map(c => {
        if (c.type === 'resource_transfer') {
          return `${c.amount}x ${c.resource}`;
        } else if (c.type === 'budget_transfer') {
          return `${c.amount} credits`;
        }
        return 'resources';
      })
      .join(' and ');
  }

  private formatCommitments(commitments: any[]): string {
    return commitments
      .map(c => {
        if (c.type === 'resource_transfer') {
          return `${c.amount}x ${c.resource}`;
        } else if (c.type === 'budget_transfer') {
          return `$${c.amount}`;
        }
        return 'items';
      })
      .join(' and ');
  }
}