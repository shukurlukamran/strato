"use client";

import { useEffect, useState } from "react";
import type { MarketPrices } from "@/lib/game-engine/MarketPricing";

interface MarketRatesModalProps {
  gameId: string;
  turn: number;
  onClose: () => void;
}

export function MarketRatesModal({ gameId, turn, onClose }: MarketRatesModalProps) {
  const [marketPrices, setMarketPrices] = useState<MarketPrices | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketPrices = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/market/prices?gameId=${encodeURIComponent(gameId)}`);
        if (!res.ok) {
          throw new Error('Failed to fetch market prices');
        }
        const data = await res.json();
        setMarketPrices(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load market prices');
      } finally {
        setLoading(false);
      }
    };

    fetchMarketPrices();
  }, [gameId]);

  const getPriceColor = (price: number, basePrice: number): string => {
    const ratio = price / basePrice;
    if (ratio > 1.5) return "text-red-400"; // Very expensive
    if (ratio > 1.2) return "text-orange-400"; // Expensive
    if (ratio < 0.8) return "text-green-400"; // Cheap
    return "text-gray-300"; // Normal
  };

  const getPriceBgColor = (price: number, basePrice: number): string => {
    const ratio = price / basePrice;
    if (ratio > 1.5) return "bg-red-900/20"; // Very expensive
    if (ratio > 1.2) return "bg-orange-900/20"; // Expensive
    if (ratio < 0.8) return "bg-green-900/20"; // Cheap
    return "bg-gray-800/20"; // Normal
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs text-white/60">Market Information</div>
            <div className="text-lg font-bold text-white">Market Rates - Turn {turn}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-white">Loading market prices...</span>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-red-300">
              <div className="font-semibold">Error loading market prices</div>
              <div className="mt-1 text-sm">{error}</div>
            </div>
          ) : marketPrices ? (
            <>
              <div className="mb-4 text-sm text-white/70">
                Prices adjust dynamically based on global resource scarcity. Lower stock = higher prices.
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-white">Resource</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-white">Market Price</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-white">Black Market Buy</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-white">Black Market Sell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(marketPrices.marketPrices).map(([resourceId, marketPrice]) => {
                      const blackMarketBuyPrice = marketPrices.blackMarketBuyPrices[resourceId];
                      const blackMarketSellPrice = marketPrices.blackMarketSellPrices[resourceId];

                      // Get base price from ResourceTypes for color comparison
                      const basePrice = getBasePrice(resourceId);

                      return (
                        <tr key={resourceId} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 text-sm font-medium text-white capitalize">
                            {getResourceDisplayName(resourceId)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-mono ${getPriceColor(marketPrice, basePrice)}`}>
                            ${marketPrice.toFixed(1)}
                          </td>

                          {/* Black Market Prices - NO color coding (always white) */}
                          <td className="px-4 py-3 text-sm text-right font-mono text-white">
                            ${blackMarketBuyPrice.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-white">
                            ${blackMarketSellPrice.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 rounded-lg border border-blue-500/30 bg-blue-900/20 p-4">
                <div className="text-sm font-semibold text-blue-300 mb-2">💡 Market Dynamics</div>
                <div className="text-xs text-blue-200 space-y-1">
                  <div>• <span className="text-green-400">Green prices</span> indicate abundance (good for buyers)</div>
                  <div>• <span className="text-orange-400">Orange prices</span> indicate scarcity (moderate)</div>
                  <div>• <span className="text-red-400">Red prices</span> indicate severe scarcity (expensive)</div>
                  <div>• Black market offers immediate access at premium prices</div>
                  <div>• Trading between countries can normalize prices</div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Helper functions
function getBasePrice(resourceId: string): number {
  const basePrices: Record<string, number> = {
    food: 2,
    timber: 3,
    iron: 10,
    oil: 15,
    gold: 20,
    copper: 5,
    steel: 12,
    coal: 6,
  };
  return basePrices[resourceId] || 1;
}

function getResourceDisplayName(resourceId: string): string {
  const names: Record<string, string> = {
    food: 'Food',
    timber: 'Timber',
    iron: 'Iron',
    oil: 'Oil',
    gold: 'Gold',
    copper: 'Copper',
    steel: 'Steel',
    coal: 'Coal',
  };
  return names[resourceId] || resourceId;
}