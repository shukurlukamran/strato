Based on the research and your game's architecture, here's a comprehensive implementation prompt for Cursor Agent:

***

# Implementation Prompt: Economic Engine & Resource Production System

## Overview
Implement a robust, scalable economic system for the Strato strategy game that handles resource production, budget generation, technology effects, and infrastructure impacts. The system should be modular, testable, and designed for easy expansion of resource types. 

## System Architecture

### Core Components to Create

```
lib/game/
├── EconomicEngine.ts          # Main economic calculations orchestrator
├── ResourceProduction.ts      # Resource generation logic
├── BudgetCalculator.ts        # Budget/treasury calculations
├── InfrastructureEffects.ts   # Infrastructure impact on economy
├── ResourceTypes.ts           # Resource type definitions and registry
└── EconomicBalance.ts         # Balance constants and formulas
```

***

## 1. Resource Type System (`lib/game/ResourceTypes.ts`)

### Resource Categories 

Define 4 expandable resource categories:

**STRATEGIC Resources** (military/technological importance):
- `iron` - Military equipment production
- `oil` - Advanced military units, energy
- `uranium` - Nuclear capabilities (future)
- `rare_earth` - Advanced technology research

**ECONOMIC Resources** (trade/wealth):
- `gold` - Luxury goods, diplomatic influence
- `silver` - Currency backing, trade bonus
- `gems` - High-value trade commodity
- `copper` - Industrial applications

**BASIC Resources** (population/survival):
- `food` - Population growth and maintenance
- `water` - Population health, agriculture
- `timber` - Construction, basic production
- `stone` - Infrastructure, fortifications

**INDUSTRIAL Resources** (production):
- `coal` - Energy generation, production boost
- `steel` - Advanced construction, military
- `aluminum` - Aircraft, modern equipment
- `electronics` - Modern technology

### Implementation Structure

```typescript
// lib/game/ResourceTypes.ts

export enum ResourceCategory {
  STRATEGIC = 'strategic',
  ECONOMIC = 'economic',
  BASIC = 'basic',
  INDUSTRIAL = 'industrial'
}

export interface ResourceDefinition {
  id: string;
  name: string;
  category: ResourceCategory;
  baseValue: number;              // Base monetary value
  productionDifficulty: number;   // 0.1-1.0, affects production rates
  storageDecay: number;           // % lost per turn if not consumed
  tradeable: boolean;
  description: string;
}

export interface ResourceAmount {
  resourceId: string;
  amount: number;
}

export class ResourceRegistry {
  private static resources: Map<string, ResourceDefinition> = new Map();
  
  static registerResource(resource: ResourceDefinition): void;
  static getResource(id: string): ResourceDefinition | undefined;
  static getAllResources(): ResourceDefinition[];
  static getResourcesByCategory(category: ResourceCategory): ResourceDefinition[];
  static getResourceValue(id: string, amount: number): number; // Calculate total value
}

// Initialize default resources
export const DEFAULT_RESOURCES: ResourceDefinition[] = [
  {
    id: 'food',
    name: 'Food',
    category: ResourceCategory.BASIC,
    baseValue: 2,
    productionDifficulty: 0.3,
    storageDecay: 0.1, // 10% spoils per turn
    tradeable: true,
    description: 'Essential for population growth and maintenance'
  },
  {
    id: 'iron',
    name: 'Iron',
    category: ResourceCategory.STRATEGIC,
    baseValue: 10,
    productionDifficulty: 0.6,
    storageDecay: 0,
    tradeable: true,
    description: 'Required for military equipment production'
  },
  // ... define all 16 resources
];
```

***

## 2. Economic Balance Configuration (`lib/game/EconomicBalance.ts`)

### Balance Constants 

