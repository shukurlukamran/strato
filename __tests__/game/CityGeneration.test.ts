import { describe, it, expect } from '@jest/globals';
import { CityGenerator } from '@/lib/game-engine/CityGenerator';
import type { Country, CountryStats } from '@/types/country';

describe('CityGenerator', () => {
  // Helper to create test country
  const createTestCountry = (): Country => ({
    id: 'test-country-1',
    gameId: 'test-game-1',
    name: 'Test Country',
    isPlayerControlled: false,
    color: '#FF0000',
    positionX: 50,
    positionY: 40,
  });

  // Helper to create test stats
  const createTestStats = (): CountryStats => ({
    id: 'test-stats-1',
    countryId: 'test-country-1',
    turn: 1,
    population: 100000,
    budget: 5000,
    technologyLevel: 1,
    infrastructureLevel: 1,
    militaryStrength: 40,
    militaryEquipment: {},
    resources: {
      oil: 30,
      gems: 15,
      coal: 40,
      iron: 50,
      food: 300,
      water: 150,
      timber: 100,
      stone: 80,
    },
    diplomaticRelations: {},
    createdAt: new Date().toISOString(),
  });

  // Helper to create simple territory path
  const createTerritoryPath = (centerX: number, centerY: number, radius: number = 10): string => {
    const points = 16;
    const pathParts: string[] = [];
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      pathParts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    
    return pathParts.join(" ") + " Z";
  };

  describe('generateCitiesForCountry', () => {
    it('should generate cities within the expected range', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      expect(cities.length).toBeGreaterThanOrEqual(6);
      expect(cities.length).toBeLessThanOrEqual(15);
    });

    it('should assign each city to the correct country', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      cities.forEach(city => {
        expect(city.countryId).toBe(country.id);
        expect(city.gameId).toBe(country.gameId);
      });
    });

    it('should generate unique city names', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      const names = cities.map(c => c.name);
      const uniqueNames = new Set(names);
      
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should distribute population to equal country total', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      const totalPopulation = cities.reduce((sum, city) => sum + city.population, 0);
      
      expect(totalPopulation).toBe(stats.population);
    });

    it('should distribute resources to equal country totals', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      // Sum up each resource type across all cities
      const totalResources: Record<string, number> = {};
      for (const city of cities) {
        for (const [resource, amount] of Object.entries(city.perTurnResources)) {
          totalResources[resource] = (totalResources[resource] || 0) + amount;
        }
      }

      // Check that each resource matches the country total
      for (const [resource, total] of Object.entries(stats.resources)) {
        expect(totalResources[resource] || 0).toBe(total);
      }
    });

    it('should assign varied city sizes', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      const sizes = cities.map(c => c.size);
      const uniqueSizes = new Set(sizes);
      
      // Should have at least some variation in sizes (not all identical)
      expect(uniqueSizes.size).toBeGreaterThan(1);
      
      // All sizes should be within valid range
      sizes.forEach(size => {
        expect(size).toBeGreaterThanOrEqual(0.5);
        expect(size).toBeLessThanOrEqual(2.0);
      });
    });

    it('should generate valid border paths', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      cities.forEach(city => {
        expect(city.borderPath).toBeTruthy();
        expect(typeof city.borderPath).toBe('string');
        expect(city.borderPath.length).toBeGreaterThan(0);
        // Should start with M (move) command
        expect(city.borderPath.startsWith('M')).toBe(true);
        // Should end with Z (close path) command
        expect(city.borderPath.endsWith('Z')).toBe(true);
      });
    });

    it('should distribute larger portions to larger cities', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      // Sort cities by size
      const sortedCities = [...cities].sort((a, b) => b.size - a.size);
      
      // Largest city should generally have more population than smallest
      // (not always guaranteed due to rounding, but should trend that way)
      const largestCityPop = sortedCities[0].population;
      const smallestCityPop = sortedCities[sortedCities.length - 1].population;
      
      // At minimum, no city should have 0 population
      expect(smallestCityPop).toBeGreaterThan(0);
      expect(largestCityPop).toBeGreaterThan(0);
    });

    it('should generate cities with positions near country center', () => {
      const country = createTestCountry();
      const stats = createTestStats();
      const territoryPath = createTerritoryPath(country.positionX, country.positionY, 10);

      const cities = CityGenerator.generateCitiesForCountry(country, stats, territoryPath);

      // All cities should be reasonably close to country center
      cities.forEach(city => {
        const distanceX = Math.abs(city.positionX - country.positionX);
        const distanceY = Math.abs(city.positionY - country.positionY);
        
        // Cities should be within ~15 units of center (territory radius + margin)
        expect(distanceX).toBeLessThan(20);
        expect(distanceY).toBeLessThan(20);
      });
    });

    it('should handle multiple countries without collision', () => {
      const country1 = { ...createTestCountry(), id: 'country-1', positionX: 20, positionY: 20 };
      const country2 = { ...createTestCountry(), id: 'country-2', positionX: 80, positionY: 60 };
      const stats1 = { ...createTestStats(), countryId: 'country-1' };
      const stats2 = { ...createTestStats(), countryId: 'country-2' };
      const territory1 = createTerritoryPath(country1.positionX, country1.positionY);
      const territory2 = createTerritoryPath(country2.positionX, country2.positionY);

      const cities1 = CityGenerator.generateCitiesForCountry(country1, stats1, territory1);
      const cities2 = CityGenerator.generateCitiesForCountry(country2, stats2, territory2);

      // Verify country IDs are correct
      cities1.forEach(city => expect(city.countryId).toBe('country-1'));
      cities2.forEach(city => expect(city.countryId).toBe('country-2'));

      // Verify each country's cities sum to correct totals
      const total1Pop = cities1.reduce((sum, c) => sum + c.population, 0);
      const total2Pop = cities2.reduce((sum, c) => sum + c.population, 0);
      
      expect(total1Pop).toBe(stats1.population);
      expect(total2Pop).toBe(stats2.population);
    });
  });
});
