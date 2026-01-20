import type { Country, City, CountryStats } from "@/types/country";

/**
 * City Generation System
 * Creates cities for countries with distributed resources and population
 */
export class CityGenerator {
  private static readonly CITY_NAMES = [
    "Capital City", "Port Harbor", "Mountain Pass", "River Crossing", "Coastal Bay",
    "Industrial District", "Agricultural Plains", "Mining Town", "Trade Hub", "Fortress",
    "University City", "Commercial Center", "Resource Outpost", "Strategic Point", "Border Town"
  ];

  private static readonly CITY_SIZE_DISTRIBUTION = {
    small: 0.4,   // 40% small cities
    medium: 0.4,  // 40% medium cities
    large: 0.2    // 20% large cities
  };

  /**
   * Generate cities for a country based on its stats and position
   */
  static generateCitiesForCountry(
    country: Country,
    stats: CountryStats,
    existingCities: City[] = []
  ): City[] {
    const cityCount = this.calculateCityCount(country, stats);

    // If cities already exist, don't regenerate unless forced
    if (existingCities.length >= cityCount) {
      return existingCities.slice(0, cityCount);
    }

    const cities: City[] = [];

    // Distribute resources and population across cities
    const totalResources = { ...stats.resources };
    const totalPopulation = stats.population;

    // Calculate resource portions per city
    const resourceKeys = Object.keys(totalResources);
    const baseResourcesPerCity = resourceKeys.reduce((acc, key) => {
      acc[key] = Math.floor(totalResources[key] / cityCount);
      return acc;
    }, {} as Record<string, number>);

    const basePopulationPerCity = Math.floor(totalPopulation / cityCount);

    // Track allocated resources and population
    const allocatedResources: Record<string, number> = {};
    let allocatedPopulation = 0;

    // Generate cities with distributed resources
    for (let i = 0; i < cityCount; i++) {
      const citySize = this.determineCitySize(i, cityCount);
      const position = this.generateCityPosition(country, cities, i);
      const name = this.generateCityName(country.name, i);
      const isLastCity = i === cityCount - 1;

      // Allocate resources to this city (with some randomization)
      const cityResources = this.allocateResourcesToCity(
        baseResourcesPerCity,
        totalResources,
        citySize,
        !isLastCity,
        allocatedResources
      );

      // Update allocated resources
      for (const [key, amount] of Object.entries(cityResources)) {
        allocatedResources[key] = (allocatedResources[key] || 0) + amount;
      }

      const cityPopulation = this.allocatePopulationToCity(
        basePopulationPerCity,
        totalPopulation,
        citySize,
        !isLastCity,
        allocatedPopulation
      );

      allocatedPopulation += cityPopulation;

      const city: City = {
        id: `${country.id}-city-${i}`,
        countryId: country.id,
        name,
        positionX: position.x,
        positionY: position.y,
        size: citySize,
        resourcesPerTurn: cityResources,
        population: cityPopulation,
        infrastructure: 0 // Start with basic infrastructure
      };

      cities.push(city);
    }

    // Ensure totals match exactly (adjust last city if needed)
    this.balanceCityTotals(cities, stats);

    return cities;
  }

  /**
   * Calculate how many cities a country should have based on its size/area
   */
  private static calculateCityCount(country: Country, stats: CountryStats): number {
    // Base on population and budget to determine country "size"
    const populationFactor = Math.log10(stats.population) - 5; // Scale factor
    const budgetFactor = Math.log10(stats.budget) - 3; // Scale factor

    const sizeScore = populationFactor + budgetFactor;
    const baseCount = Math.max(6, Math.min(15, Math.floor(8 + sizeScore * 1.5)));

    return baseCount;
  }

  /**
   * Determine city size based on position in the sequence
   */
  private static determineCitySize(index: number, totalCities: number): 'small' | 'medium' | 'large' {
    const positionRatio = index / (totalCities - 1 || 1);

    if (positionRatio < this.CITY_SIZE_DISTRIBUTION.small) {
      return 'small';
    } else if (positionRatio < this.CITY_SIZE_DISTRIBUTION.small + this.CITY_SIZE_DISTRIBUTION.medium) {
      return 'medium';
    } else {
      return 'large';
    }
  }