```typescript
// lib/game/EconomicBalance.ts

export const ECONOMIC_BALANCE = {
  // Budget Generation
  BUDGET: {
    BASE_TAX_PER_CITIZEN: 5,           // Base tax income per population unit
    TECHNOLOGY_TAX_MULTIPLIER: 0.15,    // +15% per tech level
    MAX_TAX_MULTIPLIER: 3.0,           // Cap at 300% of base
    INFRASTRUCTURE_BONUS: 0.1,         // +10% per infrastructure level
    TRADE_INCOME_MULTIPLIER: 0.05,     // 5% of total trade value
  },
  
  // Resource Production [web:20][web:23]
  PRODUCTION: {
    BASE_FOOD_PER_POP: 0.8,            // Each 10k pop produces 8 food
    BASE_INDUSTRIAL_OUTPUT: 5,          // Base industrial production
    TECH_PRODUCTION_MULTIPLIER: 0.2,   // +20% per tech level
    INFRASTRUCTURE_MULTIPLIER: 0.15,   // +15% per infrastructure level
    POPULATION_EFFICIENCY: 0.7,        // Population work efficiency (0-1)
    RESOURCE_EXTRACTION_RATE: 10,      // Base extraction per turn
  },
  
  // Resource Consumption
  CONSUMPTION: {
    FOOD_PER_10K_POPULATION: 5,        // Food consumed per 10k pop
    MAINTENANCE_COST_MULTIPLIER: 0.05, // 5% of budget for maintenance
    MILITARY_UPKEEP_PER_STRENGTH: 2,   // Budget cost per military strength point
  },
  
  // Technology Effects
  TECHNOLOGY: {
    LEVEL_0_MULTIPLIER: 1.0,
    LEVEL_1_MULTIPLIER: 1.3,
    LEVEL_2_MULTIPLIER: 1.7,
    LEVEL_3_MULTIPLIER: 2.2,
    LEVEL_4_MULTIPLIER: 3.0,
    LEVEL_5_MULTIPLIER: 4.0,
  },
  
  // Population Growth
  POPULATION: {
    GROWTH_RATE_BASE: 0.02,            // 2% base growth per turn
    FOOD_SURPLUS_GROWTH_BONUS: 0.01,   // +1% per 100 surplus food
    GROWTH_CAP_MULTIPLIER: 1.5,        // Max 150% of base growth
    STARVATION_THRESHOLD: 0.8,         // Below 80% food = population decline
  },
  
  // Infrastructure
  INFRASTRUCTURE: {
    BUILD_COST_BASE: 1000,             // Base cost to increase infrastructure
    BUILD_COST_MULTIPLIER: 1.5,        // Cost increases 1.5x per level
    MAINTENANCE_COST_PER_LEVEL: 50,    // Budget cost per infrastructure level
  }
};
```

***

## 3. Resource Production System (`lib/game/ResourceProduction.ts`)

### Production Logic 

