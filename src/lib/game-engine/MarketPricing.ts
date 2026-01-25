/**
 * Market Pricing System
 * Calculates dynamic resource prices based on global scarcity.
 * Provides market prices and black market rates for trading.
 */

import { ResourceRegistry } from './ResourceTypes';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// Target stock levels per country (represents "normal" or "abundant" supply)
const TARGET_STOCKS_PER_COUNTRY: Record<string, number> = {
  food: 600,
  timber: 300,
  iron: 150,
  oil: 100,
  gold: 40,
  copper: 200,
  steel: 120,
  coal: 250,
};

// Black market markup/discount rates
const BLACK_MARKET_BUY_MULTIPLIER = 1.8;  // 80% markup for buying
const BLACK_MARKET_SELL_MULTIPLIER = 0.55; // 45% loss for selling

export interface MarketPrices {
  turn: number;
  marketPrices: Record<string, number>;
  blackMarketBuyPrices: Record<string, number>;
  blackMarketSellPrices: Record<string, number>;
}

/**
 * Market Pricing Calculator
 * Provides dynamic pricing based on global resource scarcity
 */
export class MarketPricing {

  /**
   * Compute total resource stocks across all countries for a given game and turn
   */
  static async computeTotalStocks(gameId: string, turn: number): Promise<Record<string, number>> {
    const supabase = getSupabaseServerClient();

    // First get the country IDs for this game
    const { data: countries, error: countryError } = await supabase
      .from('countries')
      .select('id')
      .eq('game_id', gameId);

    if (countryError) {
      console.error('Error fetching countries for market pricing:', countryError);
      return {};
    }

    if (!countries || countries.length === 0) {
      console.error('No countries found for game:', gameId);
      return {};
    }

    const countryIds = countries.map(c => c.id);

    // Get resource stats for countries in this game only
    const { data: countryStats, error } = await supabase
      .from('country_stats')
      .select('resources')
      .eq('turn', turn)
      .in('country_id', countryIds)
      .not('resources', 'is', null);

    if (error) {
      console.error('Error fetching country stats for market pricing:', error);
      // Return empty stocks on error (will result in maximum scarcity prices)
      return {};
    }

    const totalStocks: Record<string, number> = {};

    // Sum resources across countries in this game
    for (const stat of countryStats || []) {
      const resources = stat.resources as Record<string, number> || {};
      for (const [resourceId, amount] of Object.entries(resources)) {
        totalStocks[resourceId] = (totalStocks[resourceId] || 0) + (amount || 0);
      }
    }

    return totalStocks;
  }

  /**
   * Calculate market prices based on scarcity
   * scarcity = clamp(0, 1, 1 - totalStock/targetStock)
   * marketPrice = baseValue * (1 + scarcity * 1.0)  // Scales from 1.0x to 2.0x
   */
  static computeMarketPrices(
    totalStocks: Record<string, number>,
    countryCount: number
  ): Record<string, number> {
    const marketPrices: Record<string, number> = {};

    // Get all tradeable resources
    const resources = ResourceRegistry.getAllResources().filter(r => r.tradeable);

    for (const resource of resources) {
      const resourceId = resource.id;
      const baseValue = resource.baseValue;

      // Get target stock per country, with fallback for new resources
      const targetStockPerCountry = TARGET_STOCKS_PER_COUNTRY[resourceId];
      if (targetStockPerCountry === undefined) {
        // Skip resources without defined targets (new tradeable resources)
        console.warn(`No target stock defined for resource ${resourceId}, skipping market pricing`);
        continue;
      }

      // Calculate target stock for this resource across all countries
      const targetStock = targetStockPerCountry * countryCount;

      // Guard against division by zero
      if (targetStock === 0) {
        console.warn(`Target stock is zero for resource ${resourceId}, using base price`);
        marketPrices[resourceId] = baseValue;
        continue;
      }

      // Calculate current total stock
      const totalStock = totalStocks[resourceId] || 0;

      // Calculate scarcity: 0 = abundant (price = base), 1 = scarce (price = 2x base)
      const scarcity = Math.max(0, Math.min(1, 1 - (totalStock / targetStock)));

      // Apply scarcity multiplier (1.0x to 2.0x range)
      const marketPrice = Math.round(baseValue * (1 + scarcity * 1.0));

      marketPrices[resourceId] = marketPrice;
    }

    return marketPrices;
  }

  /**
   * Calculate black market prices (fixed multipliers on market prices)
   */
  static getBlackMarketPrices(marketPrices: Record<string, number>): {
    blackMarketBuyPrices: Record<string, number>;
    blackMarketSellPrices: Record<string, number>;
  } {
    const blackMarketBuyPrices: Record<string, number> = {};
    const blackMarketSellPrices: Record<string, number> = {};

    for (const [resourceId, marketPrice] of Object.entries(marketPrices)) {
      blackMarketBuyPrices[resourceId] = Math.round(marketPrice * BLACK_MARKET_BUY_MULTIPLIER);
      blackMarketSellPrices[resourceId] = Math.round(marketPrice * BLACK_MARKET_SELL_MULTIPLIER);
    }

    return { blackMarketBuyPrices, blackMarketSellPrices };
  }

  /**
   * Get complete market pricing data for a game and turn
   */
  static async computeMarketPricesForGame(gameId: string, turn: number): Promise<MarketPrices> {
    // Get country count for the game
    const supabase = getSupabaseServerClient();
    const { data: countries, error: countryError } = await supabase
      .from('countries')
      .select('id')
      .eq('game_id', gameId);

    if (countryError) {
      console.error('Error fetching countries for market pricing:', countryError);
      throw new Error('Failed to fetch country count');
    }

    const countryCount = countries?.length || 1; // Default to 1 to avoid division by zero

    // Compute total stocks and market prices
    const totalStocks = await this.computeTotalStocks(gameId, turn);
    const marketPrices = this.computeMarketPrices(totalStocks, countryCount);
    const { blackMarketBuyPrices, blackMarketSellPrices } = this.getBlackMarketPrices(marketPrices);

    return {
      turn,
      marketPrices,
      blackMarketBuyPrices,
      blackMarketSellPrices,
    };
  }

  /**
   * Format prices for display in chat or UI
   */
  static formatPricesForDisplay(marketPrices: MarketPrices): string {
    const lines = ['CURRENT MARKET RATES (Turn ' + marketPrices.turn + '):'];

    const resources = ResourceRegistry.getAllResources().filter(r => r.tradeable);
    for (const resource of resources) {
      const resourceId = resource.id;
      const marketPrice = marketPrices.marketPrices[resourceId] || 0;
      const buyPrice = marketPrices.blackMarketBuyPrices[resourceId] || 0;
      const sellPrice = marketPrices.blackMarketSellPrices[resourceId] || 0;

      lines.push(`- ${resource.name}: Market $${marketPrice}, Black Market Buy $${buyPrice}, Sell $${sellPrice}`);
    }

    return lines.join('\n');
  }
}