import type { City } from "@/types/city";
import type { Country, CountryStats } from "@/types/country";

interface Point {
  x: number;
  y: number;
}

/**
 * CityGenerator - Generates cities within country territories
 * 
 * Features:
 * - Generates 6-15 cities per country based on territory size
 * - Uses Poisson disk sampling for even distribution
 * - Creates Voronoi-based city borders
 * - Distributes resources and population proportionally
 * - Ensures sum of city values equals country totals
 */
export class CityGenerator {
  private static readonly MIN_CITIES = 6;
  private static readonly MAX_CITIES = 15;
  private static readonly MIN_AREA = 50;
  private static readonly MAX_AREA = 500;
  
  /**
   * Generate cities for a country
   */
  static generateCitiesForCountry(
    country: Country,
    stats: CountryStats,
    territoryPath: string
  ): Omit<City, 'id' | 'createdAt'>[] {
    // 1. Calculate number of cities based on territory area
    const numCities = this.calculateCityCount(territoryPath);
    
    // 2. Generate city positions within territory using Poisson disk sampling
    const positions = this.generateCityPositions(
      territoryPath,
      numCities,
      country.positionX,
      country.positionY
    );
    
    // 3. Create Voronoi cells for city borders
    const borders = this.generateCityBorders(positions, territoryPath);
    
    // 4. Assign sizes (weighted random)
    const sizes = this.generateCitySizes(numCities);
    
    // 5. Distribute resources and population
    const distributions = this.distributeResources(
      stats.resources,
      stats.population,
      sizes
    );
    
    // 6. Generate city names
    const names = this.generateCityNames(country.name, numCities);
    
    // 7. Create city objects (without id and createdAt - will be set by database)
    return positions.map((pos, i) => ({
      countryId: country.id,
      gameId: country.gameId,
      name: names[i],
      positionX: pos.x,
      positionY: pos.y,
      size: sizes[i],
      borderPath: borders[i],
      perTurnResources: distributions[i].resources,
      population: distributions[i].population,
    }));
  }
  
  /**
   * Calculate number of cities based on territory area
   */
  private static calculateCityCount(territoryPath: string): number {
    const area = this.calculatePathArea(territoryPath);
    
    // Map area to 6-15 cities with some randomness
    const normalized = Math.max(0, Math.min(1, 
      (area - this.MIN_AREA) / (this.MAX_AREA - this.MIN_AREA)
    ));
    
    const baseCount = this.MIN_CITIES + normalized * (this.MAX_CITIES - this.MIN_CITIES);
    
    // Add small random variation (±1-2 cities)
    const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
    const count = Math.floor(baseCount) + variation;
    
    return Math.max(this.MIN_CITIES, Math.min(this.MAX_CITIES, count));
  }
  
  /**
   * Calculate approximate area of SVG path
   */
  private static calculatePathArea(pathStr: string): number {
    // Parse path and calculate polygon area using shoelace formula
    const coords = this.parsePathCoordinates(pathStr);
    if (coords.length < 3) return this.MIN_AREA;
    
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      area += coords[i].x * coords[j].y;
      area -= coords[j].x * coords[i].y;
    }
    