```typescript
// lib/game/ResourceProduction.ts

import { Country, CountryStats } from '@/lib/types';
import { ECONOMIC_BALANCE } from './EconomicBalance';
import { ResourceRegistry, ResourceAmount } from './ResourceTypes';

export interface ProductionOutput {
  resources: ResourceAmount[];
  productionSummary: {
    baseProduction: number;
    technologyBonus: number;
    infrastructureBonus: number;
    totalProduction: number;
  };
}

export class ResourceProduction {
  /**
   * Calculate all resource production for a country this turn
   */
  static calculateProduction(
    country: Country,
    stats: CountryStats
  ): ProductionOutput {
    const production: ResourceAmount[] = [];
    
    // Calculate multipliers
    const techMultiplier = this.getTechnologyMultiplier(stats.technology_level);
    const infraMultiplier = this.getInfrastructureMultiplier(stats.infrastructure_level || 0);
    const totalMultiplier = techMultiplier * infraMultiplier;
    
    // BASIC RESOURCES
    production.push(...this.produceBasicResources(stats, totalMultiplier));
    
    // STRATEGIC RESOURCES (from deposits/mines)
    production.push(...this.produceStrategicResources(stats, totalMultiplier));
    
    // INDUSTRIAL RESOURCES
    production.push(...this.produceIndustrialResources(stats, totalMultiplier));
    
    // ECONOMIC RESOURCES (trade-focused)
    production.push(...this.produceEconomicResources(stats, totalMultiplier));
    
    return {
      resources: production,
      productionSummary: {
        baseProduction: this.calculateBaseProduction(stats),
        technologyBonus: (techMultiplier - 1) * 100,
        infrastructureBonus: (infraMultiplier - 1) * 100,
        totalProduction: this.calculateTotalProduction(production),
      }
    };
  }
  
  /**
   * Food production based on population [web:23]
   */
  private static produceBasicResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    const populationUnits = stats.population / 10000; // Per 10k population
    
    return [
      {
        resourceId: 'food',
        amount: Math.floor(
          populationUnits * 
          ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP * 
          multiplier * 
          ECONOMIC_BALANCE.PRODUCTION.POPULATION_EFFICIENCY
        )
      },
      {
        resourceId: 'water',
        amount: Math.floor(populationUnits * 0.5 * multiplier)
      },
      {
        resourceId: 'timber',
        amount: Math.floor(
          ECONOMIC_BALANCE.PRODUCTION.RESOURCE_EXTRACTION_RATE * 
          multiplier * 
          0.8
        )
      },
      {
        resourceId: 'stone',
        amount: Math.floor(
          ECONOMIC_BALANCE.PRODUCTION.RESOURCE_EXTRACTION_RATE * 
          multiplier * 
          0.6
        )
      }
    ];
  }
  
  /**
   * Strategic resource extraction [web:20]
   */
  private static produceStrategicResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    // Based on territory size and random deposits (simplified for now)
    const baseExtraction = ECONOMIC_BALANCE.PRODUCTION.RESOURCE_EXTRACTION_RATE;
    
    return [
      {
        resourceId: 'iron',
        amount: Math.floor(baseExtraction * multiplier * 0.7)
      },
      {
        resourceId: 'oil',
        amount: Math.floor(baseExtraction * multiplier * 0.5)
      },
      {
        resourceId: 'rare_earth',
        amount: Math.floor(baseExtraction * multiplier * 0.3)
      }
    ];
  }
  
  /**
   * Industrial production (requires basic resources as input)
   */
  private static produceIndustrialResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    const industrialOutput = ECONOMIC_BALANCE.PRODUCTION.BASE_INDUSTRIAL_OUTPUT;
    
    return [
      {
        resourceId: 'coal',
        amount: Math.floor(industrialOutput * multiplier * 0.8)
      },
      {
        resourceId: 'steel',
        amount: Math.floor(industrialOutput * multiplier * 0.5) // Requires iron
      },
      {
        resourceId: 'aluminum',
        amount: Math.floor(industrialOutput * multiplier * 0.4)
      }
    ];
  }
  
  /**
   * Economic resources (luxury/trade goods)
   */
  private static produceEconomicResources(
    stats: CountryStats,
    multiplier: number
  ): ResourceAmount[] {
    return [
      {
        resourceId: 'gold',
        amount: Math.floor(5 * multiplier * 0.3)
      },
      {
        resourceId: 'gems',
        amount: Math.floor(3 * multiplier * 0.2)
      }
    ];
  }
  
  /**
   * Apply resource decay (spoilage, etc.) [web:17]
   */
  static applyDecay(currentResources: ResourceAmount[]): ResourceAmount[] {
    return currentResources.map(resource => {
      const definition = ResourceRegistry.getResource(resource.resourceId);
      if (!definition || definition.storageDecay === 0) {
        return resource;
      }
      
      return {
        resourceId: resource.resourceId,
        amount: Math.floor(resource.amount * (1 - definition.storageDecay))
      };
    });
  }
  
  /**
   * Technology multiplier [web:23]
   */
  private static getTechnologyMultiplier(techLevel: number): number {
    const multipliers = ECONOMIC_BALANCE.TECHNOLOGY;
    return multipliers[`LEVEL_${Math.min(techLevel, 5)}_MULTIPLIER`] || 1.0;
  }
  
  /**
   * Infrastructure multiplier
   */
  private static getInfrastructureMultiplier(infraLevel: number): number {
    return 1 + (infraLevel * ECONOMIC_BALANCE.PRODUCTION.INFRASTRUCTURE_MULTIPLIER);
  }
  
  private static calculateBaseProduction(stats: CountryStats): number {
    return (stats.population / 10000) * ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP;
  }
  
  private static calculateTotalProduction(resources: ResourceAmount[]): number {
    return resources.reduce((total, resource) => {
      const value = ResourceRegistry.getResourceValue(resource.resourceId, resource.amount);
      return total + value;
    }, 0);
  }
}
```

***

## 4. Budget Calculator (`lib/game/BudgetCalculator.ts`)

### Budget Generation Logic 

