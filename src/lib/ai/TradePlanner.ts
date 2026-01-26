/**
 * Trade Planner Module
 * AI system for autonomous trading between countries.
 * Detects resource shortages, finds trade partners, and executes beneficial trades.
 */

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ResourceCost } from '@/lib/game-engine/ResourceCost';
import { TradeValuation, TradeCommitment, FairnessRange } from './TradeValuation';
import type { GameStateSnapshot } from '@/lib/game-engine/GameState';
import type { Country, CountryStats } from '@/types/country';

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
  score: number; // Combined score for selecting the best offer
}

export interface TradeExecutionResult {
  success: boolean;
  dealId?: string;
  error?: string;
}

type CounterpartyType = 'ai' | 'player';

interface FairnessProfile {
  range: FairnessRange;
  target: number;
  spread: number;
}

const TRADE_SETTINGS = {
  minDealNotional: 20,
  budgetReserve: 30,
  maxBudgetSpendRatio: 0.5,
  partnerResourceReserve: 25,
  proposerResourceReserve: 20,
  aiFairnessTolerance: 0.05,
  aiAdvantageCap: 0.15,
  playerMaxLoss: 0.15,
  minBudgetAdjustment: 1,
  playerSpread: 0.18,
  aiSpread: 0.02,
};

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

    // 5. Sort by combined score (fairness + urgency) and return top proposals
    return proposals
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // Top 3 proposals
  }

  /**
   * Detect resource shortages that might block future actions
   * Uses actual ResourceCost requirements instead of hardcoded heuristics
   */
  detectShortages(
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
    country: Country,
    partner: Country,
    shortages: Array<{ resourceId: string; needed: number; available: number }>,
    surpluses: Array<{ resourceId: string; amount: number }>,
    marketPrices: Record<string, number>,
    gameState: GameStateSnapshot
  ): TradeProposal[] {
    const proposals: TradeProposal[] = [];
    const countryStats = gameState.countryStatsByCountryId[country.id];
    const partnerStats = gameState.countryStatsByCountryId[partner.id];

    if (!countryStats || !partnerStats) return proposals;

    const fairnessProfile = this.getFairnessProfile(partner);

    for (const shortage of shortages) {
      const deficit = Math.max(0, shortage.needed - shortage.available);
      if (deficit <= 0) continue;

      const partnerAvailable = Math.max(
        0,
        (partnerStats.resources?.[shortage.resourceId] || 0) - TRADE_SETTINGS.partnerResourceReserve
      );
      if (partnerAvailable <= 0) continue;

      for (const surplus of surpluses) {
        if (surplus.resourceId === shortage.resourceId) continue;

        const barterProposal = this.buildBarterProposal(
          country,
          partner,
          countryStats,
          partnerStats,
          surplus,
          shortage,
          partnerAvailable,
          fairnessProfile,
          marketPrices
        );

        if (barterProposal) {
          proposals.push(barterProposal);
        }
      }

      const buyProposal = this.buildBuyProposal(
        country,
        partner,
        countryStats,
        partnerStats,
        shortage,
        fairnessProfile,
        marketPrices
      );

      if (buyProposal) {
        proposals.push(buyProposal);
      }
    }

    return proposals;
  }

  private buildBarterProposal(
    country: Country,
    partner: Country,
    countryStats: CountryStats,
    partnerStats: CountryStats,
    surplus: { resourceId: string; amount: number },
    shortage: { resourceId: string; needed: number; available: number },
    partnerAvailable: number,
    fairnessProfile: FairnessProfile,
    marketPrices: Record<string, number>
  ): TradeProposal | null {
    const availableGive = Math.max(
      0,
      Math.min(
        surplus.amount,
        (countryStats.resources?.[surplus.resourceId] || 0) - TRADE_SETTINGS.proposerResourceReserve
      )
    );
    if (availableGive <= 0) return null;

    const deficit = Math.max(0, shortage.needed - shortage.available);
    const receiveLimitByGive = TradeValuation.calculateReceiveAmountForGiveAmount(
      shortage.resourceId,
      surplus.resourceId,
      availableGive,
      marketPrices
    );
    if (receiveLimitByGive <= 0) return null;

    const receiveTarget = Math.min(deficit, partnerAvailable, receiveLimitByGive);
    if (receiveTarget <= 0) return null;

    const giveTarget = TradeValuation.calculateRequiredGiveAmount(
      surplus.resourceId,
      shortage.resourceId,
      receiveTarget,
      marketPrices,
      fairnessProfile.spread
    );
    if (giveTarget <= 0 || giveTarget > availableGive) return null;

    const proposerCommitments: TradeCommitment[] = [{
      type: 'resource_transfer',
      resource: surplus.resourceId,
      amount: giveTarget
    }];

    const receiverCommitments: TradeCommitment[] = [{
      type: 'resource_transfer',
      resource: shortage.resourceId,
      amount: receiveTarget
    }];

    return this.buildProposal(
      country,
      partner,
      countryStats,
      proposerCommitments,
      receiverCommitments,
      fairnessProfile,
      marketPrices,
      shortage
    );
  }

  private buildBuyProposal(
    country: Country,
    partner: Country,
    countryStats: CountryStats,
    partnerStats: CountryStats,
    shortage: { resourceId: string; needed: number; available: number },
    fairnessProfile: FairnessProfile,
    marketPrices: Record<string, number>
  ): TradeProposal | null {
    const deficit = Math.max(0, shortage.needed - shortage.available);
    if (deficit <= 0) return null;

    const partnerAvailable = Math.max(
      0,
      (partnerStats.resources?.[shortage.resourceId] || 0) - TRADE_SETTINGS.partnerResourceReserve
    );
    if (partnerAvailable <= 0) return null;

    const unitPrice = TradeValuation.getUnitPrice(shortage.resourceId, marketPrices);
    if (unitPrice <= 0) return null;

    const budgetCap = this.getBudgetSpendCap(countryStats);
    if (budgetCap < unitPrice) return null;

    const maxByBudget = Math.floor(budgetCap / unitPrice);
    if (maxByBudget <= 0) return null;

    const receiveTarget = Math.min(deficit, partnerAvailable, maxByBudget);
    if (receiveTarget <= 0) return null;

    const cost = receiveTarget * unitPrice;
    if (!this.canAffordBudget(countryStats, cost)) return null;

    const proposerCommitments: TradeCommitment[] = [{
      type: 'budget_transfer',
      amount: cost
    }];

    const receiverCommitments: TradeCommitment[] = [{
      type: 'resource_transfer',
      resource: shortage.resourceId,
      amount: receiveTarget
    }];

    return this.buildProposal(
      country,
      partner,
      countryStats,
      proposerCommitments,
      receiverCommitments,
      fairnessProfile,
      marketPrices,
      shortage
    );
  }

  private buildProposal(
    country: Country,
    partner: Country,
    countryStats: CountryStats,
    proposerCommitments: TradeCommitment[],
    receiverCommitments: TradeCommitment[],
    fairnessProfile: FairnessProfile,
    marketPrices: Record<string, number>,
    shortage: { resourceId: string; needed: number; available: number }
  ): TradeProposal | null {
    let evaluation = TradeValuation.evaluateProposal(proposerCommitments, receiverCommitments, marketPrices);

    if (evaluation.normalizedNet < fairnessProfile.range.min) {
      return null;
    }

    if (evaluation.normalizedNet > fairnessProfile.range.max) {
      const adjustment = TradeValuation.calculateBudgetAdjustment(
        evaluation.normalizedNet,
        fairnessProfile.range,
        evaluation.notionalValue
      );
      if (adjustment >= TRADE_SETTINGS.minBudgetAdjustment) {
        const adjustmentAmount = Math.ceil(adjustment);
        const spendCap = this.getBudgetSpendCap(countryStats);
        if (!this.canAffordBudget(countryStats, adjustmentAmount) || adjustmentAmount > spendCap) {
          return null;
        }

        proposerCommitments = proposerCommitments.concat({
          type: 'budget_transfer',
          amount: adjustmentAmount
        });

        evaluation = TradeValuation.evaluateProposal(proposerCommitments, receiverCommitments, marketPrices);
      }
    }

    if (evaluation.normalizedNet < fairnessProfile.range.min || evaluation.normalizedNet > fairnessProfile.range.max) {
      return null;
    }

    if (evaluation.notionalValue < TRADE_SETTINGS.minDealNotional) {
      return null;
    }

    const urgency = this.getShortageUrgency(shortage);
    const confidence = this.calculateConfidence(evaluation.normalizedNet, fairnessProfile, urgency);
    const score = this.calculateScore(evaluation.normalizedNet, urgency, evaluation.notionalValue, confidence);

    return {
      proposerId: country.id,
      receiverId: partner.id,
      terms: {
        proposerCommitments,
        receiverCommitments
      },
      netBenefit: evaluation.netBenefit,
      confidence,
      score
    };
  }

  private getFairnessProfile(partner: Country): FairnessProfile {
    if (partner.isPlayerControlled) {
      return {
        range: {
          min: -TRADE_SETTINGS.playerMaxLoss,
          max: TRADE_SETTINGS.aiAdvantageCap
        },
        target: Math.min(TRADE_SETTINGS.aiAdvantageCap, TRADE_SETTINGS.aiAdvantageCap * 0.6),
        spread: TRADE_SETTINGS.playerSpread
      };
    }

    return {
      range: {
        min: -TRADE_SETTINGS.aiFairnessTolerance,
        max: TRADE_SETTINGS.aiFairnessTolerance
      },
      target: 0,
      spread: TRADE_SETTINGS.aiSpread
    };
  }

  private getBudgetSpendCap(stats: CountryStats): number {
    const available = Math.max(0, stats.budget - TRADE_SETTINGS.budgetReserve);
    return available * TRADE_SETTINGS.maxBudgetSpendRatio;
  }

  private canAffordBudget(stats: CountryStats, amount: number): boolean {
    if (amount <= 0) return false;
    return stats.budget - amount >= TRADE_SETTINGS.budgetReserve;
  }

  private getShortageUrgency(shortage?: { needed: number; available: number }): number {
    if (!shortage) return 0.5;
    const gap = Math.max(0, shortage.needed - shortage.available);
    if (!shortage.needed) return 0.5;
    return Math.min(1, gap / shortage.needed);
  }

  private calculateConfidence(
    normalizedNet: number,
    fairnessProfile: FairnessProfile,
    urgency: number
  ): number {
    const width = Math.max(0.01, fairnessProfile.range.max - fairnessProfile.range.min);
    const distance = Math.abs(normalizedNet - fairnessProfile.target);
    const fairnessCloseness = Math.max(0, 1 - distance / width);
    return Math.max(0, Math.min(1, 0.35 * urgency + 0.65 * fairnessCloseness));
  }

  private calculateScore(
    normalizedNet: number,
    urgency: number,
    notionalValue: number,
    confidence: number
  ): number {
    const valueBoost = Math.min(1, notionalValue / 200);
    return normalizedNet + urgency + confidence + valueBoost;
  }

  /**
   * Execute a trade (create deal, transfer resources)
   * 
   * IMPORTANT: This modifies the GameState in-memory. The GameState will be persisted
   * at the end of turn processing. This ensures atomic transactions and prevents
   * race conditions with database updates during turn processing.
   */
  async executeTrade(
    gameId: string,
    turn: number,
    proposal: TradeProposal,
    gameState: GameStateSnapshot
  ): Promise<TradeExecutionResult> {
    try {
      const supabase = getSupabaseServerClient();

      // Get current stats from GameState (not database)
      const proposerStats = gameState.countryStatsByCountryId[proposal.proposerId];
      const receiverStats = gameState.countryStatsByCountryId[proposal.receiverId];

      if (!proposerStats || !receiverStats) {
        console.error('[TradePlanner] Missing country stats in GameState');
        return { success: false, error: 'Missing country stats' };
      }

      // Validate and calculate deltas for proposer's commitments
      const proposerDeltas = this.calculateAndValidateDeltas(
        proposal.terms.proposerCommitments,
        proposerStats,
        'proposer'
      );

      if (!proposerDeltas.success) {
        console.error('[TradePlanner] Proposer validation failed:', proposerDeltas.errors);
        return { success: false, error: proposerDeltas.errors.join(', ') };
      }

      // Validate and calculate deltas for receiver's commitments
      const receiverDeltas = this.calculateAndValidateDeltas(
        proposal.terms.receiverCommitments,
        receiverStats,
        'receiver'
      );

      if (!receiverDeltas.success) {
        console.error('[TradePlanner] Receiver validation failed:', receiverDeltas.errors);
        return { success: false, error: receiverDeltas.errors.join(', ') };
      }

      // Apply deltas to GameState (in-memory)
      // Proposer gives resources, receives resources from receiver
      const updatedProposerStats = { ...proposerStats };
      const updatedReceiverStats = { ...receiverStats };

      // Apply proposer's commitments (subtract from proposer)
      for (const commitment of proposal.terms.proposerCommitments) {
        if (commitment.type === 'resource_transfer' && commitment.resource) {
          updatedProposerStats.resources[commitment.resource] = 
            (updatedProposerStats.resources[commitment.resource] || 0) - commitment.amount;
          updatedReceiverStats.resources[commitment.resource] = 
            (updatedReceiverStats.resources[commitment.resource] || 0) + commitment.amount;
        } else if (commitment.type === 'budget_transfer') {
          updatedProposerStats.budget -= commitment.amount;
          updatedReceiverStats.budget += commitment.amount;
        }
      }

      // Apply receiver's commitments (subtract from receiver)
      for (const commitment of proposal.terms.receiverCommitments) {
        if (commitment.type === 'resource_transfer' && commitment.resource) {
          updatedReceiverStats.resources[commitment.resource] = 
            (updatedReceiverStats.resources[commitment.resource] || 0) - commitment.amount;
          updatedProposerStats.resources[commitment.resource] = 
            (updatedProposerStats.resources[commitment.resource] || 0) + commitment.amount;
        } else if (commitment.type === 'budget_transfer') {
          updatedReceiverStats.budget -= commitment.amount;
          updatedProposerStats.budget += commitment.amount;
        }
      }

      // Update GameState with new stats (will be persisted at end of turn)
      gameState.countryStatsByCountryId[proposal.proposerId] = updatedProposerStats;
      gameState.countryStatsByCountryId[proposal.receiverId] = updatedReceiverStats;

      // Create deal record in database
      const dealData = {
        game_id: gameId,
        proposing_country_id: proposal.proposerId,
        receiving_country_id: proposal.receiverId,
        deal_type: 'trade',
        deal_terms: {
          proposerCommitments: proposal.terms.proposerCommitments,
          receiverCommitments: proposal.terms.receiverCommitments
        },
        status: 'active', // Mark as active since it's immediately executed
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
        // Revert GameState changes
        gameState.countryStatsByCountryId[proposal.proposerId] = proposerStats;
        gameState.countryStatsByCountryId[proposal.receiverId] = receiverStats;
        return { success: false, error: 'Failed to create deal record' };
      }

      // Get country names for logging
      const proposerCountry = gameState.countries.find(c => c.id === proposal.proposerId);
      const receiverCountry = gameState.countries.find(c => c.id === proposal.receiverId);
      console.log(`[TradePlanner] Trade executed successfully: ${proposerCountry?.name || 'Unknown'} (${proposal.proposerId}) ↔ ${receiverCountry?.name || 'Unknown'} (${proposal.receiverId}), deal: ${deal.id}`);
      return { success: true, dealId: deal.id };

    } catch (error) {
      console.error('[TradePlanner] Error executing trade:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Validate commitments and calculate deltas
   * Returns success status and any validation errors
   */
  private calculateAndValidateDeltas(
    commitments: Array<{ type: string; resource?: string; amount: number }>,
    stats: any,
    role: string
  ): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const commitment of commitments) {
      if (commitment.type === 'resource_transfer') {
        if (!commitment.resource) {
          errors.push(`${role}: Missing resource in commitment`);
          continue;
        }
        const available = stats.resources[commitment.resource] || 0;
        if (available < commitment.amount) {
          errors.push(
            `${role}: Insufficient ${commitment.resource} (has ${available}, needs ${commitment.amount})`
          );
        }
      } else if (commitment.type === 'budget_transfer') {
        if (stats.budget < commitment.amount) {
          errors.push(
            `${role}: Insufficient budget (has ${stats.budget}, needs ${commitment.amount})`
          );
        }
      }
    }

    return { success: errors.length === 0, errors };
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

  /**
   * Buy resources from black market as fallback
   * Called when no trade partners available or trades fail
   */
  async buyFromBlackMarket(
    gameId: string,
    countryId: string,
    shortages: Array<{ resourceId: string; needed: number; available: number }>,
    stats: any,
    marketPrices: Record<string, number>
  ): Promise<Array<{ resourceId: string; amount: number; cost: number }>> {
    const purchases: Array<{ resourceId: string; amount: number; cost: number }> = [];
    const supabase = await this.getSupabaseClient();

    let remainingBudget = stats.budget || 0;

    // Sort shortages by priority (most critical first)
    const sortedShortages = shortages.sort((a, b) =>
      (b.needed - b.available) - (a.needed - a.available)
    );

    for (const shortage of sortedShortages) {
      // Use properly rounded black market price (matching MarketPricing.ts)
      const blackMarketBuyPrice = Math.round(marketPrices[shortage.resourceId] * 1.8);
      const amountNeeded = Math.max(0, shortage.needed - shortage.available);
      const cost = amountNeeded * blackMarketBuyPrice;

      // Only buy if we can afford it and have enough budget buffer (keep 20% reserve)
      if (cost > 0 && cost <= remainingBudget * 0.8) {
        // Update country resources and budget in memory (will be persisted by turn route)
        const newResourceAmount = (stats.resources[shortage.resourceId] || 0) + amountNeeded;
        stats.resources[shortage.resourceId] = newResourceAmount;
        stats.budget = remainingBudget - cost;

        purchases.push({
          resourceId: shortage.resourceId,
          amount: amountNeeded,
          cost
        });

        remainingBudget = stats.budget;
      }
    }

    return purchases;
  }

  private async getSupabaseClient() {
    const { getSupabaseServerClient } = await import('../supabase/server');
    return getSupabaseServerClient();
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