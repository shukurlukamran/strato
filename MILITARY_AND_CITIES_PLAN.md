
 # Military Actions & Cities System - Implementation Plan

## Overview
This document outlines the complete implementation plan for adding military actions (attack/defend) and cities to the strategy game. The system will allow countries to capture neighboring cities through military actions, with AI making strategic defense decisions.

---

## 1. Cities System

### 1.1 Data Structure

#### City Type Definition
```typescript
// src/types/city.ts
export interface City {
  id: string;
  countryId: string;
  gameId: string;
  name: string;
  
  // Visual properties
  positionX: number;
  positionY: number;
  size: number; // Relative size (0.5 - 2.0)
  borderPath: string; // SVG path defining city borders
  
  // Economic properties
  perTurnResources: Record<string, number>; // e.g., { oil: 5, gems: 2, coal: 3 }
  population: number;
  
  // State
  isUnderAttack?: boolean;
  createdAt: string;
}

export interface CityStats {
  cityId: string;
  totalValue: number; // Calculated value for deal/attack decisions
  resourceDiversity: number; // Number of different resource types
}
```

#### Database Schema
```sql
-- Add to migrations
CREATE TABLE cities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position_x FLOAT NOT NULL,
  position_y FLOAT NOT NULL,
  size FLOAT NOT NULL DEFAULT 1.0,
  border_path TEXT NOT NULL,
  per_turn_resources JSONB NOT NULL DEFAULT '{}',
  population INTEGER NOT NULL DEFAULT 0,
  is_under_attack BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT cities_game_fk FOREIGN KEY (game_id) REFERENCES games(id),
  CONSTRAINT cities_country_fk FOREIGN KEY (country_id) REFERENCES countries(id)
);

CREATE INDEX idx_cities_country ON cities(country_id);
CREATE INDEX idx_cities_game ON cities(game_id);
```

### 1.2 City Generation

#### Algorithm for City Creation
- **Count per country**: 6-15 cities based on territory size
- **Size variation**: Random sizes between 0.6x and 1.8x base size
- **Shape variation**: Use Voronoi subdivision with noise for organic shapes
- **Resource distribution**:
  - Distribute country's total resources proportionally by city size
  - Add small random variations (±10%) for realism
  - Ensure sum of all cities equals country total
- **Population distribution**: Similar to resources, proportional by size

#### Implementation
```typescript
// src/lib/game-engine/CityGenerator.ts
export class CityGenerator {
  static generateCitiesForCountry(
    country: Country,
    stats: CountryStats,
    territoryPath: string,
    existingCities: City[]
  ): City[] {
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
    
    // 7. Create city objects
    return positions.map((pos, i) => ({
      id: crypto.randomUUID(),
      countryId: country.id,
      gameId: country.gameId,
      name: names[i],
      positionX: pos.x,
      positionY: pos.y,
      size: sizes[i],
      borderPath: borders[i],
      perTurnResources: distributions[i].resources,
      population: distributions[i].population,
      createdAt: new Date().toISOString(),
    }));
  }
  
  private static calculateCityCount(territoryPath: string): number {
    const area = this.calculatePathArea(territoryPath);
    // Map area to 6-15 cities
    const minCities = 6;
    const maxCities = 15;
    const minArea = 50; // Rough estimate for smallest countries
    const maxArea = 500; // Rough estimate for largest countries
    
    const normalized = (area - minArea) / (maxArea - minArea);
    const count = Math.floor(minCities + normalized * (maxCities - minCities));
    return Math.max(minCities, Math.min(maxCities, count));
  }
  
  private static distributeResources(
    totalResources: Record<string, number>,
    totalPopulation: number,
    sizes: number[]
  ): Array<{ resources: Record<string, number>, population: number }> {
    const totalSize = sizes.reduce((a, b) => a + b, 0);
    
    return sizes.map(size => {
      const proportion = size / totalSize;
      
      // Distribute each resource
      const resources: Record<string, number> = {};
      for (const [resource, total] of Object.entries(totalResources)) {
        resources[resource] = Math.floor(total * proportion);
      }
      
      const population = Math.floor(totalPopulation * proportion);
      
      return { resources, population };
    });
  }
}
```

