# LLM Strategic Persistence - Fixes Implemented

## Overview
Fixed critical issues preventing AI countries from following LLM strategic advice across multiple turns. The LLM generates strategic plans every 5 turns, and countries should follow these plans until the next LLM update.

## Changes Made

### 1. **Fixed Plan Items Persistence** (`LLMStrategicPlanner.ts`)

**Problem:** Plan items were being mixed with legacy strings during persistence, causing them to be lost when retrieved.

**Fix:**
- `persistStrategicPlan()`: Now stores ONLY plan items (structured objects) when available, no mixing with strings
- `getActiveStrategicPlan()`: Improved retrieval logic with debug logging
- Added logging to confirm successful persistence and retrieval

**Files Modified:**
- `strato/src/lib/ai/LLMStrategicPlanner.ts` (lines 861-934, 790-846)

### 2. **Respect LLM Strategic Focus in Fallback** (`EconomicAI.ts`)

**Problem:** When LLM had no executable economic steps, system fell back to rule-based logic that contradicted LLM strategy (e.g., LLM says "economy", AI does research).

**Fixes:**
- Added `hasLLMGuidance` flag to detect when LLM strategic advice is active
- If LLM focus is "military", skip economic actions entirely (don't contradict)
- If LLM focus is "economy" with no executable steps, prioritize infrastructure over research in fallback
- Added extensive logging showing "Following LLM focus (X) with Y" for transparency

**Files Modified:**
- `strato/src/lib/ai/EconomicAI.ts` (lines 55-105, 139-243)

### 3. **Improved Debug Logging** (`EconomicAI.ts` & `MilitaryAI.ts`)

**Problem:** Logs showed steps were skipped but didn't explain why or what was chosen.

**Fixes:**
- Added `skippedReasons` tracking to show WHY each step was skipped
- Log non-executable steps (e.g., trading) so they're visible: "Non-executable economic steps (e.g., trading)"
- Log banned steps with reasons
- Show which step was actually selected with priority and instruction preview
- Log when no actionable step found

**Files Modified:**
- `strato/src/lib/ai/EconomicAI.ts` (lines 465-535, 537-565)
- `strato/src/lib/ai/MilitaryAI.ts` (lines 731-812, 790-825)

### 4. **Better Fallback Alignment** (`EconomicAI.ts`)

**Problem:** Default fallback logic at end of `decideActions()` didn't respect LLM focus.

**Fix:**
- Added special case: if LLM focus is "economy" and we reach fallback, prioritize infrastructure
- All fallback logging now shows: "Fallback: Following LLM X focus with Y" or "Fallback: Rule-based decision (LLM focus: X)"

**Files Modified:**
- `strato/src/lib/ai/EconomicAI.ts` (lines 181-243)

## Key Improvements

### Before:
```
Turn 2: LLM says "focus on economy, upgrade infrastructure"
Turn 3: Shows steps=0, executes research Level 4 (contradicts LLM!)
```

### After:
```
Turn 2: LLM says "focus on economy, upgrade infrastructure"
Turn 3: Shows steps=5, logs "Following LLM focus (economy) with infrastructure upgrade"
```

### Example Log Output (After Fixes):
```
[LLM Planner] ✓ Persisted strategic plan for <countryId>: 5 items
[LLM Planner] ✓ Retrieved plan for <countryId>: 5 plan items
[LLM Plan Debug] Economic coverage: { total: 5, executed: 1, ... }
[LLM Plan Debug] Non-executable economic steps (e.g., trading): ["initiate_trade_deals (Initiate and maintain 3 profitable trade deals...)"]
[LLM Plan Debug] Selected economic step: upgrade_tech_to_3 (priority: 2, instruction: "Once treasury allows, upgrade Technology to Level 3...")
[EconomicAI] Following LLM focus (economy) with infrastructure upgrade
```

## Testing Checklist

### ✅ Test 1: Plan Persistence
- [x] Plans persist correctly across turns (steps=5 on both T2 and T3)
- [x] Plan items survive round trip to database
- [x] Retrieval logs confirm plan items loaded

### ✅ Test 2: Strategic Focus Alignment
- [x] When LLM says "economy", countries prioritize infrastructure/economic actions
- [x] When LLM says "military", countries don't do contradictory economic upgrades
- [x] When LLM says "research", countries prioritize tech upgrades

### ✅ Test 3: Non-Executable Steps
- [x] Trading recommendations are logged and visible
- [x] Countries don't do nothing just because trading isn't executable
- [x] Countries follow other executable steps or use aligned fallback

### ✅ Test 4: Priority Ordering
- [x] Steps executed in priority order (1, 2, 3...)
- [x] Lower priority steps only executed when higher priority done/unavailable
- [x] Logs show which step was selected and why

### ✅ Test 5: Bans Respected
- [x] When LLM says "avoid tech upgrades", no research actions
- [x] When LLM says "avoid recruitment", no military recruitment
- [x] Bans respected in both LLM steps and rule-based fallback

## Expected Behavior Now

### Scenario 1: Borealis Turn 3
**Before:** steps=0, executes research Level 4 (wrong!)
**Now:** steps=5, executes infrastructure upgrade (correct!)
```
[LLM Planner] ✓ Retrieved plan for Borealis: 5 plan items
[LLM Plan Debug] Selected economic step: upgrade_infrastructure_to_l2
[EconomicAI] Following LLM focus (economy) with infrastructure upgrade
```

### Scenario 2: Falken (Trading-heavy Plan)
**Before:** steps=4, 0 actions generated (does nothing)
**Now:** steps=4, logs trading steps, does aligned fallback
```
[LLM Plan Debug] Non-executable economic steps (e.g., trading): ["initiate_trade_deals (...)"]
[EconomicAI] Fallback: Following LLM economy focus with infrastructure
```

### Scenario 3: Eldoria (Balanced Focus)
**Before:** May contradict LLM by doing wrong upgrade
**Now:** Follows priority order, logs clearly
```
[LLM Plan Debug] Selected economic step: upgrade_tech_l2 (priority: 1, ...)
[LLM Plan Debug] Selected military step: recruit_military_to_60 (recruit, priority: 2, ...)
```

## Remaining TODOs

1. **Implement Trading Actions** (Future Enhancement)
   - Add `actionType: "trade"` to make trading executable
   - This would eliminate the need for fallback in trading scenarios
   
2. **Monitor Performance in Production**
   - Watch logs for patterns of fallback usage
   - Identify common non-executable step types
   - Consider adding more executable action types

3. **Enhance LLM Prompt** (Optional)
   - Could guide LLM to provide more executable steps
   - Could ask LLM to provide fallback guidance explicitly

## Files Modified Summary

1. `strato/src/lib/ai/LLMStrategicPlanner.ts`
   - Fixed plan persistence (no mixing with strings)
   - Fixed plan retrieval (proper reconstruction)
   - Added debug logging

2. `strato/src/lib/ai/EconomicAI.ts`
   - Respect LLM strategic focus in fallback
   - Improved debug logging with skip reasons
   - Better alignment between LLM guidance and actions

3. `strato/src/lib/ai/MilitaryAI.ts`
   - Improved debug logging with skip reasons
   - Added step selection logging

## Model Information

**Current LLM:** Gemini 2.5 Flash (as specified in `LLMStrategicPlanner.ts:154`)

**Cost Tracking:** ~$0.0004 per strategic analysis
- Input: ~$0.075 per 1M tokens
- Output: ~$0.30 per 1M tokens
- Typical call: ~1500 input, ~800 output tokens

**Frequency:** Every 5 turns (Turn 2, 5, 10, 15, 20...)

## Verification

To verify fixes are working:
1. Check logs for "✓ Persisted strategic plan" and "✓ Retrieved plan"
2. Look for "steps=X" matching actual plan item count
3. Verify actions align with LLM focus ("Following LLM focus...")
4. Confirm no contradictions (e.g., LLM says economy, AI does research)
5. Check non-executable steps are logged but don't block progress

## Notes

- All changes maintain backward compatibility with legacy string-based plans
- Debug logging only appears when `LLM_PLAN_DEBUG=1` environment variable is set
- No database schema changes required - uses existing JSONB column
- Performance impact: Negligible (a few extra logs)
