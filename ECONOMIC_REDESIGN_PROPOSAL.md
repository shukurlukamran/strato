# Economic System Redesign Proposal

## Executive Summary

This document proposes a comprehensive redesign of the Infrastructure, Technology, and economic systems to:
1. **Differentiate** Infrastructure and Technology to have distinct, meaningful roles
2. **Balance** the economy for fair, engaging gameplay (not too abundant, not too scarce)
3. **Integrate** Country Profiles into upgrade costs and benefits fairly
4. **Future-proof** the design for eventual subtype expansion

---

## Current Problems

### 1. Infrastructure and Technology Are Too Similar
**Current overlap:**
- Both multiply tax revenue (Tech: +25%/level, Infra: +15%/level)
- Both multiply resource production (Tech: discrete multipliers, Infra: +15%/level)
- They feel interchangeable, just with different magnitudes

**Why this is bad:**
- No strategic choice between them
- No complementary synergies
- Boring upgrade decisions (just pick whatever is cheaper)

### 2. Country Profiles Don't Affect Costs
**Current state:**
- Profiles only affect resource production
- A "Technological Hub" pays the same for tech upgrades as an "Agriculture" nation
- Doesn't reflect the thematic differences

### 3. Economic Balance Issues
**Current discrepancies (from INFRASTRUCTURE_TECH_ANALYSIS.md):**
- Game is more generous than documented (cheaper upgrades, higher bonuses)
- Tax revenue can grow very high with both tech and infra
- Infrastructure maintenance is very low (20 vs documented 50)

---

## Proposed Redesign

### Core Philosophy

**TECHNOLOGY** = Efficiency & Capability
- Represents knowledge, research, scientific advancement
- Affects **how efficiently** you use resources and produce things
- Unlocks advanced capabilities

**INFRASTRUCTURE** = Capacity & Administration
- Represents physical systems, logistics, governance
- Affects **how much capacity** you have for population, trade, storage
- Improves administrative efficiency (tax collection)

---

## TECHNOLOGY SYSTEM (Redesigned)

### What Technology Affects

#### 1. Resource Production Multiplier (KEEP - This is good!)
**Formula:**
```
Technology multipliers (discrete):
Level 0: 1.00x (base)
Level 1: 1.25x (+25%)
Level 2: 1.60x (+60%)
Level 3: 2.00x (+100%)
Level 4: 2.50x (+150%)
Level 5: 3.00x (+200%)
```

**Reasoning:** Technology makes your workers more productive with better tools, knowledge, and techniques.

#### 2. Military Effectiveness (NEW)
**Formula:**
```
militaryEffectiveness = 1 + (technologyLevel × 0.20)  // +20% per level

effectiveMilitaryStrength = militaryStrength × militaryEffectiveness
```

**Example:**
- Military strength: 50
- Tech level: 2
- Effectiveness: 1 + (2 × 0.20) = 1.4x
- **Effective strength: 70** (50 × 1.4)

**Reasoning:** Better tech = better weapons, training, coordination. Your soldiers are more effective in combat.

#### 3. Military Recruitment Cost Reduction (NEW)
**Formula:**
```
costReduction = 1 - (technologyLevel × 0.05)  // -5% per level, max -25%
militaryCost = baseCost × max(0.75, costReduction)

Example:
- Base cost: 50 per strength point
- Tech level 3: 50 × (1 - 0.15) = 42.5 per strength point
- Tech level 5: 50 × 0.75 = 37.5 per strength point (capped)
```

**Reasoning:** Better tech makes military training more efficient and equipment production cheaper.

#### 4. Research Speed Bonus (NEW)
**Formula:**
```
nextLevelCost = baseFormula × (1 - currentLevel × 0.03)  // -3% per level, max -15%

Example:
- Level 2→3: Base cost × 0.94 (6% cheaper)
- Level 3→4: Base cost × 0.91 (9% cheaper)
- Level 5→6: Base cost × 0.85 (15% cheaper, capped)
```

**Reasoning:** Higher tech makes further research somewhat easier (existing knowledge base).

### Technology Upgrade Costs

