# Economic Redesign - Quick Reference Guide

## 🎯 Core Changes (One-Pagers)

### What Changed: The Big Picture

**BEFORE:** Tech and Infra both affected tax AND production (redundant)
**AFTER:** Completely separated roles:

```
TECHNOLOGY = PRODUCTION & MILITARY
  ↓
  • Resource production multipliers
  • Military effectiveness (+20%/level)
  • Military cost reduction (-5%/level)

INFRASTRUCTURE = CAPACITY & ADMINISTRATION
  ↓
  • Tax collection efficiency (+12%/level)
  • Population capacity (+50k/level)
  • Trade capacity (+1 deal/level)
  • Trade efficiency (+10%/level)
```

---

## 📊 Quick Formulas

### Tax Revenue (Changed!)
```
OLD: Population × 15 × techMultiplier × infraMultiplier
NEW: Population × 12 × infraEfficiency × capacityPenalty × profileMod

Example (150k pop, Tech 2, Infra 2):
  OLD: (150k/10k) × 15 × 1.5 × 1.3 = 439/turn
  NEW: (150k/10k) × 12 × 1.24 = 223/turn (but trade compensates!)
```

### Resource Production (Changed!)
```
OLD: Base × techMultiplier × infraMultiplier × profileMod
NEW: Base × techMultiplier × profileMod

Example (Food, 150k pop, Tech 2, Infra 2):
  OLD: 97 × 1.7 × 1.3 = 216/turn
  NEW: 97 × 1.6 = 156/turn (35% less!)
```

### Military Effectiveness (NEW!)
```
effectiveStrength = baseStrength × (1 + techLevel × 0.20)

Example (50 strength, Tech 3):
  Base: 50
  Tech bonus: +60%
  Effective: 80 strength
```

### Population Capacity (NEW!)
```
capacity = 200,000 + (infraLevel × 50,000)

Example:
  Infra 0: 200k capacity
  Infra 3: 350k capacity
  Infra 5: 450k capacity

If population > capacity:
  • -50% growth rate
  • -20% tax revenue
  • +10% food consumption
```

---

## 💰 Upgrade Costs

### Technology
```
Cost = 800 × 1.35^level × profileMod × researchBonus

Profile Modifiers:
  • Tech Hub: 0.75x (CHEAP!)
  • Balanced: 1.0x
  • Agriculture: 1.15x (expensive)
  • Precious Metals: 1.20x (very expensive)

Research Bonus: -3% per current level (max -15%)

Examples:
  Tech Hub Level 0→1: 800 × 0.75 = $600
  Agriculture Level 0→1: 800 × 1.15 = $920
  Tech Hub Level 2→3: 1,458 × 0.75 × 0.94 = $1,027
```

### Infrastructure
```
Cost = 700 × 1.30^level × profileMod

Profile Modifiers:
  • Industrial: 0.80x (CHEAP!)
  • Coastal Hub: 0.85x (cheap)
  • Balanced: 1.0x
  • Mining/Oil: 1.15x (expensive)
  • Precious Metals: 1.20x (very expensive)

Examples:
  Industrial Level 0→1: 700 × 0.80 = $560
  Oil Kingdom Level 0→1: 700 × 1.15 = $805
  Industrial Level 2→3: 1,183 × 0.80 = $946
```

### Military
```
Cost = 50 × amount × techReduction × profileMod

Tech Reduction: 1 - (min(0.25, techLevel × 0.05))
Profile Modifiers:
  • Mining/Tech Hub: 0.90x (cheap)
  • Balanced: 1.0x
  • Precious Metals: 1.15x (expensive)

Example (10 strength, Tech 3, Mining Empire):
  Base: 50 × 10 = 500
  Tech: ×0.85 (15% off)
  Profile: ×0.90 (10% off)
  Final: 500 × 0.85 × 0.90 = $383
```

---

## 🎮 Profile Strategies

### Tech Hub (Best for Production & Military)
```
Strengths:
  ✅ Tech 25% cheaper
  ✅ Military 10% cheaper
  ✅ +5% tax bonus

Strategy:
  1. Rush tech to Level 3-4
  2. Dominate with production & military
  3. Build infra only when hitting capacity

When to pick: Want strong military early
```

### Industrial Complex (Best for Building)
```
Strengths:
  ✅ Infra 20% cheaper
  ✅ +10% trade revenue

Strategy:
  1. Build infrastructure early
  2. Maximize trade deals
  3. Grow large population
  4. Export manufactured goods

When to pick: Want large empire, many trades
```

### Coastal Trading Hub (Best for Trade)
```
Strengths:
  ✅ Infra 15% cheaper
  ✅ +25% trade revenue (HUGE!)

Strategy:
  1. Build infra for trade capacity
  2. Establish many trade deals
  3. Become merchant empire
  4. Economy from trade, not production

When to pick: Want to dominate trade
```

### Agriculture (Best for Food)
```
Strengths:
  ✅ +80% food production from profile
  ✅ Self-sufficient

Weaknesses:
  ❌ Tech 15% more expensive
  ❌ -5% trade revenue

Strategy:
  1. Focus on food production
  2. Export food for income
  3. Minimal tech/infra investment
  4. Grow population steadily

When to pick: Want to be the breadbasket
```

