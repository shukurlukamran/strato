# Economic Redesign: Before vs After Comparison

## Quick Visual Reference

### What Changed: Technology

| Aspect | BEFORE (Current) | AFTER (Proposed) |
|--------|------------------|------------------|
| **Affects** | • Tax revenue (+25%/level)<br>• Resource production (discrete multipliers) | • Resource production (KEPT, discrete multipliers)<br>• Military effectiveness (+20%/level)<br>• Military recruitment cost (-5%/level)<br>• Research cost discount |
| **Upgrade Cost** | 500 × 1.4^level<br>(Level 0→1: $500) | 800 × 1.35^level × profileModifier<br>(Level 0→1: $600-960 depending on profile) |
| **Profile Impact** | None | 0.75x - 1.20x cost modifier |
| **Maintenance** | None | None |

**Key Change:** Tech no longer affects tax revenue directly. It focuses on production efficiency and military power.

---

### What Changed: Infrastructure

| Aspect | BEFORE (Current) | AFTER (Proposed) |
|--------|------------------|------------------|
| **Affects** | • Tax revenue (+15%/level)<br>• Resource production (+15%/level) | • Tax revenue (+12%/level)<br>• Population capacity (+50k/level)<br>• Trade capacity (+1 deal/level)<br>• Trade efficiency (+10%/level)<br>• Resource storage (+25%/level) |
| **Upgrade Cost** | 600 × 1.3^level<br>(Level 0→1: $600) | 700 × 1.3^level × profileModifier<br>(Level 0→1: $560-840 depending on profile) |
| **Profile Impact** | None | 0.80x - 1.20x cost modifier |
| **Maintenance** | 20/level<br>(Level 3: 60/turn) | 35/level<br>(Level 3: 105/turn) |

**Key Change:** Infra no longer affects resource production. It focuses on capacity and administration.

---

## Side-by-Side Examples

### Scenario 1: Early Game Nation (100k pop, Tech 0, Infra 0)

#### Current System
```
Tax Revenue:
  Base: (100k/10k) × 15 = 150
  Tech multiplier: 1 + (0 × 0.25) = 1.0x
  Infra multiplier: 1 + (0 × 0.15) = 1.0x
  Total: 150/turn

Food Production:
  Base: (100k/10k) × 6.5 = 65
  Tech multiplier: 1.0x
  Infra multiplier: 1.0x
  Total: 65/turn

Expenses:
  Military upkeep (30 str): 24/turn
  Maintenance: ~7/turn
  Infra maintenance: 0/turn
  Total: 31/turn

Net Income: +119/turn

Upgrade Costs:
  Tech 0→1: $500 (4.2 turns)
  Infra 0→1: $600 (5.0 turns)
```

#### Proposed System
```
Tax Revenue:
  Base: (100k/10k) × 12 = 120
  Tech multiplier: 1.0x
  Infra multiplier: 1.0x
  Capacity penalty: 1.0x (200k cap)
  Total: 120/turn

Food Production:
  Base: (100k/10k) × 6.5 = 65
  Tech multiplier: 1.0x
  Infra multiplier: 1.0x (NO CHANGE - infra removed)
  Total: 65/turn

Expenses:
  Military upkeep (30 str): 24/turn
  Maintenance: ~25/turn
  Infra maintenance: 0/turn
  Total: 49/turn

Net Income: +71/turn

Upgrade Costs (Balanced Nation):
  Tech 0→1: $800 (11.3 turns)
  Infra 0→1: $700 (9.9 turns)

Population Capacity: 200k (safe room to grow)
Trade Capacity: 2 deals max
```

**Impact:** Slower early game, more strategic choices needed.

---

### Scenario 2: Mid Game Nation (150k pop, Tech 2, Infra 2)