#### Base Formula (Rebalanced)
```typescript
baseCost = 800 × 1.35^(currentLevel)
profileModifier = getProfileTechModifier(profile)
finalCost = floor(baseCost × profileModifier)
```

**Cost Progression (no modifiers):**
- Level 0→1: $800
- Level 1→2: $1,080
- Level 2→3: $1,458
- Level 3→4: $1,968
- Level 4→5: $2,657
- Level 5→6: $3,587

**Profile Modifiers:**
- Technological Hub: 0.75x (25% cheaper) - They're naturally inclined toward tech
- Balanced Nation: 1.0x (standard cost)
- Agricultural, Mining, Industrial: 1.15x (15% more expensive) - Resource-focused
- Oil Kingdom, Coastal Hub: 1.10x (10% more expensive) - Moderate trade-off
- Precious Metals Trader: 1.20x (20% more expensive) - Luxury focus, not tech

**Reasoning:** Technology should be harder for non-tech-focused civilizations.

---

## INFRASTRUCTURE SYSTEM (Redesigned)

### What Infrastructure Affects

#### 1. Tax Collection Efficiency (IMPROVED)
**Formula:**
```
taxEfficiency = 1 + (infrastructureLevel × 0.12)  // +12% per level

taxRevenue = floor(baseTax × techMultiplier × taxEfficiency)
```

**Reasoning:** Infrastructure represents roads, administration buildings, communication systems. Better infrastructure = better tax collection, not more wealth generation. This is now the PRIMARY benefit of infrastructure.

#### 2. Population Capacity Bonus (NEW)
**Formula:**
```
populationCapacity = baseCapacity + (infrastructureLevel × 50000)

If population > capacity:
  - Growth rate reduced by 50%
  - Tax revenue reduced by 20% (overcrowding)
  - Food consumption increased by 10%

baseCapacity = 200,000 (starting cap)
```

**Example:**
- Infra 0: Cap = 200k (you start at ~100k, so room to grow)
- Infra 1: Cap = 250k
- Infra 3: Cap = 350k
- Infra 5: Cap = 450k

**Reasoning:** You need infrastructure to support larger populations. Roads, housing, utilities, services.

#### 3. Trade Capacity (NEW)
**Formula:**
```
maxActiveDeals = 2 + infrastructureLevel

dealEfficiency = 1 + (infrastructureLevel × 0.10)  // +10% per level
actualDealValue = baseDealValue × dealEfficiency
```

**Example:**
- Infra 0: 2 max deals, 100% value
- Infra 2: 4 max deals, 120% value
- Infra 5: 7 max deals, 150% value

**Reasoning:** Better infrastructure = better logistics for trade. More ports, roads, warehouses.

#### 4. Resource Storage Capacity (NEW)
**Formula:**
```
baseStorage = {
  food: 1000,
  water: 500,
  timber: 300,
  // ... etc
}

storageMultiplier = 1 + (infrastructureLevel × 0.25)  // +25% per level
actualStorage = baseStorage × storageMultiplier
```

**Example:**
- Infra 0: 1000 food capacity (excess decays faster)
- Infra 2: 1500 food capacity
- Infra 4: 2000 food capacity

**Reasoning:** Warehouses, silos, refrigeration = infrastructure.

#### 5. Administrative Range (NEW - Future Feature)
**Formula:**
```
maxTerritoryTiles = 5 + (infrastructureLevel × 2)
```

**Example:**
- Infra 0: Control 5 tiles max
- Infra 3: Control 11 tiles max
- Infra 5: Control 15 tiles max

**Reasoning:** You need administrative infrastructure to govern distant territories. This prepares for future territorial expansion features.

### Infrastructure Upgrade Costs

#### Base Formula (Rebalanced)
```typescript
baseCost = 700 × 1.30^(currentLevel)
profileModifier = getProfileInfraModifier(profile)
finalCost = floor(baseCost × profileModifier)
```

**Cost Progression (no modifiers):**
- Level 0→1: $700
- Level 1→2: $910
- Level 2→3: $1,183
- Level 3→4: $1,538
- Level 4→5: $1,999
- Level 5→6: $2,599