  /**
   * Generate a position for a city within the country's territory
   */
  private static generateCityPosition(
    country: Country,
    existingCities: City[],
    index: number
  ): { x: number; y: number } {
    const countryRadius = 8; // Approximate country radius in map units
    const minDistance = 2; // Minimum distance between cities

    let attempts = 0;
    let position: { x: number; y: number };

    do {
      // Generate position within country's approximate area
      const angle = (index * 137.5) % 360; // Golden angle for even distribution
      const distance = (Math.random() * 0.8 + 0.2) * countryRadius;

      position = {
        x: country.positionX + Math.cos(angle * Math.PI / 180) * distance,
        y: country.positionY + Math.sin(angle * Math.PI / 180) * distance
      };

      attempts++;
    } while (
      attempts < 50 &&
      existingCities.some(city =>
        Math.sqrt(
          Math.pow(city.positionX - position.x, 2) +
          Math.pow(city.positionY - position.y, 2)
        ) < minDistance
      )
    );

    return position;
  }

  /**
   * Generate a city name
   */
  private static generateCityName(countryName: string, index: number): string {
    if (index === 0) {
      return `${countryName} Capital`;
    }

    const nameIndex = (index - 1) % this.CITY_NAMES.length;
    return this.CITY_NAMES[nameIndex];
  }

  /**
   * Allocate resources to a specific city
   * NOTE: This is called during generation, so we need to track allocated resources
   */
  private static allocateResourcesToCity(
    baseResources: Record<string, number>,
    totalResources: Record<string, number>,
    citySize: 'small' | 'medium' | 'large',
    hasRemainingCities: boolean,
    alreadyAllocated: Record<string, number> // Track what's already been allocated
  ): Record<string, number> {
    const sizeMultiplier = { small: 0.8, medium: 1.0, large: 1.3 }[citySize];
    const resources: Record<string, number> = {};

    for (const [key, baseAmount] of Object.entries(baseResources)) {
      if (hasRemainingCities) {
        // Add some randomization for non-final cities
        const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
        resources[key] = Math.floor(baseAmount * sizeMultiplier * randomFactor);
      } else {
        // Final city gets all remaining resources
        const alreadyAllocatedForResource = alreadyAllocated[key] || 0;
        resources[key] = Math.max(0, totalResources[key] - alreadyAllocatedForResource);
      }
    }

    return resources;
  }

  /**
   * Allocate population to a specific city
   */
  private static allocatePopulationToCity(
    basePopulation: number,
    totalPopulation: number,
    citySize: 'small' | 'medium' | 'large',
    hasRemainingCities: boolean,
    alreadyAllocated: number = 0 // Track what's already been allocated
  ): number {
    const sizeMultiplier = { small: 0.7, medium: 1.0, large: 1.4 }[citySize];

    if (hasRemainingCities) {
      const randomFactor = 0.8 + Math.random() * 0.4;
      return Math.floor(basePopulation * sizeMultiplier * randomFactor);
    } else {
      // Final city gets remaining population
      return Math.max(0, totalPopulation - alreadyAllocated);
    }
  }

  /**
   * Ensure that the sum of all city resources/population matches country totals
   */
  private static balanceCityTotals(cities: City[], stats: CountryStats): void {
    // Calculate current totals
    const currentResourceTotals = cities.reduce((totals, city) => {
      for (const [key, amount] of Object.entries(city.resourcesPerTurn)) {
        totals[key] = (totals[key] || 0) + amount;
      }
      return totals;
    }, {} as Record<string, number>);

    const currentPopulationTotal = cities.reduce((sum, city) => sum + city.population, 0);

    // Adjust last city to match totals
    if (cities.length > 0) {
      const lastCity = cities[cities.length - 1];

      // Adjust resources
      for (const [key, targetAmount] of Object.entries(stats.resources)) {
        const currentTotal = currentResourceTotals[key] || 0;
        const difference = targetAmount - currentTotal;
        if (difference !== 0) {
          lastCity.resourcesPerTurn[key] = Math.max(0, (lastCity.resourcesPerTurn[key] || 0) + difference);
        }
      }

      // Adjust population
      const populationDifference = stats.population - currentPopulationTotal;
      if (populationDifference !== 0) {
        lastCity.population = Math.max(0, lastCity.population + populationDifference);
      }
    }
  }

  /**
   * Check if two cities are neighbors (within attack range)
   */
  static areCitiesNeighbors(city1: City, city2: City, maxDistance: number = 5): boolean {
    const distance = Math.sqrt(
      Math.pow(city1.positionX - city2.positionX, 2) +
      Math.pow(city1.positionY - city2.positionY, 2)
    );
    return distance <= maxDistance;
  }
}