#### Current System
```
Tax Revenue:
  Base: (150k/10k) × 15 = 225
  Tech multiplier: 1 + (2 × 0.25) = 1.5x
  Infra multiplier: 1 + (2 × 0.15) = 1.3x
  Total: 439/turn

Food Production:
  Base: (150k/10k) × 6.5 = 97.5
  Tech multiplier: 1.7x (discrete)
  Infra multiplier: 1.3x
  Total: 216/turn

Expenses:
  Military upkeep (50 str): 40/turn
  Maintenance: ~22/turn
  Infra maintenance: 40/turn
  Total: 102/turn

Net Income: +337/turn

Upgrade Costs:
  Tech 2→3: $980 (2.9 turns)
  Infra 2→3: $1,014 (3.0 turns)
```

#### Proposed System
```
Tax Revenue:
  Base: (150k/10k) × 12 = 180
  Tech multiplier: 1.6x (discrete - AFFECTS PRODUCTION)
  Infra multiplier: 1 + (2 × 0.12) = 1.24x
  Capacity penalty: 1.0x (300k cap)
  Total: 268/turn

Food Production:
  Base: (150k/10k) × 6.5 = 97.5
  Tech multiplier: 1.6x (discrete)
  Infra multiplier: 1.0x (REMOVED)
  Total: 156/turn

Expenses:
  Military upkeep (50 str): 40/turn
  Maintenance: ~20/turn
  Infra maintenance: 70/turn
  Total: 130/turn

Net Income: +138/turn
+ Trade revenue: ~50/turn (2 deals @ 120% efficiency)
= +188/turn total

Upgrade Costs (Balanced Nation):
  Tech 2→3: $1,458 (7.8 turns)
  Infra 2→3: $1,183 (6.3 turns)

Population Capacity: 300k (still room to grow)
Trade Capacity: 4 deals max (up from 2)
Military Effectiveness: 50 str × 1.4 = 70 effective
```

**Impact:** Tax revenue is lower BUT tech benefits military. Trade becomes valuable. Food production slightly lower (need to manage better).

---

### Scenario 3: Late Game Nation (200k pop, Tech 4, Infra 4)

#### Current System
```
Tax Revenue:
  Base: (200k/10k) × 15 = 300
  Tech multiplier: 1 + (4 × 0.25) = 2.0x
  Infra multiplier: 1 + (4 × 0.15) = 1.6x
  Total: 960/turn

Food Production:
  Base: (200k/10k) × 6.5 = 130
  Tech multiplier: 3.0x (discrete)
  Infra multiplier: 1.6x
  Total: 624/turn

Expenses:
  Military upkeep (80 str): 64/turn
  Maintenance: ~48/turn
  Infra maintenance: 80/turn
  Total: 192/turn

Net Income: +768/turn

Upgrade Costs:
  Tech 4→5: $1,921 (2.5 turns)
  Infra 4→5: $1,999 (2.6 turns)
```

#### Proposed System
```
Tax Revenue:
  Base: (200k/10k) × 12 = 240
  Tech multiplier: 2.5x (discrete - AFFECTS PRODUCTION)
  Infra multiplier: 1 + (4 × 0.12) = 1.48x
  Capacity penalty: 1.0x (400k cap)
  Total: 888/turn

Food Production:
  Base: (200k/10k) × 6.5 = 130
  Tech multiplier: 2.5x (discrete)
  Infra multiplier: 1.0x (REMOVED)
  Total: 325/turn

Expenses:
  Military upkeep (80 str): 64/turn
  Maintenance: ~50/turn
  Infra maintenance: 140/turn
  Total: 254/turn

Net Income: +634/turn
+ Trade revenue: ~150/turn (4 deals @ 140% efficiency)
= +784/turn total

Upgrade Costs (Balanced Nation):
  Tech 4→5: $2,657 (3.4 turns)
  Infra 4→5: $1,999 (2.5 turns)

Population Capacity: 400k (at capacity! Need infra to grow)
Trade Capacity: 6 deals max
Military Effectiveness: 80 str × 1.8 = 144 effective (almost 2x!)
Military recruitment: 50 × 0.8 = 40 per strength (20% cheaper)
```