**Profile Modifiers:**
- Industrial Complex: 0.80x (20% cheaper) - Built for infrastructure
- Coastal Trading Hub: 0.85x (15% cheaper) - Trade needs infrastructure
- Balanced Nation: 1.0x (standard)
- Technological Hub: 1.10x (10% more expensive) - Tech-focused, not infrastructure
- Agricultural: 1.05x (5% more expensive) - Land-rich but building-poor
- Mining, Oil: 1.15x (15% more expensive) - Resource extraction, not development
- Precious Metals: 1.20x (20% more expensive) - Luxury, minimal infrastructure

**Reasoning:** Infrastructure should be cheaper for nations that naturally build things.

### Infrastructure Maintenance Cost (Rebalanced)

**Formula:**
```
maintenanceCost = infrastructureLevel × 35  // 35 credits per level
```

**Cost Progression:**
- Level 1: 35/turn
- Level 2: 70/turn
- Level 3: 105/turn
- Level 5: 175/turn

**Reasoning:** Higher than current (20) but lower than documented (50). Infrastructure needs maintenance but shouldn't be punishing.

---

## TAX REVENUE SYSTEM (Revised)

### Tax Revenue Formula (Simplified & Balanced)

```typescript
// Base tax from population
populationUnits = population / 10000
baseTax = populationUnits × 12  // Reduced from 15 to balance

// Technology multiplier (unchanged - represents productivity)
techMultiplier = getTechMultiplier(technologyLevel)  // Discrete: 1.0, 1.25, 1.6, 2.0, 2.5, 3.0

// Infrastructure efficiency (revised - represents administration)
infraEfficiency = 1 + (infrastructureLevel × 0.12)  // +12% per level

// Population over-capacity penalty
capacityPenalty = 1.0
if (population > populationCapacity) {
  capacityPenalty = 0.80  // -20% when overcrowded
}

// Final calculation
taxRevenue = floor(baseTax × techMultiplier × infraEfficiency × capacityPenalty)
```

### Example Calculations

#### Early Game (100k pop, Tech 0, Infra 0)
```
Base: (100,000 / 10,000) × 12 = 120
Tech: 1.0x
Infra: 1.0x
Total: 120 credits/turn
```

#### Mid Game (150k pop, Tech 2, Infra 2)
```
Base: (150,000 / 10,000) × 12 = 180
Tech: 1.6x
Infra: 1 + (2 × 0.12) = 1.24x
Total: 180 × 1.6 × 1.24 = 357 credits/turn
```

#### Late Game (200k pop, Tech 4, Infra 4)
```
Base: (200,000 / 10,000) × 12 = 240
Tech: 2.5x
Infra: 1 + (4 × 0.12) = 1.48x
Total: 240 × 2.5 × 1.48 = 888 credits/turn
```

#### Overcrowded (250k pop exceeds 200k cap, Tech 2, Infra 1)
```
Base: (250,000 / 10,000) × 12 = 300
Tech: 1.6x
Infra: 1 + (1 × 0.12) = 1.12x
Capacity Penalty: 0.80x (over capacity!)
Total: 300 × 1.6 × 1.12 × 0.80 = 430 credits/turn
Without overcrowding: 538/turn
Penalty cost: -108/turn
```

---

## COUNTRY PROFILE INTEGRATION

### Profile-Based Modifiers Summary

| Profile | Tech Cost | Infra Cost | Military Cost | Tax Bonus | Trade Bonus |
|---------|-----------|------------|---------------|-----------|-------------|
| **Technological Hub** | 0.75x | 1.10x | 0.90x | 1.05x | 1.00x |
| **Industrial Complex** | 1.15x | 0.80x | 0.95x | 1.00x | 1.10x |
| **Coastal Trading Hub** | 1.10x | 0.85x | 1.10x | 1.00x | 1.25x |
| **Agriculture** | 1.15x | 1.05x | 1.05x | 1.00x | 0.95x |
| **Mining Empire** | 1.15x | 1.15x | 0.90x | 0.95x | 1.00x |
| **Oil Kingdom** | 1.10x | 1.15x | 0.95x | 1.00x | 1.05x |
| **Precious Metals** | 1.20x | 1.20x | 1.15x | 1.10x | 1.15x |
| **Balanced Nation** | 1.00x | 1.00x | 1.00x | 1.00x | 1.00x |

