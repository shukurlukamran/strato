# Testing Guide for Optimization Changes

## Quick Verification Steps

### 1. Verify Token Reduction (Expected: ~60% reduction)

**Before optimization**:
```
Input: ~2100 tokens
Output: ~1800 tokens
Cost: ~$0.0008 per country
```

**After optimization**:
```
Input: ~700-900 tokens (60% reduction)
Output: ~1200-1500 tokens (20% reduction)
Cost: ~$0.0003 per country (62% savings)
```

**How to verify**:
1. Deploy to Vercel
2. Check Vercel logs on turn 10 (LLM turn)
3. Look for lines: `[LLM Planner] 💰 Cost: $X.XXXXXX (Input: X tokens, Output: X tokens)`
4. Verify cost is ~$0.0003 per country (down from $0.0008)

---

### 2. Verify Logging Reduction (Expected: 90% reduction)

**Before optimization**:
- Turn 10 logs: ~1000-1500 lines
- Includes: Full strategic analyses, neighbor relations, action lists, filtering details

**After optimization**:
- Turn 10 logs (production): ~10-20 lines
- Turn 10 logs (debug mode): ~200-300 lines (when `LLM_PLAN_DEBUG=1`)

**How to verify**:
1. Deploy to Vercel
2. Advance to turn 10 (LLM turn)
3. Count lines in Vercel logs
4. Expected output (production mode):
```
[Turn API] T10: LLM analysis (5 countries)
[Turn API] Analysis complete: 2500ms, 5/5 succeeded
[LLM Planner] ⚠️ Country1: 7/8 steps (BELOW MIN)  // Only if issues
[AI Controller] Country2 generated 2 action(s)
```

---

### 3. Verify Target Validation Fix (Expected: No spam errors)

**Before optimization**:
```
[MilitaryAI] LLM-specified target a388f255... not found or not attackable, falling back to rule-based
[MilitaryAI] LLM-specified target a388f255... not found or not attackable, falling back to rule-based
[MilitaryAI] LLM-specified target a388f255... not found or not attackable, falling back to rule-based
... (repeated 20+ times per turn)
```

**After optimization**:
```
// Silent fallback (no logs in production)
// Only shows in debug mode:
[MilitaryAI] LLM target X no longer attackable, selecting alternative
```

**How to verify**:
1. Let game run to turn 10-20 (when countries get eliminated)
2. Check Vercel logs
3. Should NOT see repeated "target not found" messages
4. AI should still attack successfully (using fallback logic)

---

### 4. Verify Turn Speed (Expected: 15-20% faster)

**Before optimization**:
- Turn 10 processing: ~6-8 seconds
- Turn 11+ processing: ~4-5 seconds

**After optimization**:
- Turn 10 processing: ~5-6 seconds (15% faster)
- Turn 11+ processing: ~3-4 seconds (20% faster)

**How to verify**:
1. Check Vercel logs for timing lines:
```
[Turn API] Analysis complete: Xms, 5/5 succeeded
```
2. Compare with previous turn times
3. Should see ~500-1000ms improvement

---

### 5. Test Debug Mode (Optional)

**Enable full diagnostics**:
```bash
# Set environment variable in Vercel:
LLM_PLAN_DEBUG=1
```

**Expected output** (turn 10):
```
[Strategic Planner] Country: Using cached plan from T10 (1t ago)
[LLM Plan Debug] CountryID T11 planTurn=10 validUntil=19 steps=8 executable=8 executed=2
[LLM Plan Debug] Economic coverage: {total: 8, executed: 2, ...}
[LLM Plan Debug] Selected economic step: tech_l6 (priority: none, instruction: "...")
[Military AI] ⚠️ Filtered 4 steps with wrong actionType (expected military): ...
```

---

## Integration Tests

### Test 1: Normal Turn Flow
```bash
# Start game, advance to turn 2 (first LLM turn)
curl -X POST http://localhost:3000/api/turn -H "Content-Type: application/json" -d '{"gameId":"..."}'

# Expected: 
# - LLM analysis runs successfully
# - Plans generated for all AI countries
# - Actions executed
# - Minimal logging (production mode)
```

### Test 2: Cached Plan Usage
```bash
# Advance to turn 3-9 (using cached plans from turn 2)
curl -X POST http://localhost:3000/api/turn -H "Content-Type: application/json" -d '{"gameId":"..."}'

# Expected:
# - No LLM calls (using cached plans)
# - Actions still generated correctly
# - Very minimal logging
```

### Test 3: Invalid Target Recovery
```bash
# Conquer a country, then advance turn
# AI with plan targeting conquered country should:
# - Detect target is invalid
# - Silently fall back to rule-based targeting
# - Attack a valid alternative target
# - No error spam in logs
```

---

## Rollback Plan

If issues occur:

1. **Revert token optimization** (if costs increase):
   ```bash
   git revert [commit-hash-of-prompt-optimization]
   ```

2. **Revert logging reduction** (if diagnostics needed):
   ```bash
   # Remove LLM_PLAN_DEBUG checks
   # Or set LLM_PLAN_DEBUG=1 in production temporarily
   ```

3. **Revert target validation** (if attacks break):
   ```bash
   git revert [commit-hash-of-target-validation-fix]
   ```

---

## Success Criteria

- ✅ Token cost per country: ~$0.0003 (down from $0.0008)
- ✅ Vercel logs per turn: ~10-20 lines (down from 1000+)
- ✅ No repeated "target not found" errors
- ✅ Turn speed: 15-20% faster
- ✅ AI behavior: No regressions (still plays effectively)
- ✅ No linter errors
- ✅ No breaking changes

---

## Monitoring Dashboard (First 48 Hours)

### Metrics to Watch:
1. **Groq API costs** (should decrease by ~60%)
2. **Turn processing time** (should decrease by ~15-20%)
3. **Vercel log size** (should decrease by ~90%)
4. **AI attack success rate** (should remain stable)
5. **Error frequency** (should decrease)

### Red Flags:
- ❌ Token costs increase
- ❌ Turn processing time increases
- ❌ AI stops attacking
- ❌ More errors than before
- ❌ Game becomes unplayable

If any red flags occur, **rollback immediately** and investigate.

---

## Contact

If issues occur, check:
1. Vercel logs
2. Groq API dashboard
3. This testing guide
4. OPTIMIZATION_SUMMARY.md