```typescript
// lib/game/BudgetCalculator.ts

import { Country, CountryStats } from '@/lib/types';
import { ECONOMIC_BALANCE } from './EconomicBalance';

export interface BudgetBreakdown {
  taxRevenue: number;
  tradeRevenue: number;
  resourceRevenue: number;
  totalRevenue: number;
  
  maintenanceCost: number;
  militaryUpkeep: number;
  infrastructureCost: number;
  totalExpenses: number;
  
  netBudget: number;
}

export class BudgetCalculator {
  /**
   * Calculate total budget generation for the turn [web:20]
   */
  static calculateBudget(
    country: Country,
    stats: CountryStats,
    activeDealsValue: number = 0
  ): BudgetBreakdown {
    // REVENUE
    const taxRevenue = this.calculateTaxRevenue(stats);
    const tradeRevenue = this.calculateTradeRevenue(activeDealsValue);
    const resourceRevenue = this.calculateResourceRevenue(stats);
    const totalRevenue = taxRevenue + tradeRevenue + resourceRevenue;
    
    // EXPENSES
    const maintenanceCost = this.calculateMaintenanceCost(stats);
    const militaryUpkeep = this.calculateMilitaryUpkeep(stats);
    const infrastructureCost = this.calculateInfrastructureCost(stats);
    const totalExpenses = maintenanceCost + militaryUpkeep + infrastructureCost;
    
    return {
      taxRevenue,
      tradeRevenue,
      resourceRevenue,
      totalRevenue,
      maintenanceCost,
      militaryUpkeep,
      infrastructureCost,
      totalExpenses,
      netBudget: totalRevenue - totalExpenses
    };
  }
  
  /**
   * Tax revenue from population [web:23]
   */
  private static calculateTaxRevenue(stats: CountryStats): number {
    const populationUnits = stats.population / 10000;
    const baseTax = populationUnits * ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN;
    
    // Technology bonus
    const techBonus = 1 + (stats.technology_level * ECONOMIC_BALANCE.BUDGET.TECHNOLOGY_TAX_MULTIPLIER);
    const techMultiplier = Math.min(techBonus, ECONOMIC_BALANCE.BUDGET.MAX_TAX_MULTIPLIER);
    
    // Infrastructure bonus
    const infraLevel = stats.infrastructure_level || 0;
    const infraBonus = 1 + (infraLevel * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_BONUS);
    
    return Math.floor(baseTax * techMultiplier * infraBonus);
  }
  
  /**
   * Revenue from active trade deals
   */
  private static calculateTradeRevenue(activeDealsValue: number): number {
    return Math.floor(activeDealsValue * ECONOMIC_BALANCE.BUDGET.TRADE_INCOME_MULTIPLIER);
  }
  
  /**
   * Revenue from selling excess resources (future implementation)
   */
  private static calculateResourceRevenue(stats: CountryStats): number {
    // Placeholder: implement when resource market exists
    return 0;
  }
  
  /**
   * General maintenance costs [web:17]
   */
  private static calculateMaintenanceCost(stats: CountryStats): number {
    const totalBudget = stats.budget || 0;
    return Math.floor(totalBudget * ECONOMIC_BALANCE.CONSUMPTION.MAINTENANCE_COST_MULTIPLIER);
  }
  
  /**
   * Military upkeep costs
   */
  private static calculateMilitaryUpkeep(stats: CountryStats): number {
    const militaryStrength = stats.military_strength || 0;
    return militaryStrength * ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH;
  }
  
  /**
   * Infrastructure maintenance
   */
  private static calculateInfrastructureCost(stats: CountryStats): number {
    const infraLevel = stats.infrastructure_level || 0;
    return infraLevel * ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL;
  }
}
```

***

## 5. Economic Engine Orchestrator (`lib/game/EconomicEngine.ts`)

### Main Integration 