### Reasoning by Profile

**Technological Hub:**
- Cheap tech (core strength)
- Expensive infra (focused on knowledge, not building)
- Cheap military (tech advantage)
- Small tax bonus (efficient economy)

**Industrial Complex:**
- Expensive tech (not research-focused)
- Cheap infra (building is their thing)
- Moderate military (industrial capacity)
- Trade bonus (export goods)

**Coastal Trading Hub:**
- Moderate tech cost (trade brings knowledge)
- Cheap infra (ports, roads for trade)
- Expensive military (peaceful traders)
- Big trade bonus (their specialty)

**Agriculture:**
- Expensive tech (rural, traditional)
- Slightly expensive infra (spread out, hard to develop)
- Expensive military (peaceful farmers)
- Trade penalty (self-sufficient)

**Mining Empire:**
- Expensive tech (extraction, not research)
- Expensive infra (remote mines, harsh terrain)
- Cheap military (tough workers, martial culture)
- Tax penalty (wealth in resources, not administration)

**Oil Kingdom:**
- Moderate tech (oil wealth can buy knowledge)
- Expensive infra (desert/remote locations)
- Moderate military (oil wealth funds defense)
- Trade bonus (oil exports)

**Precious Metals Trader:**
- Very expensive tech (luxury focus, not innovation)
- Very expensive infra (wealth inequality, poor infrastructure)
- Expensive military (mercenaries expensive)
- Tax bonus (wealth concentration)
- Trade bonus (luxury exports)

**Balanced Nation:**
- No modifiers (baseline)

---

## ECONOMIC BALANCE TUNING

### Budget Generation vs Expenses

#### Typical Early Game (100k pop, Tech 0, Infra 0, Military 30)

**Revenue:**
- Tax: 120
- Trade: 0 (no deals yet)
- **Total: 120/turn**

**Expenses:**
- Maintenance: ~5% of budget ≈ 25
- Military upkeep: 30 × 0.8 = 24
- Infrastructure: 0 × 35 = 0
- **Total: 49/turn**

**Net: +71/turn** (58% profit margin)

**Research cost (Tech 0→1):** 800 (Balanced) = ~11 turns of savings
**Infrastructure cost (Infra 0→1):** 700 (Balanced) = ~10 turns of savings

#### Typical Mid Game (150k pop, Tech 2, Infra 2, Military 50)

**Revenue:**
- Tax: 357
- Trade: ~50 (1-2 deals × efficiency)
- **Total: 407/turn**

**Expenses:**
- Maintenance: ~20
- Military upkeep: 50 × 0.8 = 40
- Infrastructure: 2 × 35 = 70
- **Total: 130/turn**

**Net: +277/turn** (68% profit margin)

**Research cost (Tech 2→3):** 1,458 (Balanced) = ~5 turns
**Infrastructure cost (Infra 2→3):** 1,183 (Balanced) = ~4 turns

#### Typical Late Game (200k pop, Tech 4, Infra 4, Military 80)

**Revenue:**
- Tax: 888
- Trade: ~150 (3-4 deals × efficiency)
- **Total: 1,038/turn**

**Expenses:**
- Maintenance: ~50
- Military upkeep: 80 × 0.8 = 64
- Infrastructure: 4 × 35 = 140
- **Total: 254/turn**

**Net: +784/turn** (76% profit margin)

**Research cost (Tech 4→5):** 2,657 (Balanced) = ~3-4 turns
**Infrastructure cost (Infra 4→5):** 1,999 (Balanced) = ~2-3 turns

### Balance Assessment

**Early Game:**
- Slow initial growth
- Need to choose: invest in economy OR military
- ~10 turns for first major upgrade
- **Assessment: Appropriately challenging**

**Mid Game:**
- Accelerating growth
- Can afford multiple upgrades
- Still need strategic choices
- **Assessment: Rewarding without being excessive**

**Late Game:**
- Strong economy
- Multiple upgrades per few turns
- But costs are also high
- **Assessment: Powerful feeling but not broken**

### Comparison to Current System

