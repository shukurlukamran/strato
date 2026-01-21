import type { Country } from "@/types/country";
import type { City } from "@/types/city";

interface Point {
  x: number;
  y: number;
}

/**
 * TerritoryGenerator - Generates Voronoi-based connected territories for countries
 * 
 * This ensures territories:
 * - Cover the entire map with no gaps
 * - Share borders with neighboring countries (no empty spaces)
 * - Are based on proximity to country centers
 */
export class TerritoryGenerator {
  private static readonly MAP_WIDTH = 100;
  private static readonly MAP_HEIGHT = 80;
  private static readonly RESOLUTION = 1; // Grid resolution for Voronoi calculation
  
  /**
   * Generate connected Voronoi territories for all countries
   * Returns a map of countryId -> SVG path string
   */
  static generateTerritories(countries: Country[]): Map<string, string> {
    const cells = new Map<string, string>();
    
    // For each country, find all points that are closest to it
    // This creates a Voronoi diagram with connected regions
    const countryRegions = new Map<string, Point[]>();
    
    // Initialize regions
    for (const country of countries) {
      countryRegions.set(country.id, []);
    }
    
    // Assign each grid point to nearest country
    for (let y = 0; y < this.MAP_HEIGHT; y += this.RESOLUTION) {
      for (let x = 0; x < this.MAP_WIDTH; x += this.RESOLUTION) {
        let minDist = Infinity;
        let closestCountryId: string | null = null;
        
        for (const country of countries) {
          const dx = x - country.positionX;
          const dy = y - country.positionY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            closestCountryId = country.id;
          }
        }
        
        if (closestCountryId) {
          countryRegions.get(closestCountryId)!.push({ x, y });
        }
      }
    }
    
    // Create paths for each country using boundary tracing
    for (const [countryId, points] of countryRegions.entries()) {
      if (points.length === 0) continue;
      
      // Find boundary points (points on the edge of the region)
      const boundary = this.findBoundary(points);
      if (boundary.length < 3) continue;
      
      // Sort boundary points to form a closed path
      const country = countries.find(c => c.id === countryId)!;
      const sortedBoundary = this.sortBoundaryPoints(boundary, country);
      
      // Create SVG path
      const pathStr = sortedBoundary
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ") + " Z";
      
      cells.set(countryId, pathStr);
    }
    
    return cells;
  }
  
  /**
   * Find boundary points of a region
   */
  private static findBoundary(points: Point[]): Point[] {
    const pointSet = new Set(points.map(p => `${p.x},${p.y}`));
    const boundary: Point[] = [];
    
    for (const point of points) {
      // Check if this point is on the boundary (has a neighbor that's not in the set)
      const neighbors = [
        { x: point.x - this.RESOLUTION, y: point.y },
        { x: point.x + this.RESOLUTION, y: point.y },
        { x: point.x, y: point.y - this.RESOLUTION },
        { x: point.x, y: point.y + this.RESOLUTION },
      ];
      
      const isBoundary = neighbors.some(n => 
        !pointSet.has(`${n.x},${n.y}`) || 
        n.x < 0 || n.x >= this.MAP_WIDTH || 
        n.y < 0 || n.y >= this.MAP_HEIGHT
      );
      
      if (isBoundary) {
        boundary.push(point);
      }
    }
    
    return boundary;
  }
  
  /**
   * Sort boundary points to form a closed path
   */
  private static sortBoundaryPoints(boundary: Point[], center: Country): Point[] {
    // Sort by angle from center
    return [...boundary].sort((a, b) => {
      const angleA = Math.atan2(a.y - center.positionY, a.x - center.positionX);
      const angleB = Math.atan2(b.y - center.positionY, b.x - center.positionX);
      return angleA - angleB;
    });
  }

  /**
   * Generate territories based on city ownership
   * Uses Voronoi at fine resolution (0.4) to match city tiling resolution
   * This ensures the entire map is covered with no gaps and perfect alignment
   */
  static generateTerritoriesFromCities(countries: Country[], cities: City[]): Map<string, string> {
    const cells = new Map<string, string>();
    
    // Group cities by country
    const citiesByCountry = new Map<string, City[]>();
    for (const country of countries) {
      citiesByCountry.set(country.id, []);
    }
    for (const city of cities) {
      const countryCities = citiesByCountry.get(city.countryId);
      if (countryCities) {
        countryCities.push(city);
      }
    }
    
    // Use FINE resolution (0.4) to match the CITY_TILING_RESOLUTION in Map.tsx
    // This ensures perfect alignment and covers the entire map with no gaps
    const FINE_RESOLUTION = 0.4;
    
    // For each country, find all points that are closest to any of its cities
    const countryRegions = new Map<string, Point[]>();
    
    // Initialize regions
    for (const country of countries) {
      countryRegions.set(country.id, []);
    }
    
    // Assign each grid point to the country whose city is nearest
    // This creates a Voronoi diagram that covers the entire map
    for (let y = 0; y < this.MAP_HEIGHT; y += FINE_RESOLUTION) {
      for (let x = 0; x < this.MAP_WIDTH; x += FINE_RESOLUTION) {
        let minDist = Infinity;
        let closestCountryId: string | null = null;
        
        // Check distance to all cities of all countries
        for (const [countryId, countryCities] of citiesByCountry.entries()) {
          for (const city of countryCities) {
            const dx = x - city.positionX;
            const dy = y - city.positionY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
              minDist = dist;
              closestCountryId = countryId;
            }
          }
        }
        
        if (closestCountryId) {
          countryRegions.get(closestCountryId)!.push({ x, y });
        }
      }
    }
    
    // Create paths for each country using boundary tracing
    for (const [countryId, points] of countryRegions.entries()) {
      if (points.length === 0) continue;
      
      // Find boundary points (points on the edge of the region)
      const boundary = this.findBoundaryFromPoints(points, FINE_RESOLUTION);
      if (boundary.length < 3) continue;
      
      // Sort boundary points to form a closed path
      const country = countries.find(c => c.id === countryId)!;
      const sortedBoundary = this.sortBoundaryPoints(boundary, country);
      
      // Create SVG path
      const pathStr = sortedBoundary
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ") + " Z";
      
      cells.set(countryId, pathStr);
    }
    
    return cells;
  }

  /**
   * Find boundary points from a set of rasterized points
   */
  private static findBoundaryFromPoints(points: Point[], resolution: number): Point[] {
    const pointSet = new Set(points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`));
    const boundary: Point[] = [];
    
    for (const point of points) {
      // Check if this point is on the boundary (has a neighbor that's not in the set)
      const neighbors = [
        { x: point.x - resolution, y: point.y },
        { x: point.x + resolution, y: point.y },
        { x: point.x, y: point.y - resolution },
        { x: point.x, y: point.y + resolution },
      ];
      
      const isBoundary = neighbors.some(n => {
        const key = `${n.x.toFixed(1)},${n.y.toFixed(1)}`;
        return !pointSet.has(key) || 
          n.x < 0 || n.x >= this.MAP_WIDTH || 
          n.y < 0 || n.y >= this.MAP_HEIGHT;
      });
      
      if (isBoundary) {
        boundary.push(point);
      }
    }
    
    return boundary;
  }
}