**Impact:** Similar total income (trade compensates). Food production much lower (need good management). Military is MUCH more effective. Population growth requires infra investment.

---

## Profile Comparison Examples

### Technological Hub Profile

#### Tech Upgrade (Level 2→3)

**Current:** $980 (no profile modifier)

**Proposed:** $1,458 × 0.75 = **$1,094** (cheaper!)

**Military Recruitment (10 strength)**

**Current:** $500 (no tech benefit, no profile modifier)

**Proposed:** $500 × 0.90 (profile) × 0.90 (tech 2) = **$405** (much cheaper!)

**Tax Revenue (100k pop, Tech 2, Infra 1)**

**Current:** 
- Base: 150
- Tech: 1.5x
- Infra: 1.15x
- Total: 259/turn

**Proposed:**
- Base: 120
- Tech: 1.6x (production only)
- Infra: 1.12x
- Profile: 1.05x
- Total: 225/turn
- But +5% from profile

**Assessment:** Tech Hub benefits from cheaper tech and military, but slightly lower tax. Fits the theme!

---

### Agricultural Powerhouse Profile

#### Tech Upgrade (Level 2→3)

**Current:** $980 (no profile modifier)

**Proposed:** $1,458 × 1.15 = **$1,677** (more expensive)

**Infrastructure Upgrade (Level 2→3)**

**Current:** $1,014 (no profile modifier)

**Proposed:** $1,183 × 1.05 = **$1,242** (slightly more expensive)

**Food Production (150k pop, Tech 2, Infra 2)**

**Current:**
- Base: 97.5
- Tech: 1.7x
- Infra: 1.3x
- Profile: 1.8x
- Total: 388/turn

**Proposed:**
- Base: 97.5
- Tech: 1.6x
- Infra: 1.0x (removed)
- Profile: 1.8x
- Total: 281/turn (lower, but still strong from profile!)

**Tax Revenue (150k pop, Tech 2, Infra 2)**

**Current:** 439/turn

**Proposed:** 268/turn (lower, fits the rural theme)

**Assessment:** Agricultural nations produce lots of food but have weaker economy and tech. Need to trade food for income. Thematically perfect!

---

### Industrial Complex Profile

#### Infrastructure Upgrade (Level 2→3)

**Current:** $1,014 (no profile modifier)

**Proposed:** $1,183 × 0.80 = **$946** (cheaper! Their strength)

**Tech Upgrade (Level 2→3)

**Current:** $980 (no profile modifier)

**Proposed:** $1,458 × 1.15 = **$1,677** (expensive, not their focus)

**Trade Deals**

**Current:** No profile benefit

**Proposed:** Trade revenue × 1.10 (10% bonus from industrial exports)

**Assessment:** Industrial nations excel at infrastructure and trade, but lag in technology. Can export manufactured goods.

---

## Resource Production Comparison

### Before (Tech 2, Infra 3, Balanced Nation)

```
Food:
  Base: (150k/10k) × 6.5 = 97.5
  Tech: 1.7x
  Infra: 1 + (3 × 0.15) = 1.45x
  Profile: 1.0x
  Total: 240 food/turn

Iron:
  Base: 10 × 0.7 = 7
  Tech: 1.7x
  Infra: 1.45x
  Profile: 1.0x
  Total: 17 iron/turn

Oil:
  Base: 10 × 0.5 = 5
  Tech: 1.7x
  Infra: 1.45x
  Profile: 1.0x
  Total: 12 oil/turn
```

### After (Tech 2, Infra 3, Balanced Nation)

```
Food:
  Base: (150k/10k) × 6.5 = 97.5
  Tech: 1.6x
  Infra: 1.0x (REMOVED)
  Profile: 1.0x
  Total: 156 food/turn (-35% less!)

Iron:
  Base: 10 × 0.7 = 7
  Tech: 1.6x
  Infra: 1.0x (REMOVED)
  Profile: 1.0x
  Total: 11 iron/turn (-35% less!)

Oil:
  Base: 10 × 0.5 = 5
  Tech: 1.6x
  Infra: 1.0x (REMOVED)
  Profile: 1.0x
  Total: 8 oil/turn (-33% less!)
```

