# Infrastructure & Technology System Analysis

## Overview
This document explains how Infrastructure and Technology work in the game, including what affects them, what they affect, and the quantitative impacts. It compares the **intended design** (from documentation) with the **actual implementation** (in code).

---

## TECHNOLOGY SYSTEM

### What Technology Affects

#### 1. Tax Revenue (Budget Generation)
**How it works:** Technology multiplies tax revenue from population.

**Actual Implementation:**
```typescript
// From BudgetCalculator.ts
techBonus = 1 + (technologyLevel × 0.25)  // +25% per level
techMultiplier = min(techBonus, 4.0)      // Capped at 400% (level 12+)
taxRevenue = floor(baseTax × techMultiplier × infraMultiplier)
```

**Intended Design (from docs):**
- +15% per tech level
- Capped at 300% total (level 13+)

**DISCREPANCY:** Code uses **+25% per level** (capped at 400%), but docs say **+15% per level** (capped at 300%).

**Example Calculation (100k population, Tech Level 2):**
- Base tax: (100,000 / 10,000) × 15 = 150 credits
- Tech multiplier: 1 + (2 × 0.25) = 1.5x (150%)
- With Infra Level 1: 150 × 1.5 × 1.15 = **258 credits**

#### 2. Resource Production
**How it works:** Technology uses discrete multipliers (not linear) for resource production.

**Actual Implementation:**
```typescript
// From ResourceProduction.ts
Technology multipliers (discrete):
Level 0: 1.0x
Level 1: 1.3x (+30%)
Level 2: 1.7x (+70%)
Level 3: 2.2x (+120%)
Level 4: 3.0x (+200%)
Level 5: 4.0x (+300%)
```

**Intended Design:** Matches implementation ✓

**How it's applied:**
- All resource production (food, water, timber, stone, iron, oil, rare_earth, coal, steel, aluminum, gold, gems) is multiplied by the tech multiplier
- This multiplier is then multiplied by the infrastructure multiplier
- Formula: `production = baseProduction × techMultiplier × infraMultiplier`

**Example (Food production, 100k pop, Tech Level 2, Infra Level 1):**
- Base: (100,000 / 10,000) × 6.5 = 65 food
- Tech: 1.7x
- Infra: 1 + (1 × 0.15) = 1.15x
- Total: 65 × 1.7 × 1.15 = **127 food per turn**

### What Affects Technology

#### Technology Upgrade Cost
**Actual Implementation:**
```typescript
// From /api/actions/route.ts
cost = floor(500 × 1.4^(currentLevel))
```

**Intended Design (from docs):**
- `cost = floor(1000 × 1.3^(currentLevel))`

**DISCREPANCY:** Code uses **500 base with 1.4 multiplier**, docs say **1000 base with 1.3 multiplier**.

**Actual Cost Progression:**
- Level 0→1: $500
- Level 1→2: $700
- Level 2→3: $980
- Level 3→4: $1,372
- Level 4→5: $1,921
- Level 5→6: $2,689

**Effect:** +1 Technology Level

**What affects the cost:**
- Only the current technology level (exponential growth)
- Nothing else affects the cost

---

## INFRASTRUCTURE SYSTEM

### What Infrastructure Affects

#### 1. Tax Revenue (Budget Generation)
**How it works:** Infrastructure multiplies tax revenue multiplicatively with technology.

**Actual Implementation:**
```typescript
// From BudgetCalculator.ts
infraBonus = 1 + (infrastructureLevel × 0.15)  // +15% per level
taxRevenue = floor(baseTax × techMultiplier × infraBonus)
```

**Intended Design (from docs):**
- +10% per infrastructure level

**DISCREPANCY:** Code uses **+15% per level**, docs say **+10% per level**.

**Example Calculation (100k population, Tech Level 2, Infra Level 3):**
- Base tax: 150 credits
- Tech multiplier: 1.5x
- Infra multiplier: 1 + (3 × 0.15) = 1.45x
- Total: 150 × 1.5 × 1.45 = **326 credits**

#### 2. Resource Production
**How it works:** Infrastructure multiplies all resource production.

**Actual Implementation:**
```typescript
// From ResourceProduction.ts
infraMultiplier = 1 + (infrastructureLevel × 0.15)  // +15% per level
production = baseProduction × techMultiplier × infraMultiplier
```

**Intended Design:** Matches implementation ✓ (+15% per level)

**Example (Food production, 100k pop, Tech Level 2, Infra Level 3):**
- Base: 65 food
- Tech: 1.7x
- Infra: 1 + (3 × 0.15) = 1.45x
- Total: 65 × 1.7 × 1.45 = **160 food per turn**

### What Affects Infrastructure

#### Infrastructure Upgrade Cost
**Actual Implementation:**
```typescript
// From /api/actions/route.ts
cost = floor(600 × 1.3^(currentLevel))
```

**Intended Design (from docs):**
- `cost = floor(800 × 1.25^(currentLevel))`

**DISCREPANCY:** Code uses **600 base with 1.3 multiplier**, docs say **800 base with 1.25 multiplier**.

