# Diplomatic UI and Attack Fixes

## Issues Identified

### 1. **Diplomatic Relations Not Displayed**
**Root Cause**: CountryCard component doesn't show diplomatic relations with the selected country.

**Fix**: Add diplomatic relations display under the country name showing the current relation score and status indicator.

### 2. **"Target city is not adjacent" Error (False Positive)**
**Root Cause**: In `/api/military/attack/route.ts`, the adjacency check uses `attackRange = 10` which is very restrictive. The visual map shows territories based on Voronoi diagrams, but the API validation uses point-to-point distance between city centers, which doesn't match the visual border representation.

**Issue**: Cities that visually appear to share a border may have centers more than 10 units apart, causing false "not adjacent" errors.

**Fix**: Increase attack range to 15 to better match visual territory borders, or implement proper territory-based adjacency checking.

### 3. **"Allocated strength exceeds current military strength" Error (False Positive)**
**Root Cause**: In `/api/military/attack/route.ts` line 87, the validation compares `allocatedStrength` (which is calculated from **effective strength** including tech bonuses) against `currentStrength` (which is the **raw military strength** from the database, NOT including tech bonuses).

**Code**:
```typescript
const currentStrength = Number(stats.military_strength); // Raw strength from DB
if (allocatedStrength > currentStrength) {  // BUG: comparing effective vs raw
  return NextResponse.json({ error: "Allocated strength exceeds..." }, { status: 400 });
}
```

In AttackModal, the slider allocates based on **effective strength** (with tech bonuses), but the API validates against raw strength, causing the mismatch.

**Example**:
- Raw strength: 100
- Tech level: 2 (40% bonus)
- Effective strength: 140
- Player allocates: 70 (50% of effective strength)
- API validation: 70 > 100 ❌ (should pass, but fails)

**Fix**: Calculate effective strength in the API validation using `MilitaryCalculator.calculateEffectiveMilitaryStrength()` before comparing.

### 4. **Missing Global Diplomatic Relations View**
**Root Cause**: No UI component exists to show all diplomatic relations between all countries.

**Fix**: Create a new modal/panel accessible from the UI showing a matrix or list of all countries' relations with each other.

## Implementation Plan

1. **CountryCard Enhancement**: Add diplomatic relations display
2. **Attack Range Fix**: Increase attack range from 10 to 15
3. **Strength Validation Fix**: Use effective strength in API validation
4. **Global Diplomacy View**: Create new component for viewing all relations