**Key Insight:** Resource production is significantly lower without infra multiplier. This makes:
1. Resource management more important
2. Profile bonuses more valuable (Agriculture 1.8x food becomes crucial)
3. Technology upgrades more impactful
4. Trade more necessary (can't produce everything easily)

---

## Strategic Gameplay Differences

### Current System Strategy

**Optimal Play:**
1. Build both tech and infra (they both help everything)
2. No real choice between them
3. Just maximize both
4. Profile doesn't matter for costs

**Problems:**
- Boring decisions
- No meaningful trade-offs
- All nations play the same way

---

### Proposed System Strategy

**Technology-Focused Strategy:**
- **When:** Technological Hub, want strong military
- **Benefits:** High resource production, strong military effectiveness, cheap recruitment
- **Trade-offs:** Lower population capacity, fewer trade deals
- **Playstyle:** Produce resources efficiently, use military might

**Infrastructure-Focused Strategy:**
- **When:** Coastal Trading Hub, Industrial Complex, want to grow large
- **Benefits:** High tax revenue, many trade deals, large population, good storage
- **Trade-offs:** Lower resource production, need to trade for resources
- **Playstyle:** Tax and trade, buy resources, grow population

**Balanced Strategy:**
- **When:** Balanced Nation, uncertain situation
- **Benefits:** Moderate in everything
- **Trade-offs:** No strengths
- **Playstyle:** Adapt to circumstances

**Resource-Focused Strategy:**
- **When:** Agricultural, Mining Empire, Oil Kingdom
- **Benefits:** Massive resource bonuses from profile
- **Trade-offs:** Expensive tech/infra, weaker economy
- **Playstyle:** Produce and export resources, buy tech/infra upgrades

**Key Difference:** Meaningful strategic choices! Different profiles play differently!

---

## Migration Considerations

### What Breaks

1. **Existing games:** Tax revenue will change mid-game
2. **AI decision logic:** Needs updating for new systems
3. **Upgrade costs:** Different for existing players
4. **Resource production:** Will drop if only infra is built

### What's Preserved

1. **Database schema:** No changes needed (just value adjustments)
2. **Resource system:** Core mechanics unchanged
3. **Population system:** Core mechanics unchanged
4. **UI components:** Mostly cosmetic updates

### Recommended Migration Path

**Option 1: Clean Break**
- Apply to new games only
- Existing games continue with old system
- Gradual transition as old games complete

**Option 2: Instant Migration**
- Update all games immediately
- Recalculate values to be "fair" (grant equivalent bonuses)
- May upset some players

**Option 3: Staged Rollout**
- Week 1: Update costs only
- Week 2: Add new infra features
- Week 3: Remove tech from tax
- Week 4: Add profile modifiers

**Recommendation:** Option 1 (Clean Break) for safety, or Option 3 (Staged) if existing playerbase is large.

---

## Conclusion

### What Players Will Notice

**Immediately:**
- Upgrades cost more (slower early game)
- Infrastructure does different things
- Their profile matters for costs

**After a few turns:**
- Resource production is tighter (need better management)
- Population growth can hit caps (need infra)
- Military tech makes big difference
- Trade is more valuable

**After full games:**
- Different profiles play very differently
- More strategic depth
- More meaningful choices
- Better balance

### Developer Benefits

- Cleaner code separation (tech vs infra)
- Easier to balance (clear roles)
- Natural extension to subtypes
- More engaging gameplay

### Overall Assessment

**Current System:** Simple, functional, but shallow and imbalanced
**Proposed System:** More complex, but in a good way - depth through strategic choice, not confusing mechanics

The redesign achieves all stated goals: differentiation, balance, profile integration, and future-proofing.