### 1.3 City Visualization

#### Map Updates
- Display city borders within country territories
- Different stroke for city borders (thinner, dashed)
- City names shown on hover/click
- Capital city indicator (star icon)
- Interactive click to show tooltip with details

#### City Tooltip
```typescript
// src/components/game/CityTooltip.tsx
interface CityTooltipProps {
  city: City;
  canAttack: boolean; // Is it a neighboring enemy city?
  onAttack?: () => void;
  onClose: () => void;
}

// Shows:
// - City name
// - Current owner
// - Population
// - Per-turn resources (icons + numbers)
// - Attack button (if applicable)
// - City size/area
```

---

## 2. Military Actions System

### 2.1 Action Types

#### Attack Action Structure
```typescript
// Update src/types/actions.ts
export interface MilitaryActionData {
  subType: "recruit" | "attack" | "defend" | "fortify";
  
  // For attack/defend
  targetCityId?: string;
  allocatedStrength?: number; // Military strength committed
  attackerId?: string; // Country initiating attack
  defenderId?: string; // Country defending
  
  // For recruit
  amount?: number;
  cost?: number;
  
  // Results (filled after resolution)
  result?: {
    success: boolean;
    attackerLosses: number;
    defenderLosses: number;
    cityTransferred: boolean;
    capturedCityId?: string;
  };
}
```

### 2.2 Attack Mechanics