```typescript
// lib/game/EconomicEngine.ts

import { Database } from '@/lib/database.types';
import { Country, CountryStats } from '@/lib/types';
import { ResourceProduction, ProductionOutput } from './ResourceProduction';
import { BudgetCalculator, BudgetBreakdown } from './BudgetCalculator';
import { ResourceRegistry, ResourceAmount } from './ResourceTypes';
import { ECONOMIC_BALANCE } from './EconomicBalance';

export interface EconomicUpdateResult {
  countryId: string;
  budgetChange: number;
  budgetBreakdown: BudgetBreakdown;
  resourcesProduced: ResourceAmount[];
  resourcesConsumed: ResourceAmount[];
  populationChange: number;
  eventMessages: string[];
}

export class EconomicEngine {
  /**
   * Process full economic turn for a country
   */
  static async processEconomicTurn(
    supabase: Database,
    country: Country,
    stats: CountryStats,
    activeDealsValue: number = 0
  ): Promise<EconomicUpdateResult> {
    const eventMessages: string[] = [];
    
    // 1. Calculate resource production
    const productionResult = ResourceProduction.calculateProduction(country, stats);
    
    // 2. Calculate budget
    const budgetBreakdown = BudgetCalculator.calculateBudget(
      country,
      stats,
      activeDealsValue
    );
    
    // 3. Calculate resource consumption
    const consumption = this.calculateConsumption(stats);
    
    // 4. Update resources (production - consumption - decay)
    const currentResources = this.parseResources(stats.resources);
    const updatedResources = this.updateResources(
      currentResources,
      productionResult.resources,
      consumption
    );
    
    // Apply decay
    const finalResources = ResourceProduction.applyDecay(updatedResources);
    
    // 5. Calculate population change
    const foodBalance = this.getResourceAmount(finalResources, 'food') - consumption.find(r => r.resourceId === 'food')?.amount || 0;
    const populationChange = this.calculatePopulationChange(stats, foodBalance);
    
    // Add event messages
    if (populationChange > 0) {
      eventMessages.push(`Population grew by ${populationChange.toLocaleString()}`);
    } else if (populationChange < 0) {
      eventMessages.push(`Population declined by ${Math.abs(populationChange).toLocaleString()} due to food shortage`);
    }
    
    if (budgetBreakdown.netBudget > 0) {
      eventMessages.push(`Treasury increased by $${budgetBreakdown.netBudget.toLocaleString()}`);
    } else if (budgetBreakdown.netBudget < 0) {
      eventMessages.push(`Treasury decreased by $${Math.abs(budgetBreakdown.netBudget).toLocaleString()}`);
    }
    
    // 6. Save to database
    await this.saveEconomicUpdates(supabase, country.id, {
      budgetChange: budgetBreakdown.netBudget,
      resources: finalResources,
      populationChange,
      stats
    });
    
    return {
      countryId: country.id,
      budgetChange: budgetBreakdown.netBudget,
      budgetBreakdown,
      resourcesProduced: productionResult.resources,
      resourcesConsumed: consumption,
      populationChange,
      eventMessages
    };
  }
  
  /**
   * Calculate resource consumption [web:15]
   */
  private static calculateConsumption(stats: CountryStats): ResourceAmount[] {
    const populationUnits = stats.population / 10000;
    
    return [
      {
        resourceId: 'food',
        amount: Math.ceil(populationUnits * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION)
      },
      // Add other consumptions as needed
    ];
  }
  
  /**
   * Update resource stockpiles
   */
  private static updateResources(
    current: ResourceAmount[],
    produced: ResourceAmount[],
    consumed: ResourceAmount[]
  ): ResourceAmount[] {
    const resourceMap = new Map<string, number>();
    
    // Start with current
    current.forEach(r => resourceMap.set(r.resourceId, r.amount));
    
    // Add production
    produced.forEach(r => {
      const existing = resourceMap.get(r.resourceId) || 0;
      resourceMap.set(r.resourceId, existing + r.amount);
    });
    
    // Subtract consumption
    consumed.forEach(r => {
      const existing = resourceMap.get(r.resourceId) || 0;
      resourceMap.set(r.resourceId, Math.max(0, existing - r.amount));
    });
    
    return Array.from(resourceMap.entries()).map(([resourceId, amount]) => ({
      resourceId,
      amount
    }));
  }
  
  /**
   * Calculate population growth/decline [web:17]
   */
  private static calculatePopulationChange(
    stats: CountryStats,
    foodBalance: number
  ): number {
    const baseGrowth = stats.population * ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE;
    
    // Food surplus bonus
    const foodBonus = foodBalance > 0 
      ? Math.floor(foodBalance / 100) * ECONOMIC_BALANCE.POPULATION.FOOD_SURPLUS_GROWTH_BONUS * stats.population
      : 0;
    
    // Starvation penalty
    const foodRatio = foodBalance / (stats.population / 10000 * ECONOMIC_BALANCE.CONSUMPTION.FOOD_PER_10K_POPULATION);
    const starvationPenalty = foodRatio < ECONOMIC_BALANCE.POPULATION.STARVATION_THRESHOLD
      ? Math.floor(stats.population * 0.03) // 3% decline
      : 0;
    
    const totalGrowth = baseGrowth + foodBonus - starvationPenalty;
    const cappedGrowth = Math.min(
      totalGrowth,
      stats.population * ECONOMIC_BALANCE.POPULATION.GROWTH_CAP_MULTIPLIER * ECONOMIC_BALANCE.POPULATION.GROWTH_RATE_BASE
    );
    
    return Math.floor(cappedGrowth);
  }
  
  /**
   * Save economic updates to database
   */
  private static async saveEconomicUpdates(
    supabase: Database,
    countryId: string,
    updates: {
      budgetChange: number;
      resources: ResourceAmount[];
      populationChange: number;
      stats: CountryStats;
    }
  ): Promise<void> {
    const newBudget = (updates.stats.budget || 0) + updates.budgetChange;
    const newPopulation = updates.stats.population + updates.populationChange;
    
    await supabase
      .from('country_stats')
      .update({
        budget: newBudget,
        population: newPopulation,
        resources: updates.resources,
        updated_at: new Date().toISOString()
      })
      .eq('country_id', countryId);
  }
  
  private static parseResources(resources: any): ResourceAmount[] {
    if (Array.isArray(resources)) return resources;
    if (typeof resources === 'object') {
      return Object.entries(resources).map(([resourceId, amount]) => ({
        resourceId,
        amount: Number(amount)
      }));
    }
    return [];
  }
  
  private static getResourceAmount(resources: ResourceAmount[], resourceId: string): number {
    return resources.find(r => r.resourceId === resourceId)?.amount || 0;
  }
}
```

