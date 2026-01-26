/**
 * Trade valuation helper
 * Centralizes market pricing lookups, value comparisons, and budget balancing helpers.
 */

import { ResourceRegistry } from '@/lib/game-engine/ResourceTypes';

export type TradeCommitment = {
  type: 'resource_transfer' | 'budget_transfer';
  resource?: string;
  amount: number;
};

export interface TradeEvaluation {
  proposerValueGiven: number;
  proposerValueReceived: number;
  netBenefit: number;
  notionalValue: number;
  normalizedNet: number;
}

export interface FairnessRange {
  min: number;
  max: number;
}

export class TradeValuation {
  /**
   * Lookup the best known unit price (market price or fallback to ResourceRegistry)
   */
  static getUnitPrice(resourceId: string, marketPrices: Record<string, number>): number {
    const marketPrice = marketPrices[resourceId];
    if (typeof marketPrice === 'number' && marketPrice > 0) {
      return marketPrice;
    }

    const definition = ResourceRegistry.getResource(resourceId);
    return definition?.baseValue || 0;
  }

  /**
   * Compute the value of a single commitment
   */
  static commitmentValue(commitment: TradeCommitment, marketPrices: Record<string, number>): number {
    if (commitment.type === 'budget_transfer') {
      return commitment.amount;
    }
    if (!commitment.resource) return 0;

    const unitPrice = this.getUnitPrice(commitment.resource, marketPrices);
    return unitPrice * commitment.amount;
  }

  /**
   * Compute total market value for a set of commitments
   */
  static marketValue(commitments: TradeCommitment[], marketPrices: Record<string, number>): number {
    return commitments.reduce((sum, commitment) => sum + this.commitmentValue(commitment, marketPrices), 0);
  }

  /**
   * Evaluate the net benefit and normalized difference for a trade
   */
  static evaluateProposal(
    proposerCommitments: TradeCommitment[],
    receiverCommitments: TradeCommitment[],
    marketPrices: Record<string, number>
  ): TradeEvaluation {
    const proposerValueGiven = this.marketValue(proposerCommitments, marketPrices);
    const proposerValueReceived = this.marketValue(receiverCommitments, marketPrices);
    const netBenefit = proposerValueReceived - proposerValueGiven;
    const notionalValue = Math.max(1, Math.max(proposerValueGiven, proposerValueReceived));
    const normalizedNet = netBenefit / notionalValue;

    return {
      proposerValueGiven,
      proposerValueReceived,
      netBenefit,
      notionalValue,
      normalizedNet,
    };
  }

  /**
   * Calculate how much of the giving resource is needed to receive the target amount
   */
  static calculateRequiredGiveAmount(
    giveResource: string,
    receiveResource: string,
    receiveAmount: number,
    marketPrices: Record<string, number>,
    spread = 0
  ): number {
    const givePrice = this.getUnitPrice(giveResource, marketPrices);
    const receivePrice = this.getUnitPrice(receiveResource, marketPrices);
    if (givePrice <= 0 || receivePrice <= 0 || receiveAmount <= 0) return 0;

    const ratio = receivePrice / givePrice;
    const safeSpread = Math.min(Math.max(spread, 0), 0.9);
    const adjustedRatio = ratio * Math.max(0, 1 - safeSpread);
    const raw = receiveAmount * adjustedRatio;
    return Math.max(1, Math.ceil(raw));
  }

  /**
   * Calculate how much of the receiving resource can be covered with the provided giving amount
   */
  static calculateReceiveAmountForGiveAmount(
    receiveResource: string,
    giveResource: string,
    giveAmount: number,
    marketPrices: Record<string, number>
  ): number {
    const givePrice = this.getUnitPrice(giveResource, marketPrices);
    const receivePrice = this.getUnitPrice(receiveResource, marketPrices);
    if (givePrice <= 0 || receivePrice <= 0 || giveAmount <= 0) return 0;

    const raw = (givePrice * giveAmount) / receivePrice;
    return Math.max(0, Math.floor(raw));
  }

  /**
   * Determine how much budget is required to bring a trade back within the allowed fairness range
   */
  static calculateBudgetAdjustment(
    normalizedNet: number,
    fairnessRange: FairnessRange,
    notionalValue: number
  ): number {
    if (normalizedNet <= fairnessRange.max) return 0;
    const excessRatio = normalizedNet - fairnessRange.max;
    return Math.max(0, excessRatio * notionalValue);
  }
}