| Metric | Current | Proposed | Change |
|--------|---------|----------|--------|
| Early tech cost | $500 | $800 | +60% (slower) |
| Early infra cost | $600 | $700 | +17% (slightly slower) |
| Tech tax bonus | +25%/level | Indirect via production | Different system |
| Infra tax bonus | +15%/level | +12%/level | -3% (balanced) |
| Infra maintenance | 20/level | 35/level | +75% (more meaningful) |
| Early profit margin | ~70% | ~58% | -12% (tighter) |

**Key Changes:**
- Slightly slower early game (more strategic)
- Infrastructure is more important (capacity limits)
- Technology and infrastructure are differentiated
- Country profiles matter for costs
- Overall more balanced and engaging

---

## FUTURE-PROOFING: SUBTYPE EXPANSION

### Technology Subtypes (Future)

When you split technology into subtypes, the discrete multipliers can apply differently:

**Possible subtypes:**
1. **Agricultural Tech** - Affects food/timber production
2. **Industrial Tech** - Affects steel/aluminum/coal production
3. **Military Tech** - Affects military effectiveness/cost
4. **Scientific Research** - Affects all research costs
5. **Information Tech** - Affects administration/trade

**Example:**
- Current: Tech Level 2 = 1.6x to ALL production
- Future: Ag Tech 1 (1.25x food), Industrial Tech 2 (1.6x steel), Military Tech 0 (1.0x effectiveness)

### Infrastructure Subtypes (Future)

**Possible subtypes:**
1. **Transportation** - Affects trade capacity, military movement
2. **Administrative** - Affects tax collection, population capacity
3. **Storage** - Affects resource storage, decay rates
4. **Urban Development** - Affects population capacity, growth
5. **Trade Ports** - Affects trade deals, revenue

**Example:**
- Current: Infra Level 3 = +36% tax, 350k pop cap, 5 deals
- Future: Admin 2 (+24% tax), Urban 3 (350k cap), Ports 1 (3 deals max)

### Design Principles for Subtypes

1. **Each subtype should have a clear identity**
   - Don't overlap too much
   - Each one solves specific problems

2. **Total cost should equal current combined cost**
   - If you split Tech into 3 subtypes, each costs ~1/3 as much
   - Prevents forced overinvestment

3. **Allow mixed strategies**
   - Military-focused can skip ag tech
   - Trade-focused can skip military infra

4. **Use the current system as a template**
   - Current tech multipliers become the "all subtypes maxed" state
   - Allows backward compatibility

---

## IMPLEMENTATION PLAN

### Phase 1: Core Separation (High Priority)
1. Update `EconomicBalance.ts` with new constants
2. Modify `BudgetCalculator.ts` to remove tech from tax (keep only infra)
3. Add population capacity system to `EconomicEngine.ts`
4. Update costs in `/api/actions/route.ts`
5. Add infrastructure maintenance increase

### Phase 2: Military Tech Integration (Medium Priority)
1. Add tech effectiveness to military combat calculations
2. Add tech cost reduction to military recruitment
3. Update AI to consider tech for military decisions

### Phase 3: Profile Cost Modifiers (Medium Priority)
1. Add profile modifier functions to `ActionResolver.ts`
2. Update action API to apply profile modifiers
3. Add UI indicators showing profile-adjusted costs

### Phase 4: Capacity & Storage Systems (Lower Priority)
1. Implement population capacity limits
2. Add resource storage caps
3. Add trade capacity limits
4. Update UI to show capacities and limits

### Phase 5: Testing & Balancing (Ongoing)
1. Run simulation tests for 50-turn games
2. Verify no profile bankrupts or starves
3. Adjust multipliers based on playtesting
4. Balance AI decision-making weights

---

## EXPECTED OUTCOMES

### Strategic Depth
- Players must choose: Tech for production OR Infra for capacity?
- Country profiles create unique playstyles
- Population management becomes important
- Trade becomes more valuable (limited by infra)

### Balance
- Slower early game (more meaningful choices)
- Scaling remains controlled (capacity limits)
- No single "best" strategy
- Profiles remain balanced despite cost differences