***

## 6. Database Schema Updates

### Migration File

```sql
-- migrations/add_economic_system.sql

-- Add infrastructure_level column if it doesn't exist
ALTER TABLE country_stats 
ADD COLUMN IF NOT EXISTS infrastructure_level INTEGER DEFAULT 0;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_country_stats_economic 
ON country_stats(country_id, budget, population);

-- Ensure resources column is JSONB for flexibility
ALTER TABLE country_stats 
ALTER COLUMN resources TYPE JSONB USING resources::JSONB;

-- Add economic events table for tracking
CREATE TABLE IF NOT EXISTS economic_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  country_id UUID REFERENCES countries(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- 'budget_update', 'resource_production', 'population_change'
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_economic_events_country_turn 
ON economic_events(country_id, turn_number DESC);
```

***

## 7. Integration with TurnProcessor

### Update TurnProcessor.ts 

```typescript
// lib/game/TurnProcessor.ts

import { EconomicEngine } from './EconomicEngine';

export class TurnProcessor {
  async processTurn(gameId: string): Promise<void> {
    // ... existing code ...
    
    // Add economic processing BEFORE action resolution
    await this.processEconomicPhase(gameId);
    
    // ... rest of turn processing ...
  }
  
  private async processEconomicPhase(gameId: string): Promise<void> {
    const countries = await this.getGameCountries(gameId);
    
    for (const country of countries) {
      const stats = await this.getCountryStats(country.id);
      const activeDealsValue = await this.calculateActiveDealsValue(country.id);
      
      const economicResult = await EconomicEngine.processEconomicTurn(
        this.supabase,
        country,
        stats,
        activeDealsValue
      );
      
      // Log economic events
      await this.logEconomicEvents(gameId, country.id, economicResult);
    }
  }
  
  private async calculateActiveDealsValue(countryId: string): number {
    // Calculate total value of active trade deals
    const deals = await this.supabase
      .from('deals')
      .select('*')
      .or(`proposer_id.eq.${countryId},receiver_id.eq.${countryId}`)
      .eq('status', 'active');
    
    // Calculate deal value (implement based on deal terms)
    return deals.data?.reduce((total, deal) => {
      // Add logic to calculate trade value
      return total;
    }, 0) || 0;
  }
}
```

***

## 8. Testing Requirements

### Unit Tests to Implement

