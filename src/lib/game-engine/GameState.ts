import type { Country, CountryStats, City } from "@/types/country";
import type { Deal } from "@/types/deals";
import type { GameAction } from "@/types/actions";

export interface GameStateSnapshot {
  gameId: string;
  turn: number;
  countries: Country[];
  countryStatsByCountryId: Record<string, CountryStats>;
  cities?: City[];
  pendingActions: GameAction[];
  activeDeals: Deal[];
}

/**
 * In-memory representation of a game turn.
 * Source of truth for persistence is the database; this is an engine snapshot.
 */
export class GameState {
  private snapshot: GameStateSnapshot;

  constructor(initial: GameStateSnapshot) {
    this.snapshot = initial;
  }

  get turn() {
    return this.snapshot.turn;
  }

  get data(): GameStateSnapshot {
    return this.snapshot;
  }

  withUpdatedStats(countryId: string, stats: CountryStats): void {
    this.snapshot.countryStatsByCountryId[countryId] = stats;
  }

  setPendingActions(actions: GameAction[]): void {
    this.snapshot.pendingActions = actions;
  }

  setActiveDeals(deals: Deal[]): void {
    this.snapshot.activeDeals = deals;
  }

  setCities(cities: City[]): void {
    this.snapshot.cities = cities;
  }

  getCity(cityId: string): City | undefined {
    return this.snapshot.cities?.find(city => city.id === cityId);
  }

  getCitiesByCountry(countryId: string): City[] {
    return this.snapshot.cities?.filter(city => city.countryId === countryId) || [];
  }
}

