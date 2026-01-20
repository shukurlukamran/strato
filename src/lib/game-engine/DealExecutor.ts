import { GameState } from "@/lib/game-engine/GameState";

export class DealExecutor {
  processDeals(state: GameState): Array<{ type: string; message: string; data?: Record<string, unknown> }> {
    const events: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
    const activeDeals = state.data.activeDeals.filter((d) => d.status === "active");

    for (const deal of activeDeals) {
      // Placeholder: execute simple trade commitments by adjusting resources/budget in stats.
      // Real implementation will enforce terms over time and validate availability.
      if (deal.dealType === "trade") {
        events.push({
          type: "deal.trade.tick",
          message: `Trade deal active between ${deal.proposingCountryId} and ${deal.receivingCountryId}`,
          data: { dealId: deal.id },
        });
      }

      // Example expiration handling:
      if (deal.turnExpires != null && state.turn >= deal.turnExpires) {
        events.push({
          type: "deal.expired",
          message: `Deal expired: ${deal.id}`,
          data: { dealId: deal.id },
        });
      }
    }

    return events;
  }
}