```typescript
// __tests__/game/EconomicEngine.test.ts

describe('EconomicEngine', () => {
  test('calculates budget with technology bonus', () => {
    // Test budget calculation with different tech levels
  });
  
  test('produces resources based on population', () => {
    // Test resource production formulas
  });
  
  test('applies resource decay correctly', () => {
    // Test food spoilage and other decay
  });
  
  test('population grows with food surplus', () => {
    // Test population growth mechanics
  });
  
  test('population declines with food shortage', () => {
    // Test starvation mechanics
  });
  
  test('infrastructure increases production', () => {
    // Test infrastructure multipliers
  });
});

// __tests__/game/ResourceProduction.test.ts
// __tests__/game/BudgetCalculator.test.ts
```

***

## 9. UI Components to Create

### Resource Display Component

```tsx
// components/ResourceDisplay.tsx

interface ResourceDisplayProps {
  resources: ResourceAmount[];
  production: ProductionOutput;
}

export function ResourceDisplay({ resources, production }: ResourceDisplayProps) {
  // Display current resources, production rates, consumption
  // Group by category (Basic, Strategic, Industrial, Economic)
  // Show trends (increasing/decreasing)
}
```

### Budget Panel Component

```tsx
// components/BudgetPanel.tsx

interface BudgetPanelProps {
  breakdown: BudgetBreakdown;
}

export function BudgetPanel({ breakdown }: BudgetPanelProps) {
  // Display revenue sources
  // Display expense categories
  // Show net budget
  // Visual indicators for surplus/deficit
}
```

***

## 10. Balance Tuning

### Testing Checklist
- [ ] A country with 100k population should generate ~500 budget/turn at tech level 0
- [ ] Food production should support population with small surplus
- [ ] Technology level 3 should provide ~2.2x production boost 
- [ ] Infrastructure level 5 should provide ~75% production boost
- [ ] Resources should have meaningful scarcity (not all abundant)
- [ ] Military upkeep should be significant cost (10-20% of budget)
- [ ] Population should double every ~35 turns with good food
- [ ] Budget deficit should be possible but recoverable

### Balance Iteration
1. Implement with initial values
2. Run 100-turn simulation
3. Chart budget/population/resources over time
4. Adjust ECONOMIC_BALANCE constants
5. Re-test until curves feel right

***

## 11. Future Expansions (Not for Initial Implementation)

- Resource deposits on map tiles 
- Trade routes between countries 
- Resource market with dynamic pricing 
- Infrastructure building actions
- Resource conversion (e.g., iron → steel)
- Environmental effects on production
- Resource-specific storage limits
- Import/export tariffs

***

## Implementation Priority Order

1. **Day 1**: ResourceTypes.ts + EconomicBalance.ts (foundation)
2. **Day 1-2**: ResourceProduction.ts (core production logic)
3. **Day 2**: BudgetCalculator.ts (budget mechanics)
4. **Day 3**: EconomicEngine.ts (orchestration)
5. **Day 3**: Database migration + TurnProcessor integration
6. **Day 4**: Unit tests + balance testing
7. **Day 4-5**: UI components (ResourceDisplay, BudgetPanel)
8. **Day 5**: End-to-end testing + balance tuning

***

## Success Criteria

✅ Countries generate budget each turn based on population/tech  
✅ 16 resource types are tracked and updated  
✅ Resources accumulate from production formulas  
✅ Resources are consumed by population  
✅ Technology provides meaningful multipliers  
✅ Infrastructure affects production  
✅ Population grows with food surplus, declines with shortage  
✅ Budget shows revenue/expense breakdown  
✅ All calculations persist to database  
✅ System is modular and testable  
✅ Easy to add new resource types  

***

## Notes for Cursor Agent

- Use **strict TypeScript** with proper interfaces
- **Export all functions** for testing
- Add **JSDoc comments** for complex formulas
- Use **const** for balance values (imported from EconomicBalance)
- **No hardcoded magic numbers** in logic files
- Log economic events for debugging
- Handle edge cases (negative budgets, zero population, etc.)
- Make formulas **easily tweakable** without code changes
- Follow existing project patterns for database queries
- Add error handling for database operations

This system is designed to be **simple initially but infinitely expandable** - you can add new resources, production methods, and economic mechanics without rewriting core logic.