### Differentiation
- Tech = Production efficiency & military power
- Infra = Capacity & administration
- Clear purposes, complementary benefits
- Future subtype expansion is natural

### Thematic Consistency
- Technological Hub actually benefits from tech
- Agricultural nation has appropriate challenges/benefits
- Each profile feels unique to play

---

## RISKS & MITIGATIONS

### Risk: Economy too tight in early game
**Mitigation:** Start with slightly higher budget (3500 vs 3000)

### Risk: Population caps feel restrictive
**Mitigation:** Make growth slow near cap (soft cap), not hard wall

### Risk: Profiles become unbalanced
**Mitigation:** Extensive simulation testing, iterate on modifiers

### Risk: Too complex for players
**Mitigation:** Clear UI explanations, tooltips, gradual introduction

### Risk: AI can't handle new systems
**Mitigation:** Update AI decision weights, add capacity-aware logic

---

## APPENDIX: Complete Formula Reference

### Tax Revenue
```
baseTax = (population / 10000) × 12
techMultiplier = [1.0, 1.25, 1.6, 2.0, 2.5, 3.0][techLevel]
infraEfficiency = 1 + (infraLevel × 0.12)
capacityPenalty = (population > capacity) ? 0.80 : 1.0
profileTaxBonus = getProfileTaxModifier(profile)

taxRevenue = floor(baseTax × techMultiplier × infraEfficiency × capacityPenalty × profileTaxBonus)
```

### Resource Production
```
baseProduction = calculateBaseProduction(resource, population)
techMultiplier = [1.0, 1.25, 1.6, 2.0, 2.5, 3.0][techLevel]
infraMultiplier = 1 + (infraLevel × 0.15)  // KEPT from current
profileMultiplier = getProfileResourceModifier(profile, resource)

production = floor(baseProduction × techMultiplier × infraMultiplier × profileMultiplier)
```

### Upgrade Costs
```typescript
// Technology
baseCost = 800 × 1.35^(currentLevel)
profileMod = getProfileTechModifier(profile)  // 0.75 - 1.20
researchSpeedBonus = 1 - min(0.15, currentLevel × 0.03)
finalCost = floor(baseCost × profileMod × researchSpeedBonus)

// Infrastructure
baseCost = 700 × 1.30^(currentLevel)
profileMod = getProfileInfraModifier(profile)  // 0.80 - 1.20
finalCost = floor(baseCost × profileMod)

// Military
baseCost = 50  // per strength point
techCostReduction = 1 - min(0.25, techLevel × 0.05)
profileMod = getProfileMilitaryModifier(profile)  // 0.90 - 1.15
finalCost = baseCost × techCostReduction × profileMod
```

### Military Effectiveness
```
baseMilitaryStrength = militaryStrength
techEffectiveness = 1 + (techLevel × 0.20)
profileMilitaryBonus = getProfileMilitaryEffectiveness(profile)  // Future

effectiveStrength = baseMilitaryStrength × techEffectiveness × profileMilitaryBonus
```

### Population Capacity
```
baseCapacity = 200000  // 200k starting
infraCapacity = infraLevel × 50000

totalCapacity = baseCapacity + infraCapacity

if (population > totalCapacity):
  growthRate *= 0.50  // Half growth
  taxRevenue *= 0.80  // 20% penalty
  foodConsumption *= 1.10  // 10% more consumption
```

### Trade System
```
maxActiveDeals = 2 + infraLevel
dealEfficiency = 1 + (infraLevel × 0.10)
profileTradeBonus = getProfileTradeModifier(profile)

actualDealValue = baseDealValue × dealEfficiency × profileTradeBonus
tradeRevenue = floor(actualDealValue × 0.10)  // 10% of trade value
```

---

## CONCLUSION

This redesign achieves:
✅ **Differentiation** - Tech and Infra now have distinct, complementary roles
✅ **Balance** - Tighter economy in early game, scaling controlled by capacity limits
✅ **Profile Integration** - Profiles affect costs and playstyle meaningfully
✅ **Future-Proof** - Clean separation enables natural subtype expansion
✅ **Strategic Depth** - More meaningful choices, no single dominant strategy

The system is more complex but in a good way - complexity comes from strategic choices, not confusing mechanics.