    return Math.abs(area / 2);
  }
  
  /**
   * Parse SVG path string to extract coordinates
   */
  private static parsePathCoordinates(pathStr: string): Point[] {
    const coords: Point[] = [];
    const commands = pathStr.match(/[ML]\s*[-\d.]+\s+[-\d.]+/g) || [];
    
    for (const cmd of commands) {
      const match = cmd.match(/([-\d.]+)\s+([-\d.]+)/);
      if (match) {
        coords.push({
          x: parseFloat(match[1]),
          y: parseFloat(match[2]),
        });
      }
    }
    
    return coords;
  }
  
  /**
   * Generate city positions using Poisson disk sampling for even distribution
   */
  private static generateCityPositions(
    territoryPath: string,
    count: number,
    centerX: number,
    centerY: number
  ): Point[] {
    const positions: Point[] = [];
    const pathCoords = this.parsePathCoordinates(territoryPath);
    
    if (pathCoords.length === 0) {
      // Fallback: generate around center
      return this.generatePositionsAroundCenter(count, centerX, centerY);
    }
    
    // Calculate bounding box
    const bounds = this.calculateBounds(pathCoords);
    const minDistance = Math.sqrt((bounds.width * bounds.height) / count) * 0.8;
    
    // Poisson disk sampling with rejection
    const maxAttempts = 30;
    let attempts = 0;
    
    while (positions.length < count && attempts < count * maxAttempts) {
      // Generate random point within bounds
      const point: Point = {
        x: bounds.minX + Math.random() * bounds.width,
        y: bounds.minY + Math.random() * bounds.height,
      };
      
      // Check if point is inside territory
      if (!this.isPointInPath(point, pathCoords)) {
        attempts++;
        continue;
      }
      
      // Check minimum distance from existing points
      const tooClose = positions.some(existing => 
        this.distance(point, existing) < minDistance
      );
      
      if (!tooClose) {
        positions.push(point);
        attempts = 0; // Reset attempts counter
      } else {
        attempts++;
      }
    }
    
    // If we couldn't generate enough positions, fill with remaining
    while (positions.length < count) {
      positions.push(this.findValidPointInTerritory(pathCoords, bounds, positions));
    }
    
    return positions;
  }
  
  /**
   * Fallback: generate positions around center point
   */
  private static generatePositionsAroundCenter(
    count: number,
    centerX: number,
    centerY: number
  ): Point[] {
    const positions: Point[] = [];
    const radius = 8; // Base radius
    const angleStep = (Math.PI * 2) / count;
    
    for (let i = 0; i < count; i++) {
      const angle = angleStep * i;
      const r = radius * (0.7 + Math.random() * 0.6); // Vary distance
      positions.push({
        x: centerX + Math.cos(angle) * r,
        y: centerY + Math.sin(angle) * r,
      });
    }
    
    return positions;
  }
  
  /**
   * Find a valid point within territory
   */
  private static findValidPointInTerritory(
    pathCoords: Point[],
    bounds: { minX: number; minY: number; width: number; height: number },
    existingPoints: Point[]
  ): Point {
    for (let i = 0; i < 100; i++) {
      const point: Point = {
        x: bounds.minX + Math.random() * bounds.width,
        y: bounds.minY + Math.random() * bounds.height,
      };
      
      if (this.isPointInPath(point, pathCoords)) {
        return point;
      }
    }
    
    // Ultimate fallback: return centroid
    return this.calculateCentroid(pathCoords);
  }
  
  /**
   * Calculate bounds of polygon
   */
  private static calculateBounds(points: Point[]): {
    minX: number;
    minY: number;
    width: number;
    height: number;
  } {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  
  /**
   * Check if point is inside polygon using ray casting
   */
  private static isPointInPath(point: Point, pathCoords: Point[]): boolean {
    let inside = false;
    
    for (let i = 0, j = pathCoords.length - 1; i < pathCoords.length; j = i++) {
      const xi = pathCoords[i].x;
      const yi = pathCoords[i].y;
      const xj = pathCoords[j].x;
      const yj = pathCoords[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
  
  /**
   * Calculate distance between two points
   */
  private static distance(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate centroid of polygon
   */
  private static calculateCentroid(points: Point[]): Point {
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    
    return {
      x: sum.x / points.length,
      y: sum.y / points.length,
    };
  }
  
  /**
   * Generate city borders using Voronoi diagram
   */
  private static generateCityBorders(
    cityPositions: Point[],
    territoryPath: string
  ): string[] {
    const pathCoords = this.parsePathCoordinates(territoryPath);
    const bounds = this.calculateBounds(pathCoords);
    
    return cityPositions.map(cityPos => {
      // Create a simplified Voronoi cell for this city
      // For each city, find points that are closer to it than to any other city
      const cellPoints: Point[] = [];
      const resolution = 2; // Grid resolution for sampling
      
      // Sample grid points within territory
      for (let x = bounds.minX; x <= bounds.minX + bounds.width; x += resolution) {
        for (let y = bounds.minY; y <= bounds.minY + bounds.height; y += resolution) {
          const point = { x, y };
          
          // Check if point is in territory
          if (!this.isPointInPath(point, pathCoords)) continue;
          
          // Find closest city
          let minDist = Infinity;
          let closestCity: Point | null = null;
          
          for (const otherCity of cityPositions) {
            const dist = this.distance(point, otherCity);
            if (dist < minDist) {
              minDist = dist;
              closestCity = otherCity;
            }
          }
          
          // If this city is the closest, add point to its cell
          if (closestCity === cityPos) {
            cellPoints.push(point);
          }
        }
      }
      
      // Find boundary points
      const boundary = this.findBoundaryPoints(cellPoints, resolution);
      
      // Sort boundary points to form closed path
      const sortedBoundary = this.sortBoundaryPoints(boundary, cityPos);
      
      // Create SVG path
      if (sortedBoundary.length < 3) {
        // Fallback: create small circle around city
        return this.createCirclePath(cityPos, 3);
      }
      
      const pathStr = sortedBoundary
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ") + " Z";
      
      return pathStr;
    });
  }
  
  /**
   * Find boundary points of a region
   */
  private static findBoundaryPoints(points: Point[], resolution: number): Point[] {
    const pointSet = new Set(points.map(p => `${p.x},${p.y}`));
    const boundary: Point[] = [];
    
    for (const point of points) {
      // Check if this point has a neighbor that's not in the set
      const neighbors = [
        { x: point.x - resolution, y: point.y },
        { x: point.x + resolution, y: point.y },
        { x: point.x, y: point.y - resolution },
        { x: point.x, y: point.y + resolution },
      ];
      
      const isBoundary = neighbors.some(n => !pointSet.has(`${n.x},${n.y}`));
      
      if (isBoundary) {
        boundary.push(point);
      }
    }
    
    return boundary;
  }
  
  /**
   * Sort boundary points to form a closed path
   */
  private static sortBoundaryPoints(boundary: Point[], center: Point): Point[] {
    if (boundary.length === 0) return [];
    
    // Sort by angle from center
    return [...boundary].sort((a, b) => {
      const angleA = Math.atan2(a.y - center.y, a.x - center.x);
      const angleB = Math.atan2(b.y - center.y, b.x - center.x);
      return angleA - angleB;
    });
  }
  
  /**
   * Create a circular path around a point
   */
  private static createCirclePath(center: Point, radius: number): string {
    const points = 12;
    const path: string[] = [];
    
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      path.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    
    return path.join(" ") + " Z";
  }
  
  /**
   * Generate city sizes with variation
   */
  private static generateCitySizes(count: number): number[] {
    const sizes: number[] = [];
    
    for (let i = 0; i < count; i++) {
      // Generate sizes between 0.6 and 1.8 with normal-ish distribution
      const base = 0.6 + Math.random() * 1.2;
      const variation = (Math.random() - 0.5) * 0.2;
      const size = Math.max(0.5, Math.min(2.0, base + variation));
      sizes.push(size);
    }
    
    return sizes;
  }
  
  /**
   * Distribute resources and population proportionally by city size
   */
  private static distributeResources(
    totalResources: Record<string, number>,
    totalPopulation: number,
    sizes: number[]
  ): Array<{ resources: Record<string, number>; population: number }> {
    const totalSize = sizes.reduce((sum, size) => sum + size, 0);
    const distributions: Array<{ resources: Record<string, number>; population: number }> = [];
    
    let remainingPopulation = totalPopulation;
    const remainingResources = { ...totalResources };
    
    // Distribute to all cities except the last one
    for (let i = 0; i < sizes.length - 1; i++) {
      const proportion = sizes[i] / totalSize;
      
      // Distribute each resource
      const resources: Record<string, number> = {};
      for (const [resource, total] of Object.entries(totalResources)) {
        const amount = Math.floor(total * proportion);
        resources[resource] = amount;
        remainingResources[resource] = (remainingResources[resource] || 0) - amount;
      }
      
      const population = Math.floor(totalPopulation * proportion);
      remainingPopulation -= population;
      
      distributions.push({ resources, population });
    }
    
    // Give all remaining resources and population to the last city
    // This ensures the sum is exactly equal to country totals
    distributions.push({
      resources: remainingResources,
      population: remainingPopulation,
    });
    
    return distributions;
  }
  
  /**
   * Generate city names based on country name
   */
  private static generateCityNames(countryName: string, count: number): string[] {
    const prefixes = ["New ", "Old ", "Port ", "Fort ", "Saint ", "", "", "", ""];
    const suffixes = [" City", " Town", " Bay", " Harbor", " Village", "dale", "ville", "burg", ""];
    const adjectives = ["North", "South", "East", "West", "Central", "Upper", "Lower"];
    
    const names: string[] = [];
    const usedNames = new Set<string>();
    
    // First city is often the capital - use country name
    const capitalName = `${countryName} City`;
    names.push(capitalName);
    usedNames.add(capitalName.toLowerCase());
    
    // Generate remaining city names
    for (let i = 1; i < count; i++) {
      let cityName = "";
      let attempts = 0;
      
      while (attempts < 50) {
        const usePrefix = Math.random() > 0.6;
        const useSuffix = Math.random() > 0.4;
        const useAdjective = Math.random() > 0.7;
        
        let name = "";
        
        if (usePrefix) {
          name += prefixes[Math.floor(Math.random() * prefixes.length)];
        }
        
        if (useAdjective && Math.random() > 0.5) {
          name += adjectives[Math.floor(Math.random() * adjectives.length)] + " ";
        }
        
        name += countryName;
        
        if (useSuffix) {
          name += suffixes[Math.floor(Math.random() * suffixes.length)];
        }
        
        // Check for duplicates
        if (!usedNames.has(name.toLowerCase().trim())) {
          cityName = name.trim();
          usedNames.add(cityName.toLowerCase());
          break;
        }
        
        attempts++;
      }
      
      // Fallback if we couldn't generate unique name
      if (!cityName) {
        cityName = `${countryName} ${i + 1}`;
      }
      
      names.push(cityName);
    }
    
    return names;
  }
}