#### Eligibility Rules
1. **Target Selection**:
   - Can only attack neighboring cities (cities that share a border with attacker's territory)
   - Cannot attack own cities
   - Cannot attack if already at war with country (one attack per country per turn)

2. **Resource Requirements**:
   - Must have minimum military strength (e.g., 50 points)
   - Costs budget: base cost + per-strength allocation cost
   - Attack cost: 100 budget + (10 budget per strength point allocated)

#### Attack Initiation Flow
1. Player clicks on enemy neighboring city
2. City tooltip shows with "Attack" button
3. Click "Attack" → Opens attack modal
4. Attack modal shows:
   - City details (what you're trying to capture)
   - Slider: Allocate military strength (10% - 100% of current strength)
   - Cost display (updates with slider)
   - Success probability estimate (based on your strength vs defender's total)
   - "Confirm Attack" button

5. On confirm:
   - Create attack action with status "pending"
   - If target is AI → Immediately trigger AI defense decision
   - If target is player → Wait for their defense decision
   - Mark city as "under attack"

### 2.3 Defense Mechanics

#### Defense Decision Flow
1. **For Player Defense**:
   - Notification: "Your city [X] is under attack!"
   - Defense modal shows:
     - Attacking country
     - City being attacked
     - Slider: Allocate military strength for defense (10% - 100%)
     - Estimated success probability
     - "Defend" button
   
2. **For AI Defense**:
   - Automatically triggered when AI city is attacked
   - AI uses LLM or rules to decide defense allocation
   - Decision factors:
     - City value (resources + population)
     - Total military strength available
     - Strategic importance (capital city = higher priority)
     - Personality (aggressive AI = defend more heavily)

#### AI Defense Decision System
```typescript
// src/lib/ai/DefenseAI.ts
export class DefenseAI {
  /**
   * Decide how much military strength to allocate for defense
   * @param attackerStrength - UNKNOWN to AI (hidden for fairness)
   */
  static async decideDefenseAllocation(
    state: GameStateSnapshot,
    defendingCountryId: string,
    targetCityId: string,
    attackingCountryId: string,
    useLLM: boolean = true
  ): Promise<number> {
    const city = await getCity(targetCityId);
    const defenderStats = state.countryStatsByCountryId[defendingCountryId];
    const attackerStats = state.countryStatsByCountryId[attackingCountryId];
    
    if (useLLM) {
      // Use LLM for strategic decision
      return this.llmDefenseDecision(
        city,
        defenderStats,
        attackerStats,
        state
      );
    } else {
      // Use rule-based decision
      return this.ruleBasedDefenseDecision(
        city,
        defenderStats,
        attackerStats
      );
    }
  }
  
  private static ruleBasedDefenseDecision(
    city: City,
    defenderStats: CountryStats,
    attackerStats: CountryStats
  ): number {
    // Calculate city value
    const cityValue = this.calculateCityValue(city);
    const totalDefenderStrength = defenderStats.militaryStrength;
    
    // Estimate attacker's likely allocation (they'll probably use 30-70%)
    const estimatedAttackerAllocation = 
      MilitaryCalculator.calculateEffectiveMilitaryStrength(attackerStats) * 0.5;
    
    // Defense strategy:
    // - High-value cities: defend with 60-80% of strength
    // - Medium-value cities: defend with 40-60% of strength
    // - Low-value cities: defend with 20-40% of strength
    
    const valueRatio = cityValue / this.calculateTotalCountryValue(defenderStats);
    const baseAllocation = 0.2 + (valueRatio * 0.6);
    
    // Adjust based on attacker's total strength
    const strengthRatio = attackerStats.militaryStrength / defenderStats.militaryStrength;
    const adjustment = strengthRatio > 1.5 ? 0.2 : 0; // Commit more if outmatched
    
    const finalAllocation = Math.min(0.9, baseAllocation + adjustment);
    return Math.floor(totalDefenderStrength * finalAllocation);
  }
  
  private static async llmDefenseDecision(
    city: City,
    defenderStats: CountryStats,
    attackerStats: CountryStats,
    state: GameStateSnapshot
  ): Promise<number> {
    // Prompt for LLM
    const prompt = `
You are defending your city "${city.name}" from an attack by another country.

YOUR COUNTRY:
- Total Military Strength: ${defenderStats.militaryStrength}
- Budget: ${defenderStats.budget}
- Technology Level: ${defenderStats.technologyLevel}

CITY UNDER ATTACK:
- Name: ${city.name}
- Population: ${city.population}
- Resources per turn: ${JSON.stringify(city.perTurnResources)}

ATTACKER:
- Total Military Strength: ${attackerStats.militaryStrength}
- Technology Level: ${attackerStats.technologyLevel}
Note: You do NOT know how much strength they allocated for this attack.

DECISION:
You must decide what percentage of your military strength to allocate for defense (10% - 100%).
Consider:
1. The value of this city (resources and population)
2. Your total military strength vs the attacker's
3. The risk of losing too much military strength
4. Whether you have other cities that might also be attacked

Respond with ONLY a number between 10 and 100 representing the percentage.
    `.trim();
    
    // Call LLM API
    const response = await callLLM(prompt);
    const percentage = parseInt(response.trim());
    
    // Validate and calculate
    const validPercentage = Math.max(10, Math.min(100, percentage || 50));
    return Math.floor(defenderStats.militaryStrength * (validPercentage / 100));
  }
}
```

### 2.4 Combat Resolution

#### Resolution Timing
**Decision: End-of-Turn Resolution**
- Reasons:
  - Allows all players to make decisions simultaneously
  - Prevents real-time advantage for players who are online
  - Fits turn-based game flow
  - Allows for strategic planning (multiple attacks can be coordinated)
  
- Process:
  1. All attack actions submitted during turn
  2. All defense decisions made (or auto-resolved for AI)
  3. At turn end, resolve all combats
  4. Update city ownership
  5. Apply military losses
  6. Log results in history

#### Combat Calculation
```typescript
// src/lib/game-engine/CombatResolver.ts
export class CombatResolver {
  static resolveCombat(
    attackerStrength: number,
    defenderStrength: number,
    attackerStats: CountryStats,
    defenderStats: CountryStats
  ): {
    attackerWins: boolean;
    attackerLosses: number;
    defenderLosses: number;
  } {
    // Calculate effective strengths (with tech bonuses)
    const attackerEffective = this.calculateEffectiveStrength(
      attackerStrength,
      attackerStats.technologyLevel
    );
    const defenderEffective = this.calculateEffectiveStrength(
      defenderStrength,
      defenderStats.technologyLevel
    );
    
    // Add defense bonus (defenders have terrain advantage)
    const defenseBonus = 1.2; // 20% bonus for defender
    const adjustedDefender = defenderEffective * defenseBonus;
    
    // Calculate strength ratio
    const ratio = attackerEffective / adjustedDefender;
    
    // Determine winner (with some randomness for unpredictability)
    const baseChance = this.strengthRatioToWinChance(ratio);
    const random = Math.random();
    const attackerWins = random < baseChance;
    
    // Calculate losses (both sides lose troops)
    // Loser loses more
    let attackerLosses: number;
    let defenderLosses: number;
    
    if (attackerWins) {
      // Attacker wins: loses 20-40% of allocated strength
      attackerLosses = Math.floor(
        attackerStrength * (0.2 + Math.random() * 0.2)
      );
      // Defender loses 40-70% of allocated strength
      defenderLosses = Math.floor(
        defenderStrength * (0.4 + Math.random() * 0.3)
      );
    } else {
      // Defender wins: attacker loses 50-80%
      attackerLosses = Math.floor(
        attackerStrength * (0.5 + Math.random() * 0.3)
      );
      // Defender loses 20-40%
      defenderLosses = Math.floor(
        defenderStrength * (0.2 + Math.random() * 0.2)
      );
    }
    
    return {
      attackerWins,
      attackerLosses,
      defenderLosses,
    };
  }
  
  private static strengthRatioToWinChance(ratio: number): number {
    // Convert ratio to win probability using sigmoid-like function
    // ratio = 1.0 → 50% chance (equal strength)
    // ratio = 2.0 → 80% chance
    // ratio = 0.5 → 20% chance
    
    if (ratio >= 3.0) return 0.95; // Cap at 95%
    if (ratio <= 0.33) return 0.05; // Floor at 5%
    
    // Sigmoid function: 1 / (1 + e^(-k * (x - 1)))
    const k = 2.5; // Steepness
    return 1 / (1 + Math.exp(-k * (ratio - 1)));
  }
  
  private static calculateEffectiveStrength(
    baseStrength: number,
    techLevel: number
  ): number {
    // Tech provides 10% bonus per level
    const techMultiplier = 1 + (techLevel * 0.1);
    return baseStrength * techMultiplier;
  }
}
```

### 2.5 City Transfer

#### Transfer Process
When a city is captured:
1. Update city's `countryId` to winner
2. Recalculate country stats:
   - Winner gains: city's resources, population
   - Loser loses: city's resources, population
3. Update map visualization (city changes color)
4. Check if defender lost all cities (elimination condition)
5. Log event in history

```typescript
// src/lib/game-engine/CityTransfer.ts
export class CityTransfer {
  static async transferCity(
    city: City,
    fromCountryId: string,
    toCountryId: string,
    gameState: GameState
  ): Promise<void> {
    // 1. Update city ownership
    await updateCityOwner(city.id, toCountryId);
    
    // 2. Update country stats
    const fromStats = gameState.data.countryStatsByCountryId[fromCountryId];
    const toStats = gameState.data.countryStatsByCountryId[toCountryId];
    
    // Remove from original owner
    const updatedFromStats = {
      ...fromStats,
      population: fromStats.population - city.population,
      resources: this.subtractResources(fromStats.resources, city.perTurnResources),
    };
    
    // Add to new owner
    const updatedToStats = {
      ...toStats,
      population: toStats.population + city.population,
      resources: this.addResources(toStats.resources, city.perTurnResources),
    };
    
    gameState.withUpdatedStats(fromCountryId, updatedFromStats);
    gameState.withUpdatedStats(toCountryId, updatedToStats);
    
    // 3. Check for elimination
    const remainingCities = await getCitiesByCountry(fromCountryId);
    if (remainingCities.length === 0) {
      await this.eliminateCountry(fromCountryId, toCountryId, gameState);
    }
  }
  
  private static async eliminateCountry(
    eliminatedId: string,
    victorId: string,
    gameState: GameState
  ): Promise<void> {
    // Transfer all remaining assets to victor
    // Mark country as eliminated
    // Log in history
    // Check win condition (only 1 country remaining?)
  }
}
```

---

## 3. UI/UX Implementation

### 3.1 Map Enhancements

#### City Layer
- Render cities on top of country territories
- Show city borders with lighter, dashed strokes
- City names visible at medium zoom levels
- Highlight neighboring enemy cities on hover (potential targets)
- Visual indicator for cities under attack (pulsing red border)

#### Interactive Elements
```typescript
// Update src/components/game/Map.tsx
interface MapProps {
  countries: Country[];
  cities: City[];
  selectedCity: City | null;
  onCityClick: (city: City) => void;
}

// Add city click handlers
// Show city tooltip on click
// Display attack button for valid targets
```

### 3.2 Attack Modal

```typescript
// src/components/game/AttackModal.tsx
interface AttackModalProps {
  targetCity: City;
  attackerCountry: Country;
  attackerStats: CountryStats;
  defenderCountry: Country;
  defenderStats: CountryStats;
  onConfirm: (allocatedStrength: number) => void;
  onCancel: () => void;
}

// Features:
// - City preview (name, resources, population)
// - Strength allocation slider (10% - 100%)
// - Real-time cost calculation
// - Success probability estimate
// - Warning if allocation is too low/high
// - Confirm button with loading state
```

### 3.3 Defense Modal

```typescript
// src/components/game/DefenseModal.tsx
interface DefenseModalProps {
  defendingCity: City;
  attackerCountry: Country;
  defenderStats: CountryStats;
  onConfirm: (allocatedStrength: number) => void;
}

// Similar to attack modal but from defender's perspective
// Does not show attacker's allocated strength (hidden until resolution)
```

### 3.4 Action Panel Updates

Add new "Military" section to action panel:
- "Attack City" button (disabled if no valid targets)
- Shows available targets count
- Visual indicator for cities under attack
- Pending attack actions list

---

## 4. AI Integration

### 4.1 AI Attack Decisions

#### When AI Attacks
- AI can attack neighboring player or AI cities
- Decision factors:
  - Strategic intent (aggressive AI attacks more)
  - City value (high-value cities are priority targets)
  - Military strength advantage
  - Budget available for attack
  - Risk assessment

#### AI vs AI Attacks
**Decision: Use Rule-Based System**
- Reasons:
  - Faster resolution (no API calls)
  - More predictable behavior
  - Reduces costs
  - LLM not needed when player isn't involved
  
- Process:
  1. AI evaluates potential targets each turn
  2. Calculates value/risk ratio for each target
  3. If ratio exceeds threshold, initiates attack
  4. Both attacker and defender use rule-based allocation
  5. Combat resolves at turn end

#### AI vs Player (AI Attacks)
**Decision: Use LLM for Strategic Decision**
- LLM decides whether to attack
- LLM decides which city to target
- LLM decides strength allocation
- Provides more dynamic, unpredictable gameplay

#### AI vs Player (Player Attacks)
**Decision: Use LLM for Defense**
- Makes defense feel more intelligent
- AI doesn't know player's allocation (fair)
- Creates narrative moments in gameplay

### 4.2 LLM Integration

```typescript
// src/lib/ai/MilitaryAI.ts - Update
export class MilitaryAI {
  /**
   * Decide whether to attack and which city to target
   */
  static async decideAttack(
    state: GameStateSnapshot,
    countryId: string,
    intent: StrategyIntent,
    useLLM: boolean
  ): Promise<GameAction | null> {
    const neighboringCities = await this.getAttackableNeighboringCities(
      countryId,
      state
    );
    
    if (neighboringCities.length === 0) return null;
    
    if (useLLM && this.shouldUseLLMForAttack(state, countryId)) {
      return this.llmAttackDecision(state, countryId, neighboringCities);
    } else {
      return this.ruleBasedAttackDecision(state, countryId, neighboringCities);
    }
  }
  
  private static shouldUseLLMForAttack(
    state: GameStateSnapshot,
    countryId: string
  ): boolean {
    // Use LLM if:
    // - Attacking a player-controlled country
    // - Major strategic decision (high-value target)
    // - Once per every N turns to add variety
    
    const hasPlayerTarget = this.hasPlayerNeighbor(state, countryId);
    return hasPlayerTarget;
  }
}
```

---

## 5. History & Logging

### 5.1 History Event Types

Add new event types:
```typescript
// src/types/game.ts
export interface HistoryEvent {
  id: string;
  gameId: string;
  turn: number;
  eventType: "attack" | "city_captured" | "city_defended" | "country_eliminated" | ...existing;
  eventData: {
    attackerId?: string;
    defenderId?: string;
    cityId?: string;
    cityName?: string;
    attackerLosses?: number;
    defenderLosses?: number;
    success?: boolean;
    newOwnerId?: string;
  };
  createdAt: string;
}
```

### 5.2 History Log Display

Update HistoryLog component:
- Icon for military events (⚔️)
- Detailed message formatting:
  - "🗡️ [Country A] attacked [City X] of [Country B]"
  - "⚔️ Battle for [City X]: [Country A] captured the city! Losses: Attacker -50, Defender -80"
  - "🛡️ [Country B] successfully defended [City X] against [Country A]"
  - "💀 [Country C] has been eliminated by [Country A]!"

---

## 6. Balance & Fairness

### 6.1 Attack Costs & Risks
- **Attack Cost**: 100 budget + 10 budget per strength point allocated
- **Risk of Failure**: Even with superior strength, attacks can fail (randomness)
- **Losses**: Both sides lose military strength (winner loses less)
- **Defender Advantage**: 20% bonus to defense to prevent aggressive spamming

### 6.2 City Value Calculation
```typescript
function calculateCityValue(city: City): number {
  let value = 0;
  
  // Population value: 1 point per 1000 population
  value += city.population / 1000;
  
  // Resource value: weighted by resource type
  for (const [resource, amount] of Object.entries(city.perTurnResources)) {
    const weight = RESOURCE_VALUES[resource] || 10;
    value += amount * weight;
  }
  
  return value;
}
```

### 6.3 AI Fairness
- **Hidden Information**: AI doesn't know player's attack allocation
- **Consistent Rules**: Same combat formula for all participants
- **No Cheating**: AI can't see future or player intentions
- **Personality Variation**: Different AI personalities = different strategies

---

## 7. Implementation Phases

### Phase 1: Cities Foundation
1. Create `City` type and database schema
2. Implement `CityGenerator` class
3. Update country initialization to generate cities
4. Display cities on map (basic visualization)
5. Add city tooltip with basic info

**Testing**: Verify cities are generated correctly, sum to country totals

### Phase 2: City Interaction
1. Implement city click handlers
2. Add city detail tooltip
3. Implement neighbor detection algorithm
4. Add "Attack" button to tooltip for valid targets
5. Visual indicators for attack eligibility

**Testing**: Verify neighboring cities are correctly identified

### Phase 3: Attack System
1. Create attack action type
2. Implement attack modal UI
3. Add strength allocation slider
4. Implement attack submission
5. Mark cities under attack

**Testing**: Test attack action creation and validation

### Phase 4: Defense System
1. Create defense action type
2. Implement defense modal UI
3. Add AI defense decision logic (rule-based first)
4. Implement automatic AI defense triggering
5. Test player defense flow

**Testing**: Test both player and AI defense decisions

### Phase 5: Combat Resolution
1. Implement `CombatResolver` class
2. Add combat resolution to turn processor
3. Implement city transfer logic
4. Update country stats after transfers
5. Handle country elimination

**Testing**: Test combat with various strength ratios, verify fairness

### Phase 6: Map Updates
1. Update map to reflect city ownership changes
2. Add visual effects for captured cities
3. Smooth color transitions
4. Update borders dynamically
5. Add battle animations (optional)

**Testing**: Verify map updates correctly after combat

### Phase 7: LLM Integration
1. Implement LLM defense decision
2. Implement LLM attack decision
3. Add strategic context to prompts
4. Test AI vs Player scenarios
5. Fine-tune prompts for better decisions

**Testing**: Verify LLM makes reasonable decisions

### Phase 8: History & Polish
1. Add military events to history log
2. Implement detailed event messages
3. Add battle summary notifications
4. Polish UI/UX based on playtesting
5. Balance tweaking (costs, losses, success rates)

**Testing**: Full gameplay testing with multiple countries

---

## 8. Future Enhancements (Post-MVP)

### Additional Military Actions
- **Fortify**: Strengthen a city's defenses for N turns
- **Raid**: Quick attack for resources without capturing
- **Siege**: Multi-turn attacks for heavily defended cities
- **Naval/Air Support**: If you add military types later

### Advanced City Features
- **City Specialization**: Military cities, economic cities, etc.
- **City Upgrades**: Fortifications, production bonuses
- **City Happiness**: Affects productivity and loyalty
- **Rebellion**: Captured cities might rebel back

### Diplomacy Integration
- **War Declarations**: Formal war before attacking
- **Peace Treaties**: End wars with negotiated terms
- **Alliances**: Coordinate attacks with allies
- **War Exhaustion**: Penalties for prolonged warfare

### Strategic Depth
- **Supply Lines**: Cities need connection to capital
- **Attrition**: Military loses strength when far from home
- **Terrain Effects**: Mountains, rivers affect combat
- **Seasons**: Weather impacts military effectiveness

---

## 9. Technical Considerations

### Performance
- Cities increase data size significantly
- Consider lazy loading city details
- Optimize map rendering with city layers
- Cache city neighbor calculations

### Database
- Index city queries by country and game
- Consider city history table for tracking ownership changes
- Efficient querying for neighbor detection

### Real-time Updates
- City ownership changes need to propagate to all clients
- Consider WebSocket updates for live games
- Or polling for turn-based games

### Testing Strategy
- Unit tests for combat resolution
- Integration tests for city transfers
- E2E tests for full attack flow
- Balance testing with simulations

---

## 10. Open Questions & Decisions Needed

1. **Multiple Attacks per Turn**: Can a country attack multiple cities in one turn?
   - **Recommendation**: Yes, but each attack costs budget and allocates strength (limited by total strength)

2. **Counter-Attacks**: Can defender immediately counter-attack?
   - **Recommendation**: Not in same turn, but next turn yes

3. **City Conquest Requirements**: Must capture all cities to eliminate country?
   - **Recommendation**: Yes, complete elimination

4. **Capital Cities**: Should one city be designated as capital (higher value/harder to capture)?
   - **Recommendation**: Yes, add capital designation in Phase 2

5. **Retreat Option**: Can attacker retreat mid-combat?
   - **Recommendation**: No, combat is resolved at turn end (committed)

6. **Peace Negotiations**: Can countries negotiate peace after attack?
   - **Recommendation**: Future enhancement, not MVP

7. **City Deals**: Can cities be traded in deals?
   - **Recommendation**: Yes, already mentioned in plan (neighboring cities only)

---

## Summary

This plan provides a comprehensive foundation for military actions and cities:
- **Cities**: 6-15 per country, varied sizes, containing resources/population
- **Attacks**: Neighboring cities only, strength allocation, costs budget
- **Defense**: Player or AI decides allocation, LLM for AI vs Player
- **Combat**: End-of-turn resolution, randomness + strength ratio
- **Transfers**: City changes ownership, stats update, map reflects changes
- **AI**: Rule-based for AI vs AI, LLM for AI vs Player
- **History**: All events logged with detailed messages

The system is fair, balanced, and provides strategic depth while remaining simple enough to implement incrementally.
