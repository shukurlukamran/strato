import { GameState } from "@/lib/game-engine/GameState";
import { CityTransferHelper } from "./CityTransferHelper";
import type { DealCommitment } from "@/types/deals";

export class DealExecutor {
  processDeals(state: GameState): Array<{ type: string; message: string; data?: Record<string, unknown> }> {
    const events: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
    const activeDeals = state.data.activeDeals.filter((d) => d.status === "active");

    for (const deal of activeDeals) {
      // Handle city transfers in deals
      this.processCityTransfers(deal, state, events);

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

  /**
   * Process city transfers in deals
   */
  private processCityTransfers(
    deal: any,
    state: GameState,
    events: Array<{ type: string; message: string; data?: Record<string, unknown> }>
  ): void {
    if (!state.data.cities) return;

    const allCommitments: DealCommitment[] = [
      ...(deal.dealTerms?.proposerCommitments || []),
      ...(deal.dealTerms?.receiverCommitments || []),
    ];

    for (const commitment of allCommitments) {
      if (commitment.type === "city_transfer" && commitment.cityId) {
        const city = state.getCity(commitment.cityId);
        if (!city) continue;

        // Determine source and destination countries
        const isProposerCommitment = (deal.dealTerms?.proposerCommitments || []).includes(commitment);
        const sourceCountryId = isProposerCommitment ? deal.proposingCountryId : deal.receivingCountryId;
        const destCountryId = isProposerCommitment ? deal.receivingCountryId : deal.proposingCountryId;

        // Verify city belongs to source country
        if (city.countryId !== sourceCountryId) {
          console.warn(`City ${commitment.cityId} does not belong to source country ${sourceCountryId}`);
          continue;
        }

        // Get country stats
        const sourceStats = state.data.countryStatsByCountryId[sourceCountryId];
        const destStats = state.data.countryStatsByCountryId[destCountryId];

        if (!sourceStats || !destStats) {
          console.warn(`Missing stats for city transfer: source=${sourceCountryId}, dest=${destCountryId}`);
          continue;
        }

        // Transfer city and redistribute resources/population
        const { fromStats, toStats } = CityTransferHelper.transferCity(
          city,
          sourceCountryId,
          destCountryId,
          sourceStats,
          destStats
        );

        // Update stats
        state.withUpdatedStats(sourceCountryId, fromStats);
        state.withUpdatedStats(destCountryId, toStats);

        // Update city ownership
        const updatedCities = state.data.cities!.map(c =>
          c.id === city.id ? { ...c, countryId: destCountryId } : c
        );
        state.setCities(updatedCities);

        // Log event
        const sourceCountry = state.data.countries.find(c => c.id === sourceCountryId);
        const destCountry = state.data.countries.find(c => c.id === destCountryId);
        events.push({
          type: "deal.city_transfer",
          message: `${sourceCountry?.name || sourceCountryId} transferred ${city.name} to ${destCountry?.name || destCountryId}`,
          data: {
            dealId: deal.id,
            cityId: city.id,
            cityName: city.name,
            sourceCountryId,
            destCountryId,
          },
        });
      }
    }
  }
}

