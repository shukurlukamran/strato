# Comprehensive Stats System Analysis

## Table of Contents
1. [Core Stats Overview](#core-stats-overview)
2. [Budget System](#budget-system)
3. [Resource System](#resource-system)
4. [Population System](#population-system)
5. [Technology System](#technology-system)
6. [Infrastructure System](#infrastructure-system)
7. [Military System](#military-system)
8. [Actions System](#actions-system)
9. [Deals System](#deals-system)
10. [Turn Processing Flow](#turn-processing-flow)
11. [Interdependencies & Relationships](#interdependencies--relationships)

---

## Core Stats Overview

Each country tracks the following core statistics:

- **Population**: Base unit for economic calculations
- **Budget**: Treasury/credits available for actions
- **Technology Level**: Integer level (0-5+) affecting production and tax efficiency
- **Infrastructure Level**: Integer level (0+) affecting production and tax efficiency
- **Military Strength**: Integer value representing military power
- **Resources**: Record of resource stockpiles (food, water, timber, stone, iron, oil, rare_earth, gold, gems, coal, steel, aluminum, etc.)

---

## Budget System

### Revenue Sources

#### 1. Tax Revenue
**Formula:**
```
populationUnits = population / 10,000
baseTax = populationUnits × 5

techMultiplier = 1 + (technologyLevel × 0.15)
techMultiplier = min(techMultiplier, 3.0)  // Cap at 300%

infraMultiplier = 1 + (infrastructureLevel × 0.10)

taxRevenue = floor(baseTax × techMultiplier × infraMultiplier)
```

**Breakdown:**
- Base: 5 credits per 10k population
- Technology bonus: +15% per tech level (capped at 300% total)
- Infrastructure bonus: +10% per infrastructure level
- Example: 100k pop, Tech 2, Infra 1
  - Base: 10 × 5 = 50
  - Tech: 1 + (2 × 0.15) = 1.3
  - Infra: 1 + (1 × 0.10) = 1.1
  - Total: 50 × 1.3 × 1.1 = 71 credits

#### 2. Trade Revenue
**Formula:**
```
tradeRevenue = floor(activeDealsValue × 0.05)
```

**Breakdown:**
- 5% of total active trade deals value
- Currently uses placeholder value (100 per deal)
- Future: Will calculate actual deal value from resource/budget transfers

#### 3. Resource Revenue
**Formula:**
```
resourceRevenue = 0  // Placeholder - not yet implemented
```

**Future Implementation:**
- Revenue from selling excess resources on market
- Will use resource base values from ResourceRegistry

### Expenses

#### 1. Maintenance Cost
**Formula:**
```
maintenanceCost = floor(currentBudget × 0.05)
```

**Breakdown:**
- 5% of current treasury per turn
- Represents general administrative and operational costs
- Scales with wealth (richer countries pay more)

#### 2. Military Upkeep
**Formula:**
```
militaryUpkeep = militaryStrength × 2
```

**Breakdown:**
- 2 credits per military strength point
- Example: 50 strength = 100 credits/turn
- Directly proportional to military size

#### 3. Infrastructure Maintenance
**Formula:**
```
infrastructureCost = infrastructureLevel × 50
```

**Breakdown:**
- 50 credits per infrastructure level per turn
- Example: Level 3 = 150 credits/turn
- Higher infrastructure = higher maintenance

### Net Budget Calculation
```
netBudget = totalRevenue - totalExpenses
newBudget = currentBudget + netBudget
```

**Example Turn Calculation:**
- Population: 100,000
- Tech Level: 2
- Infra Level: 1
- Military Strength: 50
- Current Budget: 5,000
- Active Deals Value: 1,000

**Revenue:**
- Tax: 71
- Trade: 50 (1,000 × 0.05)
- Resource: 0
- **Total Revenue: 121**

**Expenses:**
- Maintenance: 250 (5,000 × 0.05)
- Military: 100 (50 × 2)
- Infrastructure: 50 (1 × 50)
- **Total Expenses: 400**

**Net Budget: -279** (deficit)
**New Budget: 4,721**

---

## Resource System

### Resource Production

Resources are produced each turn based on population, technology, and infrastructure.

#### Technology Multiplier
**Formula:**
```
techLevel = min(max(0, floor(technologyLevel)), 5)
techMultiplier = TECHNOLOGY[LEVEL_{techLevel}_MULTIPLIER]
```

**Multipliers by Level:**
- Level 0: 1.0x
- Level 1: 1.3x
- Level 2: 1.7x
- Level 3: 2.2x
- Level 4: 3.0x
- Level 5: 4.0x

#### Infrastructure Multiplier
**Formula:**
```
infraMultiplier = 1 + (infrastructureLevel × 0.15)
```

**Breakdown:**
- +15% per infrastructure level
- Example: Level 2 = 1.3x multiplier

#### Total Production Multiplier
```
totalMultiplier = techMultiplier × infraMultiplier
```

### Resource Types & Production

#### Basic Resources
**Food:**
```
populationUnits = population / 10,000
food = floor(populationUnits × 0.8 × totalMultiplier × 0.7)
```
- Base: 0.8 food per 10k pop
- Population efficiency: 70%
- Example: 100k pop, Tech 2, Infra 1
  - Units: 10
  - Multiplier: 1.7 × 1.15 = 1.955
  - Production: floor(10 × 0.8 × 1.955 × 0.7) = 10 food

**Water:**
```
water = floor(populationUnits × 0.5 × totalMultiplier)
```
- Base: 0.5 water per 10k pop

**Timber:**
```
timber = floor(10 × 0.8 × totalMultiplier)
```
- Base extraction rate: 10
- Efficiency: 80%

**Stone:**
```
stone = floor(10 × 0.6 × totalMultiplier)
```
- Base extraction rate: 10
- Efficiency: 60%

#### Strategic Resources
**Iron:**
```
iron = floor(10 × 0.7 × totalMultiplier)
```

**Oil:**
```
oil = floor(10 × 0.5 × totalMultiplier)
```

**Rare Earth:**
```
rare_earth = floor(10 × 0.3 × totalMultiplier)
```

#### Industrial Resources
**Coal:**
```
coal = floor(5 × 0.8 × totalMultiplier)
```

**Steel:**
```
steel = floor(5 × 0.5 × totalMultiplier)
```

**Aluminum:**
```
aluminum = floor(5 × 0.4 × totalMultiplier)
```

#### Economic Resources
**Gold:**
```
gold = floor(5 × 0.3 × totalMultiplier)
```

**Gems:**
```
gems = floor(3 × 0.2 × totalMultiplier)
```

### Resource Consumption

#### Food Consumption
**Formula:**
```
populationUnits = population / 10,000
foodConsumed = ceil(populationUnits × 5)
```

**Breakdown:**
- 5 food per 10k population per turn
- Example: 100k pop = 50 food consumed

### Resource Decay

Some resources decay over time if not consumed:

**Food:**
```
decayRate = 0.10  // 10% per turn
newAmount = floor(amount × (1 - 0.10))
```

**Water:**
```
decayRate = 0.05  // 5% per turn
```

**Other Resources:**
- Timber, stone, strategic, industrial, economic resources: No decay (0%)

### Resource Update Flow
```
1. Start with current stockpile
2. Add production
3. Subtract consumption
4. Apply decay
5. Final stockpile = result
```

**Example:**
- Current food: 100
- Produced: 10
- Consumed: 50
- After consumption: 60
- Decay (10%): floor(60 × 0.9) = 54
- **Final: 54 food**

---

## Population System

### Population Growth Calculation

**Formula:**
```
baseGrowth = population × 0.02  // 2% base growth

foodBonus = 0
if (foodBalance > 0):
    foodBonus = floor(foodBalance / 100) × 0.01 × population

starvationPenalty = 0
requiredFood = (population / 10,000) × 5
foodRatio = foodConsumed / requiredFood
if (foodRatio < 0.8):  // Below 80% threshold
    starvationPenalty = floor(population × 0.03)  // 3% decline

totalGrowth = baseGrowth + foodBonus - starvationPenalty

maxGrowth = population × 0.02 × 1.5  // Cap at 150% of base
cappedGrowth = min(totalGrowth, maxGrowth)

populationChange = floor(cappedGrowth)
newPopulation = population + populationChange
```

**Breakdown:**
- **Base Growth:** 2% per turn
- **Food Surplus Bonus:** +1% growth per 100 surplus food
- **Starvation Penalty:** -3% if food consumption < 80% of required
- **Growth Cap:** Maximum 150% of base growth (3% max)

**Example Scenarios:**

1. **Normal Growth (100k pop, adequate food):**
   - Base: 100,000 × 0.02 = 2,000
   - Food bonus: 0 (no surplus)
   - Penalty: 0
   - **Growth: +2,000**

2. **Surplus Food (100k pop, 500 surplus food):**
   - Base: 2,000
   - Food bonus: floor(500/100) × 0.01 × 100,000 = 5,000
   - Penalty: 0
   - Capped: min(7,000, 3,000) = 3,000
   - **Growth: +3,000**

3. **Starvation (100k pop, only 60% food met):**
   - Base: 2,000
   - Food bonus: 0
   - Penalty: floor(100,000 × 0.03) = 3,000
   - **Growth: -1,000** (decline)

---

## Technology System

### Technology Level Effects

Technology level affects multiple systems:

#### 1. Tax Revenue Multiplier
```
techTaxMultiplier = 1 + (technologyLevel × 0.15)
```
- +15% tax revenue per level
- Capped at 300% total (level 13+)

#### 2. Resource Production Multiplier
Uses discrete multipliers by level:
- Level 0: 1.0x
- Level 1: 1.3x (+30%)
- Level 2: 1.7x (+70%)
- Level 3: 2.2x (+120%)
- Level 4: 3.0x (+200%)
- Level 5: 4.0x (+300%)

### Technology Upgrade Cost

**Formula:**
```
cost = floor(1000 × 1.3^(currentLevel))
```

**Cost Progression:**
- Level 0→1: $1,000
- Level 1→2: $1,300
- Level 2→3: $1,690
- Level 3→4: $2,197
- Level 4→5: $2,856
- Level 5→6: $3,713

**Effect:** +1 Technology Level

---

## Infrastructure System

### Infrastructure Level Effects

#### 1. Tax Revenue Bonus
```
infraTaxBonus = 1 + (infrastructureLevel × 0.10)
```
- +10% tax revenue per level
- Multiplicative with technology bonus

#### 2. Resource Production Bonus
```
infraProductionBonus = 1 + (infrastructureLevel × 0.15)
```
- +15% resource production per level
- Multiplicative with technology multiplier

#### 3. Maintenance Cost
```
infrastructureCost = infrastructureLevel × 50
```
- 50 credits per level per turn

### Infrastructure Upgrade Cost

**Formula:**
```
cost = floor(800 × 1.25^(currentLevel))
```

**Cost Progression:**
- Level 0→1: $800
- Level 1→2: $1,000
- Level 2→3: $1,250
- Level 3→4: $1,563
- Level 4→5: $1,953
- Level 5→6: $2,441

**Effect:** +1 Infrastructure Level

---

## Military System

### Military Strength

**Current Value:** Integer representing total military power

### Military Recruitment

**Cost:** $500 (flat rate)
**Effect:** +10 Military Strength

**Example:**
- Current: 50 strength
- Cost: $500
- New: 60 strength

### Military Upkeep

**Formula:**
```
militaryUpkeep = militaryStrength × 2
```

**Breakdown:**
- 2 credits per strength point per turn
- Example: 100 strength = 200 credits/turn

### Military Equipment

Stored in `militaryEquipment` field (Record<string, unknown>)
- Currently placeholder structure
- Future: Will track specific equipment types and quantities

---

## Actions System

### Action Types

1. **Research** (`research`)
   - Upgrades technology level
   - Cost: Exponential (1000 × 1.3^level)
   - Effect: +1 Technology Level

2. **Infrastructure** (`economic` with `subType: "infrastructure"`)
   - Upgrades infrastructure level
   - Cost: Exponential (800 × 1.25^level)
   - Effect: +1 Infrastructure Level

3. **Military Recruitment** (`military` with `subType: "recruit"`)
   - Increases military strength
   - Cost: Flat $500
   - Effect: +10 Military Strength

### Action Execution Flow

```
1. Check if country has sufficient budget
2. If yes:
   - Deduct cost from budget
   - Apply stat change
   - Mark action as "executed"
3. If no:
   - Mark action as "failed"
```

### Action Costs Summary

| Action | Base Cost | Scaling | Level 0→1 | Level 5→6 |
|--------|-----------|---------|-----------|-----------|
| Research | $1,000 | 1.3x | $1,000 | $3,713 |
| Infrastructure | $800 | 1.25x | $800 | $2,441 |
| Military | $500 | Flat | $500 | $500 |

---

## Deals System

### Deal Types

Currently supports **Trade Deals** that can include:

1. **Resource Transfers**
   - Transfers resources between countries
   - Validates sufficient stockpile
   - Updates both countries' resources

2. **Budget Transfers**
   - Transfers credits between countries
   - Validates sufficient budget
   - Updates both countries' budgets

3. **Military Equipment Transfers** (Placeholder)
   - Not yet implemented

4. **Diplomatic Commitments** (Placeholder)
   - Not yet implemented

5. **Technology Boosts** (Placeholder)
   - Not yet implemented

6. **Action Commitments** (Placeholder)
   - Future actions (e.g., "no_attack")
   - No immediate transfer

### Deal Execution

**Flow:**
```
1. Fetch stats for both countries
2. Process proposer commitments (proposer → receiver)
3. Process receiver commitments (receiver → proposer)
4. Update database for both countries
```

### Trade Revenue Calculation

**Current Implementation:**
```
activeDealsValue = sum(100 for each active deal)  // Placeholder
tradeRevenue = activeDealsValue × 0.05
```

**Future:**
- Will calculate actual value from deal terms
- Sum of resource values + budget transfers

---

## Turn Processing Flow

### Turn Sequence

```
1. ECONOMIC PHASE (per country):
   a. Calculate resource production
   b. Calculate budget (revenue - expenses)
   c. Calculate resource consumption
   d. Update resources (production - consumption - decay)
   e. Calculate population change
   f. Save all updates to database

2. ACTION RESOLUTION PHASE:
   a. Process active deals
   b. Resolve pending actions
   c. Generate random events

3. TURN ADVANCEMENT:
   a. Mark actions as executed/failed
   b. Update stats in database
   c. Create stats snapshot for turn history
   d. Create stats for next turn (copy current)
   e. Increment game turn number
```

### Economic Phase Details

For each country:
1. **Resource Production:**
   - Calculate tech multiplier
   - Calculate infra multiplier
   - Produce all resource types
   - Apply multipliers

2. **Budget Calculation:**
   - Calculate tax revenue (population × tech × infra)
   - Calculate trade revenue (deals × 5%)
   - Calculate expenses (maintenance + military + infrastructure)
   - Net budget = revenue - expenses

3. **Resource Consumption:**
   - Calculate food consumption (population-based)
   - Subtract from stockpile

4. **Resource Decay:**
   - Apply decay rates (food: 10%, water: 5%)
   - Other resources: no decay

5. **Population Change:**
   - Base growth: 2%
   - Food surplus bonus
   - Starvation penalty
   - Apply cap

6. **Database Update:**
   - Save new budget
   - Save new population
   - Save updated resources
   - Preserve infrastructure level

### Action Resolution Phase

1. **Deal Processing:**
   - Check deal expiration
   - Execute deal terms (resource/budget transfers)
   - Generate deal events

2. **Action Resolution:**
   - For each pending action:
     - Check budget sufficiency
     - Apply stat changes
     - Deduct costs
     - Mark as executed/failed

3. **Event Generation:**
   - Random events (future: seeded RNG)
   - Deal events
   - Economic events

---

## Interdependencies & Relationships

### Stat Dependency Graph

```
POPULATION
  ├─→ Tax Revenue (base calculation)
  ├─→ Food Production (base calculation)
  ├─→ Food Consumption (direct consumption)
  └─→ Population Growth (self-referential)

TECHNOLOGY LEVEL
  ├─→ Tax Revenue (multiplier: +15% per level)
  ├─→ Resource Production (multiplier: 1.0x to 4.0x)
  └─→ Upgrade Cost (exponential: 1000 × 1.3^level)

INFRASTRUCTURE LEVEL
  ├─→ Tax Revenue (multiplier: +10% per level)
  ├─→ Resource Production (multiplier: +15% per level)
  ├─→ Maintenance Cost (50 credits per level)
  └─→ Upgrade Cost (exponential: 800 × 1.25^level)

MILITARY STRENGTH
  ├─→ Military Upkeep (2 credits per strength)
  └─→ Recruitment Cost (500 credits for +10 strength)

BUDGET
  ├─→ Maintenance Cost (5% of current budget)
  ├─→ Action Costs (research, infrastructure, military)
  └─→ Deal Transfers (can be sent/received)

RESOURCES
  ├─→ Food affects Population Growth
  ├─→ Resource Decay (food: 10%, water: 5%)
  └─→ Deal Transfers (can be sent/received)

DEALS
  ├─→ Trade Revenue (5% of deal value)
  ├─→ Resource Transfers (immediate)
  └─→ Budget Transfers (immediate)
```

### Key Relationships

1. **Population ↔ Budget:**
   - Population drives tax revenue
   - Budget funds actions that can affect population (indirectly)

2. **Technology ↔ Everything:**
   - Increases tax revenue
   - Multiplies resource production
   - Costs increase exponentially

3. **Infrastructure ↔ Economy:**
   - Boosts tax revenue
   - Boosts resource production
   - Costs maintenance

4. **Military ↔ Budget:**
   - Costs upkeep per strength
   - Recruitment costs fixed amount

5. **Food ↔ Population:**
   - Population consumes food
   - Food surplus boosts growth
   - Food shortage causes decline

6. **Budget ↔ Actions:**
   - All actions cost budget
   - Actions modify stats
   - Stats affect budget generation

### Feedback Loops

1. **Positive Growth Loop:**
   ```
   Population ↑ → Tax Revenue ↑ → Budget ↑ → Infrastructure/Technology ↑
   → Production ↑ → Food ↑ → Population Growth ↑
   ```

2. **Military Cost Loop:**
   ```
   Military Strength ↑ → Upkeep ↑ → Budget ↓ → Less for other actions
   ```

3. **Technology Investment Loop:**
   ```
   Technology ↑ → Production/Tax ↑ → Budget ↑ → More Technology Investment
   (but costs increase exponentially)
   ```

4. **Infrastructure Maintenance Loop:**
   ```
   Infrastructure ↑ → Production/Tax ↑ → Budget ↑
   Infrastructure ↑ → Maintenance Cost ↑ → Budget ↓
   (balance point exists)
   ```

### Optimization Considerations

1. **Technology vs Infrastructure:**
   - Technology: Higher multipliers, higher costs
   - Infrastructure: Lower multipliers, lower costs, maintenance
   - Optimal mix depends on current stats

2. **Military vs Economy:**
   - Military: Fixed recruitment cost, ongoing upkeep
   - Economy: Investment in tech/infra pays dividends
   - Balance needed for defense vs growth

3. **Population Growth:**
   - More population = more tax, but more food needed
   - Food surplus accelerates growth
   - Starvation causes decline (negative feedback)

4. **Budget Management:**
   - Maintenance scales with wealth (5% of budget)
   - Higher budget = higher maintenance
   - Need to balance saving vs spending

---

## Summary of Constants

All balance constants are defined in `EconomicBalance.ts`:

### Budget
- `BASE_TAX_PER_CITIZEN`: 5
- `TECHNOLOGY_TAX_MULTIPLIER`: 0.15 (15% per level)
- `MAX_TAX_MULTIPLIER`: 3.0 (300% cap)
- `INFRASTRUCTURE_BONUS`: 0.1 (10% per level)
- `TRADE_INCOME_MULTIPLIER`: 0.05 (5% of deal value)

### Production
- `BASE_FOOD_PER_POP`: 0.8
- `BASE_INDUSTRIAL_OUTPUT`: 5
- `INFRASTRUCTURE_MULTIPLIER`: 0.15 (15% per level)
- `POPULATION_EFFICIENCY`: 0.7 (70%)
- `RESOURCE_EXTRACTION_RATE`: 10

### Consumption
- `FOOD_PER_10K_POPULATION`: 5
- `MAINTENANCE_COST_MULTIPLIER`: 0.05 (5% of budget)
- `MILITARY_UPKEEP_PER_STRENGTH`: 2

### Technology
- Level multipliers: 1.0, 1.3, 1.7, 2.2, 3.0, 4.0

### Population
- `GROWTH_RATE_BASE`: 0.02 (2%)
- `FOOD_SURPLUS_GROWTH_BONUS`: 0.01 (1% per 100 food)
- `GROWTH_CAP_MULTIPLIER`: 1.5 (150% max)
- `STARVATION_THRESHOLD`: 0.8 (80% food requirement)

### Infrastructure
- `MAINTENANCE_COST_PER_LEVEL`: 50

### Action Costs
- Research: 1000 × 1.3^level
- Infrastructure: 800 × 1.25^level
- Military: 500 (flat)

---

## Calculation Examples

### Example 1: Complete Turn Calculation

**Starting Stats:**
- Population: 100,000
- Budget: 5,000
- Technology: 2
- Infrastructure: 1
- Military: 50
- Food: 100

**Step 1: Resource Production**
- Tech multiplier: 1.7
- Infra multiplier: 1.15
- Total: 1.955
- Food produced: floor(10 × 0.8 × 1.955 × 0.7) = 10
- Other resources produced similarly

**Step 2: Budget Calculation**
- Tax: floor(10 × 5 × 1.3 × 1.1) = 71
- Trade: 0 (no deals)
- Revenue: 71
- Maintenance: floor(5,000 × 0.05) = 250
- Military: 50 × 2 = 100
- Infrastructure: 1 × 50 = 50
- Expenses: 400
- Net: -329
- New Budget: 4,671

**Step 3: Resource Consumption**
- Food consumed: ceil(10 × 5) = 50
- Food after: 100 + 10 - 50 = 60
- Decay: floor(60 × 0.9) = 54

**Step 4: Population Change**
- Base growth: 100,000 × 0.02 = 2,000
- Food bonus: 0 (no surplus)
- Penalty: 0 (food met)
- Growth: +2,000
- New Population: 102,000

**Final Stats:**
- Population: 102,000
- Budget: 4,671
- Food: 54
- (Other stats unchanged)

### Example 2: Technology Upgrade Impact

**Before (Tech 2, Infra 1, 100k pop):**
- Tax: 71
- Production multiplier: 1.955

**After Research (Tech 3, Infra 1, 100k pop):**
- Tax: floor(10 × 5 × 1.45 × 1.1) = 79 (+8)
- Production multiplier: 2.53 (+29% production)
- Cost: $1,690

**ROI:** Break-even after ~211 turns (just on tax increase)
- But production boost provides immediate value

---

## Notes & Future Considerations

1. **Resource Market:** Currently no resource selling mechanism
2. **Deal Value Calculation:** Uses placeholder (100 per deal)
3. **Military Equipment:** Structure exists but not implemented
4. **Diplomatic Relations:** Field exists but not used in calculations
5. **Technology Caps:** No hard cap, but costs become prohibitive
6. **Resource Requirements:** No resource requirements for actions yet
7. **Population Cap:** No maximum population limit
8. **Territory System:** Not yet affecting resource production

---

*This document represents the complete stats system as of the current codebase. All formulas and constants are extracted directly from the implementation.*
