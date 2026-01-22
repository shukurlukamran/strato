# LLM Strategic Persistence - Root Cause Analysis & Fixes

## Issue Summary
AI countries are not following LLM strategic advice after Turn 2. The LLM generates strategic plans every 5 turns, but countries either:
1. Don't execute LLM steps correctly
2. Fall back to rule-based logic that contradicts LLM strategy
3. Lose plan items when retrieving from database

## Root Causes Identified

### 1. **Plan Items Not Persisting/Retrieving Correctly**
**Evidence from logs:**
- Turn 2: Borealis has 5 action steps (infrastructure, trading, monitoring, tech upgrade)
- Turn 3: Shows `steps=0 executable=0` - plan items lost!

**Code issue:** In `LLMStrategicPlanner.ts:885-890`, the persistence logic mixes plan items with legacy strings:
```typescript
recommended_actions: Array.isArray(analysis.planItems) && analysis.planItems.length > 0
  ? [
      ...analysis.planItems,
      ...analysis.recommendedActions.map(...)
    ]
  : analysis.recommendedActions,
```
This creates a mixed array, but the retrieval logic (lines 807-826) doesn't properly reconstruct it.

### 2. **Fallback to Rule-Based Contradicts LLM Strategy**
**Evidence from logs:**
- Turn 3 Borealis: LLM said "focus on economy, upgrade infrastructure"
- But executed: `{ type: 'research', targetLevel: 4 }` (rule-based fallback)

**Code issue:** In `EconomicAI.ts:58-60`:
```typescript
const llmPreferred = this.tryLLMEconomicActions(...);
if (llmPreferred.length > 0) {
  return llmPreferred;
}
// Falls through to rule-based logic below!
```
When no executable LLM steps exist, it ignores the LLM's strategic focus entirely.

### 3. **Trading Actions Not Executable**
**Evidence from logs:**
- Falken Turn 2: LLM recommends "Initiate and maintain 3 profitable trade deals"
- Marked as `noExecution` because trading isn't an action type
- Result: 0 actions, nothing happens

**Design issue:** Trading isn't implemented as an executable action type. Only `research`, `economic`, and `military` exist.

### 4. **Wrong Action Prioritization**
**Evidence from logs:**
- Borealis Turn 2: Should execute step 1 (infrastructure)
- Actually executed: step 4 (tech upgrade)

**Code issue:** Step selection doesn't respect priority ordering when multiple steps are executable.

## Fixes Required

### Fix 1: Store Plan Items Separately in Database
- Don't mix plan items with legacy strings
- Add dedicated column for plan items or use proper JSONB structure
- Ensure retrieval reconstructs plan items correctly

### Fix 2: Respect LLM Strategic Focus in Fallback
- When no executable LLM steps exist, use LLM's focus to guide rule-based logic
- Don't contradict LLM strategy (e.g., if LLM says "economy", don't do research)
- Add logging to show "following LLM strategic focus with rule-based execution"

### Fix 3: Handle Non-Executable Steps Gracefully
- Log non-executable steps (trading, monitoring) so they're visible
- Consider implementing basic trading actions in future
- For now, ensure they don't cause countries to do nothing

### Fix 4: Fix Priority Ordering
- Ensure steps are executed in priority order (1, 2, 3...)
- When conditions aren't met, try next priority step
- Log which step was chosen and why

### Fix 5: Improve Debug Logging
- Show why each step was skipped (noExecution, whenUnmet, banned, etc.)
- Show which step was actually chosen
- Show if falling back to rule-based and why

## Implementation Plan

1. **Database Migration** (if needed):
   - Check if plan items storage/retrieval is working
   - Consider separate column for structured plan items

2. **EconomicAI.ts Changes**:
   - Modify fallback logic to respect LLM strategic focus
   - Add "strategic alignment" mode when no executable LLM steps
   - Better logging for decision rationale

3. **MilitaryAI.ts Changes**:
   - Same fallback respect as EconomicAI
   - Ensure military decisions align with LLM guidance

4. **LLMStrategicPlanner.ts Changes**:
   - Fix persistence to clearly separate plan items from strings
   - Fix retrieval to properly reconstruct plan items
   - Add validation that plan items survive round trip

5. **Testing**:
   - Verify Borealis follows its plan on Turn 3
   - Verify Falken does something meaningful even without trading
   - Verify all countries respect LLM bans
   - Verify no contradictory actions

## Success Criteria

✅ Plan items persist correctly across turns (steps=5 on both T2 and T3)
✅ Countries follow LLM strategic focus even without executable steps
✅ No contradictory actions (e.g., LLM says economy, AI does research)
✅ Trading recommendations are logged and acknowledged
✅ Correct priority ordering (step 1 before step 4)
✅ Clear debug logs showing decision rationale