**Actual Cost Progression:**
- Level 0→1: $600
- Level 1→2: $780
- Level 2→3: $1,014
- Level 3→4: $1,318
- Level 4→5: $1,713
- Level 5→6: $2,227

**Effect:** +1 Infrastructure Level

#### Infrastructure Maintenance Cost
**How it works:** Infrastructure costs maintenance every turn.

**Actual Implementation:**
```typescript
// From BudgetCalculator.ts
infrastructureCost = infrastructureLevel × 20  // 20 credits per level per turn
```

**Intended Design (from docs):**
- 50 credits per level per turn

**DISCREPANCY:** Code uses **20 credits per level**, docs say **50 credits per level**.

**Example:**
- Infrastructure Level 3: 3 × 20 = **60 credits per turn** (actual)
- Infrastructure Level 3: 3 × 50 = **150 credits per turn** (documented)

**What affects maintenance:**
- Only the infrastructure level (linear cost)
- Deducted every turn automatically in budget calculation

---

## INTERACTIONS & SYNERGIES

### Multiplicative Effects
Both technology and infrastructure multiply tax revenue and resource production **multiplicatively**, not additively:

```
Tax Revenue = baseTax × techMultiplier × infraMultiplier
Resource Production = baseProduction × techMultiplier × infraMultiplier
```

This means they compound together:
- Tech Level 2 (1.5x) + Infra Level 2 (1.3x) = 1.5 × 1.3 = **1.95x total**
- Not 1.5 + 1.3 = 2.8x (which would be additive)

### ROI Considerations
The AI uses ROI calculations to decide when to invest:

**Infrastructure ROI:**
- Calculates: `(revenueIncrease - maintenanceCostIncrease) / cost`
- Considers both tax revenue increase AND maintenance cost increase
- Example: If infrastructure increases revenue by 30/turn but costs 20/turn maintenance, net benefit is 10/turn

**Technology ROI:**
- Calculates: `revenueIncrease / cost`
- Only considers tax revenue (doesn't account for resource production benefits in ROI)
- Technology has no maintenance cost

---

## SUMMARY OF DISCREPANCIES

| Aspect | Intended (Docs) | Actual (Code) | Status |
|--------|----------------|---------------|--------|
| **Tech Tax Multiplier** | +15% per level (cap 300%) | +25% per level (cap 400%) | ❌ Mismatch |
| **Tech Resource Multiplier** | Discrete (1.0, 1.3, 1.7, 2.2, 3.0, 4.0) | Discrete (1.0, 1.3, 1.7, 2.2, 3.0, 4.0) | ✅ Match |
| **Tech Upgrade Cost** | 1000 × 1.3^level | 500 × 1.4^level | ❌ Mismatch |
| **Infra Tax Multiplier** | +10% per level | +15% per level | ❌ Mismatch |
| **Infra Resource Multiplier** | +15% per level | +15% per level | ✅ Match |
| **Infra Upgrade Cost** | 800 × 1.25^level | 600 × 1.3^level | ❌ Mismatch |
| **Infra Maintenance** | 50 per level | 20 per level | ❌ Mismatch |

---

## ACTUAL VALUES IN CODE

### EconomicBalance.ts Constants
```typescript
BUDGET: {
  BASE_TAX_PER_CITIZEN: 15,              // Per 10k population
  TECHNOLOGY_TAX_MULTIPLIER: 0.25,       // +25% per tech level
  MAX_TAX_MULTIPLIER: 4.0,               // Cap at 400%
  INFRASTRUCTURE_BONUS: 0.15,            // +15% per infra level
}

PRODUCTION: {
  BASE_FOOD_PER_POP: 6.5,                // Per 10k population
  INFRASTRUCTURE_MULTIPLIER: 0.15,       // +15% per infra level
}

TECHNOLOGY: {
  LEVEL_0_MULTIPLIER: 1.0,
  LEVEL_1_MULTIPLIER: 1.3,
  LEVEL_2_MULTIPLIER: 1.7,
  LEVEL_3_MULTIPLIER: 2.2,
  LEVEL_4_MULTIPLIER: 3.0,
  LEVEL_5_MULTIPLIER: 4.0,
}

INFRASTRUCTURE: {
  BUILD_COST_BASE: 1000,                 // NOT USED - actual is 600
  BUILD_COST_MULTIPLIER: 1.5,            // NOT USED - actual is 1.3
  MAINTENANCE_COST_PER_LEVEL: 20,       // 20 credits per level per turn
}
```

### Action Costs (from /api/actions/route.ts)
```typescript
Research:    cost = floor(500 × 1.4^(currentLevel))
Infrastructure: cost = floor(600 × 1.3^(currentLevel))
```

---

## RECOMMENDATIONS

1. **Update documentation** to match actual code values, OR
2. **Update code** to match documented values (requires balance testing)
3. **Consider** whether the current values are balanced:
   - Tech is cheaper than documented (500 vs 1000 base)
   - Infra is cheaper than documented (600 vs 800 base)
   - Infra maintenance is lower than documented (20 vs 50)
   - Tech tax bonus is higher than documented (25% vs 15%)
   - Infra tax bonus is higher than documented (15% vs 10%)

These discrepancies mean the game is currently **more generous** than the documented design.