### Mining Empire (Best for Resources & Military)
```
Strengths:
  ✅ +220% iron, +250% rare earth
  ✅ Military 10% cheaper
  ✅ +5% military effectiveness

Weaknesses:
  ❌ Tech 15% more expensive
  ❌ Infra 15% more expensive
  ❌ -5% tax

Strategy:
  1. Extract resources heavily
  2. Export resources for income
  3. Build strong military (cheap!)
  4. Minimal tech/infra

When to pick: Want strong military + resources
```

---

## ⚡ Quick Decision Guide

### Should I build TECH?
✅ YES if:
- Need more resource production
- Want stronger military
- Playing as Tech Hub
- Cheap for your profile

❌ NO if:
- Hitting population capacity
- Need trade capacity
- Expensive for your profile
- Starving or bankrupt

### Should I build INFRA?
✅ YES if:
- Population near/over capacity
- Want more trade deals
- Need better tax collection
- Playing Industrial/Coastal
- Cheap for your profile

❌ NO if:
- Population way below capacity
- Don't need trade
- Need production boost
- Expensive for your profile
- Bankrupt

### Should I build MILITARY?
✅ YES if:
- Neighbors are strong
- Want to expand
- Playing Mining Empire
- Have high tech (effectiveness!)

❌ NO if:
- Peaceful situation
- Economy struggling
- Very expensive for profile
- Low tech (not effective)

---

## 🔥 Critical Warnings

### ⚠️ OVERCROWDING
```
If population > capacity:
  You LOSE:
    • 50% growth rate
    • 20% tax revenue
    • More food needed

  FIX:
    → Build infrastructure immediately!
```

### ⚠️ FOOD SHORTAGE
```
If food < consumption:
  You LOSE:
    • 3% population/turn
    • Economic collapse

  FIX:
    → Build tech for production
    → Trade for food
    → If Agriculture profile, leverage bonus
```

### ⚠️ BANKRUPTCY
```
If budget < expenses:
  You can't:
    • Build anything
    • Recruit military
    • Function

  FIX:
    → Build infra for tax (if have budget)
    → Reduce military (lower upkeep)
    → Establish trade deals
```

---

## 📈 Progression Guidelines

### Early Game (Turns 1-10)
```
Priority: Establish economy base
Actions:
  1. Get Tech to 1-2 (production)
  2. Get Infra to 1-2 (capacity)
  3. Small military (30-40)
  4. Establish 1-2 trade deals

Target Economy:
  • +50-100 budget/turn
  • Food positive
  • Below capacity
```

### Mid Game (Turns 11-25)
```
Priority: Specialize based on profile
Tech Hub:
  → Push tech to 3-4
  → Build military
  → Minimal infra

Industrial/Coastal:
  → Push infra to 3-4
  → Max out trade deals
  → Grow population

Resource Nations:
  → Leverage profile bonuses
  → Export resources
  → Minimal upgrades

Target Economy:
  • +200-400 budget/turn
  • Multiple trade deals
  • Approaching capacity
```

### Late Game (Turns 26+)
```
Priority: Dominance
All Profiles:
  → Tech 4-5 (max production/military)
  → Infra 4-5 (max capacity/trade)
  → Large military if competitive
  → Diversified economy

Target Economy:
  • +500-1000 budget/turn
  • Food secure
  • At capacity (need infra)
  • Strong military
```

---

## 🎯 Win Conditions

### Economic Victory
```
Requirements:
  • Highest budget
  • Most trade deals
  • Largest population

Best Profiles:
  • Coastal Trading Hub
  • Industrial Complex
  • Precious Metals Trader
```

### Military Victory
```
Requirements:
  • Strongest effective military
  • Control territory
  • Defend borders

Best Profiles:
  • Technological Hub
  • Mining Empire
```

### Diplomatic Victory
```
Requirements:
  • Most alliances
  • Most trade partners
  • Highest relations

Best Profiles:
  • Coastal Trading Hub
  • Balanced Nation
```

---

## 🛠️ Troubleshooting

### "My tax revenue is too low!"
- Build more infrastructure
- Check if overcrowded (penalty!)
- Consider profile (some have lower tax)
- Remember: Tech no longer affects tax!

### "I'm not producing enough resources!"
- Build more technology
- Check profile bonuses (leverage them!)
- Remember: Infra no longer affects production!
- Trade for what you need

### "My military is too weak!"
- Build more technology (effectiveness!)
- Recruit more units (cheaper with tech!)
- Check profile (some get discounts)
- Tech Level 3+ makes huge difference

### "I can't grow my population!"
- Build more infrastructure (capacity!)
- Check if overcrowded (huge penalty!)
- Ensure food surplus
- Each infra = +50k capacity

---

## ✅ Quick Checklist (Every 5 Turns)

- [ ] Am I overcrowded? (Build infra!)
- [ ] Is food production > consumption?
- [ ] Is budget growing or shrinking?
- [ ] Am I using my profile bonuses?
- [ ] Do I have military effectiveness from tech?
- [ ] Am I maxing trade capacity?
- [ ] Are upgrade costs reasonable for my profile?
- [ ] Is my strategy aligned with my profile?

---

**Remember:** Tech = Production & Military | Infra = Capacity & Admin

Good luck! 🚀
