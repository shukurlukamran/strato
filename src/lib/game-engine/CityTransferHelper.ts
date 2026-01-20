import type { City, CountryStats } from "@/types/country";

/**
 * Helper for transferring cities between countries
 * Handles resource and population redistribution
 */
export class CityTransferHelper {
  /**
   * Transfer a city from one country to another
   * Redistributes resources and population between the countries
   */
  static transferCity(
    city: City,
    fromCountryId: string,
    toCountryId: string,
    fromStats: CountryStats,
    toStats: CountryStats
  ): { fromStats: CountryStats; toStats: CountryStats } {
    // Update city ownership
    const updatedCity = { ...city, countryId: toCountryId };

    // Transfer resources from source to destination
    const updatedFromResources = { ...fromStats.resources };
    const updatedToResources = { ...toStats.resources };

    for (const [resource, amount] of Object.entries(city.resourcesPerTurn)) {
      // Remove from source country
      updatedFromResources[resource] = Math.max(0, (updatedFromResources[resource] || 0) - amount);
      
      // Add to destination country
      updatedToResources[resource] = (updatedToResources[resource] || 0) + amount;
    }

    // Transfer population
    const updatedFromPopulation = Math.max(0, fromStats.population - city.population);
    const updatedToPopulation = toStats.population + city.population;

    return {
      fromStats: {
        ...fromStats,
        resources: updatedFromResources,
        population: updatedFromPopulation,
      },
      toStats: {
        ...toStats,
        resources: updatedToResources,
        population: updatedToPopulation,
      },
    };
  }

  /**
   * Verify that city resources/population match country totals
   */
  static verifyCityTotals(cities: City[], countryStats: CountryStats): boolean {
    const cityResourceTotals = cities.reduce((totals, city) => {
      for (const [key, amount] of Object.entries(city.resourcesPerTurn)) {
        totals[key] = (totals[key] || 0) + amount;
      }
      return totals;
    }, {} as Record<string, number>);

    const cityPopulationTotal = cities.reduce((sum, city) => sum + city.population, 0);

    // Check resources match
    for (const [key, countryAmount] of Object.entries(countryStats.resources)) {
      const cityAmount = cityResourceTotals[key] || 0;
      if (Math.abs(countryAmount - cityAmount) > 0.01) {
        console.warn(`Resource mismatch for ${key}: country=${countryAmount}, cities=${cityAmount}`);
        return false;
      }
    }

    // Check population matches
    if (Math.abs(countryStats.population - cityPopulationTotal) > 0.01) {
      console.warn(`Population mismatch: country=${countryStats.population}, cities=${cityPopulationTotal}`);
      return false;
    }

    return true;
  }
}