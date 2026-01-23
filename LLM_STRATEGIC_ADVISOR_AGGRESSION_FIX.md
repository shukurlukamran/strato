# LLM Strategic Advisor Aggression Fix

## Problem
The LLM Strategic Advisor was being overly defensive and never recommending attacks, even when countries had military advantages over their neighbors.

## Root Causes Identified

1. **Negative framing of attacks**: The game rules described attacks as "Conquer enemies (risky)" which discouraged the LLM from recommending them

2. **No attack examples**: The prompt examples only showed economic development (tech/infra/recruit) with NO concrete examples of attack actions

3. **Low temperature**: Temperature of 0.2-0.3 made the model very conservative and predictable

4. **Defensive system messages**: System messages emphasized "strategic recommendations" without mentioning conquest or expansion

5. **Threat-only neighbor summary**: Only highlighted threatening neighbors, not weak neighbors that could be conquered

## Changes Made

### 1. Updated Game Rules (CACHED_GAME_RULES)
**Before:**
```
4. ATTACK CITY: Conquer enemies (risky)
```

**After:**
```
4. ATTACK CITY: Conquer enemies to expand territory. Success requires strength advantage. Cost: 100 base + 50/strength allocated

WINNING STRATEGIES:
- Economic: Build tech + infra for long-term dominance
- Military: Build strength, then attack weak neighbors to expand
- Balanced: Alternate economic growth with strategic conquests
```

### 2. Added Attack Examples to Prompts

**Single Country Prompt:**
Added two complete strategy examples:
- ECONOMIC FOCUS: Shows defensive play with minimal military
- MILITARY FOCUS: Shows aggressive expansion with attacks on weak neighbors

**Batch Prompt:**
Updated example action_plan to include an attack step:
```json
{"id":"attack_city","instruction":"Attack weak neighbor","priority":3,"when":{"military_strength_gte":40},"execution":{"actionType":"military","actionData":{"subType":"attack","targetCityId":"<city_id>","allocatedStrength":25}}}
```

### 3. Enhanced Neighbor Summary

**Before:** Only showed threats (⚠️)

**After:** Shows both threats AND opportunities:
- ⚠️THREAT: For stronger neighbors
- 🎯WEAK (conquest opportunity): For neighbors with <70% of our military strength

This explicitly highlights attack opportunities to the LLM.

### 4. Updated System Messages

**Batch Analysis - Before:**
```
You are a strategic AI advisor analyzing multiple nations in a turn-based strategy game.
```

**After:**
```
You are an aggressive strategic AI advisor in a turn-based conquest game. Nations expand by attacking weak neighbors. Recommend BOTH economic development AND military conquests when advantageous.
```

**Single Country - Before:**
```
You are a strategic AI advisor for a nation in a turn-based strategy game.
```

**After:**
```
You are an aggressive strategic AI advisor for a nation in a turn-based conquest game. Nations expand by conquering weak neighbors. Recommend military attacks when the nation is strong, or economic development when weak. Balance risk vs reward.
```

### 5. Increased Temperature

- Batch analysis: 0.3 → 0.5 (more varied/aggressive strategies)
- Single analysis: 0.2 → 0.4 (balanced between variety and JSON reliability)

This allows the model to be more creative and less conservative.

### 6. Updated Prompt Instructions

Added explicit rules:
```
RULES: 
- Include ATTACKS when militarily advantageous (stronger than neighbors)
- Economic builds are for WEAKER nations or tech advantage seekers
- 6-8 executable steps (tech/infra/recruit/attack)
- Use "when" conditions to sequence actions properly
```

## Expected Impact

1. **More aggressive AI**: Countries with military advantages will now recommend attacks on weak neighbors

2. **Strategic variety**: Higher temperature + attack examples = more diverse strategies

3. **Context-aware decisions**: 
   - Strong countries → Attack weak neighbors
   - Weak countries → Economic development
   - Balanced countries → Mix of both

4. **Better conquest gameplay**: AI will actively pursue territorial expansion when advantageous

## Testing Recommendations

1. Create a game with several AI countries at different military strengths
2. Observe LLM strategic decisions on turns 2, 10, 20, 30, 40 (LLM evaluation turns)
3. Verify that:
   - Strong countries recommend attacks on weaker neighbors
   - Weak countries focus on economic development
   - The "🎯WEAK (conquest opportunity)" label appears in neighbor summaries
   - Attack actions appear in the action_plan arrays

## Files Modified

- `src/lib/ai/LLMStrategicPlanner.ts`
  - `CACHED_GAME_RULES` constant
  - `buildStrategicPrompt()` method
  - `buildBatchStrategicPrompt()` method
  - `getNeighborsSummary()` method
  - System messages in both API calls
  - Temperature settings

## Backward Compatibility

All changes are backward compatible:
- Existing database records still work
- No changes to action execution logic
- Only changes to LLM prompts and analysis
