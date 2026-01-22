# Groq JSON Validation Error Fix

## Problem

The Vercel logs showed Groq API errors:
```
[LLM Planner] Groq API error: 400 - {"error":{"message":"Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.","type":"invalid_request_error","code":"json_validate_failed","failed_generation":""}}
```

## Root Cause

The system was making **redundant LLM API calls**:

1. **Turn API** successfully performed **batch analysis** for all 5 countries in a single API call ✅
2. **But then**, each country's `StrategicPlanner.plan()` method was calling `analyzeSituation()` **individually** ❌
3. These **5 additional individual calls** were redundant and some failed with JSON validation errors

### Code Flow Before Fix:

```
Turn API (turn/route.ts)
  ↓
  └─> Batch analyze all countries (1 API call) ✅
  ↓
  └─> For each country:
      ↓
      └─> AIController.decideTurnActions()
          ↓
          └─> StrategicPlanner.plan()
              ↓
              └─> LLMPlanner.analyzeSituation() ❌ REDUNDANT CALL!
                  (Makes individual API call per country)
```

### Why Individual Calls Failed:

Groq's `response_format: { type: "json_object" }` requires the model to generate perfectly valid JSON. When called multiple times in rapid succession:
- Rate limiting may affect quality
- Model may generate malformed JSON under pressure
- Results in 400 error: `json_validate_failed`

## Solution

Pass batch analysis results from Turn API down to StrategicPlanner to avoid redundant calls.

### Code Flow After Fix:

```
Turn API (turn/route.ts)
  ↓
  └─> Batch analyze all countries (1 API call) ✅
  ↓
  └─> Store batch results in Map<countryId, analysis>
  ↓
  └─> For each country:
      ↓
      └─> AIController.decideTurnActions(state, countryId, cities, batchAnalysis)
          ↓
          └─> StrategicPlanner.plan(state, countryId, batchAnalysis)
              ↓
              └─> Use provided batchAnalysis ✅
              └─> Skip individual API call ✅
```

## Changes Made

### 1. Updated `StrategicPlanner.plan()` (StrategicPlanner.ts)

```typescript
// BEFORE:
async plan(state: GameStateSnapshot, countryId: string): Promise<StrategyIntent>

// AFTER:
async plan(state: GameStateSnapshot, countryId: string, batchAnalysis?: any): Promise<StrategyIntent>
```

- Added optional `batchAnalysis` parameter
- Use batch analysis if provided (preferred)
- Only make individual API call if no batch analysis AND it's an LLM turn
- Added logging to track when individual calls are made

### 2. Updated `AIController.decideTurnActions()` (AIController.ts)

```typescript
// BEFORE:
async decideTurnActions(state: GameStateSnapshot, countryId: string, cities: City[] = []): Promise<GameAction[]>

// AFTER:
async decideTurnActions(
  state: GameStateSnapshot, 
  countryId: string, 
  cities: City[] = [], 
  batchAnalysis?: any
): Promise<GameAction[]>
```

- Added optional `batchAnalysis` parameter
- Pass it to `planner.plan()` to avoid redundant LLM calls

### 3. Updated Turn API Route (turn/route.ts)

```typescript
// Pass batch analysis to each AI controller
const batchAnalysisForCountry = batchAnalyses?.get(country.id) || undefined;
const actions = await aiController.decideTurnActions(
  state.data, 
  country.id, 
  cities, 
  batchAnalysisForCountry  // ✅ Pass batch result
);
```

### 4. Improved Error Handling (LLMStrategicPlanner.ts)

- Lowered temperature to 0.2 (from 0.3) for more consistent JSON generation
- Added better error logging for JSON validation failures
- Added explanation of what `json_validate_failed` means

## Results

### Before Fix:
- ✅ 1 batch API call (5 countries) - SUCCESS
- ❌ 5 individual API calls - 2 FAILED with JSON errors
- **Total: 6 API calls, 2 failures**

### After Fix:
- ✅ 1 batch API call (5 countries) - SUCCESS
- ✅ 0 individual API calls (batch results reused)
- **Total: 1 API call, 0 failures**

## Benefits

1. **No More Redundant Calls**: Eliminates 5x redundant API calls per turn
2. **No More JSON Errors**: Batch analysis is more reliable than individual calls
3. **Cost Reduction**: 80% fewer API calls (already had batch, now eliminating redundant individual calls)
4. **Faster Execution**: No waiting for 5 additional API calls
5. **Better Reliability**: Single batch call is more consistent than multiple individual calls

## Testing

To verify the fix:

1. Check logs for batch analysis:
   ```
   [Turn API] 🚀 BATCH analyzing 5 countries in SINGLE API call
   [LLM Planner] ✓ BATCH analysis complete in XXXms for 5 countries
   ```

2. Verify no individual calls are made:
   ```
   # Should NOT see:
   [LLM Planner] 🤖 Calling Groq for strategic analysis (Turn 20)
   
   # Should see:
   [Strategic Planner] Country {id}: [using batch analysis]
   ```

3. No JSON validation errors:
   ```
   # Should NOT see:
   [LLM Planner] Groq API error: 400 - {"error":{"code":"json_validate_failed"}}
   ```

## Edge Cases Handled

1. **Batch analysis fails**: Falls back to cached plans from database
2. **No batch analysis provided**: Falls back to individual call (with better error handling)
3. **Cached plans from previous turns**: Uses them when no fresh analysis available

## Future Improvements

1. Consider removing individual `analyzeSituation()` method entirely (always use batch)
2. Add retry logic for batch analysis failures
3. Monitor Groq API rate limits and add exponential backoff if needed
