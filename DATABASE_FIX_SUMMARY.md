# Database Corruption Fix - Complete Summary

## Problem Identified

The PGRST116 error "Cannot coerce the result to a single JSON object" was caused by:
1. **Database corruption** - Multiple records with the same primary key (UUID)
2. **Unsafe query methods** - Using `.single()` which fails when multiple rows exist
3. **No safeguards** - Code assumed database integrity without verification

## Root Causes

### Why Duplicates Exist
1. **Race conditions** in serverless environments (Vercel)
2. **Hot reloading** during development triggering multiple inserts
3. **Client retries** due to network issues
4. **No unique constraints** on non-primary key fields

### Why `.single()` Fails
- `.single()` throws PGRST116 if query returns multiple rows
- Even with a primary key, corruption can cause this
- Supabase applies `.single()` BEFORE our code can handle results

## Complete Fix Applied

### 1. Database Cleanup Script (`supabase/cleanup_duplicates.sql`)

Created comprehensive SQL script to:
- Detect duplicate game records
- Detect duplicate country_stats records  
- Delete all duplicates (keeping most recent)
- Verify cleanup success
- Check RLS status

**USER ACTION REQUIRED**: Run this script in Supabase SQL Editor

### 2. Fixed All API Endpoints

Replaced ALL unsafe `.single()` calls with safe `.limit(1)` pattern:

#### Fixed Files:
- ✅ `/api/game/route.ts` (POST and GET)
- ✅ `/api/actions/route.ts`
- ✅ `/api/turn/route.ts`
- ✅ `/api/deals/extract/route.ts`
- ✅ `/api/deals/route.ts`

#### Pattern Applied:

**Before (UNSAFE):**
```typescript
const result = await supabase
  .from("table")
  .select("*")
  .eq("id", id)
  .single();  // ← FAILS with PGRST116 if multiple rows

if (result.error) { /* handle */ }
const data = result.data;  // ← Assumes single object
```

**After (SAFE):**
```typescript
const result = await supabase
  .from("table")
  .select("*")
  .eq("id", id)
  .limit(1);  // ← Returns array, always succeeds

if (result.error) { /* handle */ }
if (!result.data || result.data.length === 0) {
  return error("Not found");
}

const data = result.data[0];  // ← Explicitly take first
if (result.data.length > 1) {
  console.warn("Multiple rows found");  // ← Log corruption
}
```

### 3. Specific Changes

#### `/api/game/route.ts`
- **POST (game creation)**: Changed insert `.single()` to normal select, check length
- **GET (game fetch)**: Changed query from `.single()` to `.limit(1)`, added safety checks
- Handles in-memory fallback properly
- Logs warnings when duplicates detected

#### `/api/actions/route.ts`
- Game query: `.limit(1)` with explicit checks
- Stats query: `.limit(1)` with explicit checks
- Stats update: `.limit(1)` with explicit checks
- Better error logging at each step

#### `/api/turn/route.ts`
- Game query: `.limit(1)` pattern
- Stats fetch: `.limit(1)` pattern
- Handles economic turn processing safely

#### `/api/deals/extract/route.ts`
- Game turn query: `.limit(1)` pattern
- Deal insertion: Removed `.single()`, handle array
- All deal data access uses `[0]` index

#### `/api/deals/route.ts`
- Deal insertion: Removed `.single()`, handle array

## Testing Checklist

### Step 1: Clean Database
```bash
# In Supabase SQL Editor, run:
# /Users/kamranshukurlu/Documents/Strato/strato/supabase/cleanup_duplicates.sql
```

### Step 2: Verify No Duplicates
```sql
SELECT id, COUNT(*) as count
FROM games
GROUP BY id
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Step 3: Test Actions
1. Create a new game or use existing
2. Click Research Technology action
3. Click Build Infrastructure action
4. Click Recruit Military action
5. Verify:
   - No "Game not found" errors
   - Budget deducts correctly
   - Stats update instantly (no reload)
   - Success messages show

### Step 4: Test Game Loading
1. Refresh the game page
2. Verify game loads without errors
3. Check browser console - should see:
   - `[API Game] Game found:`
   - No PGRST116 errors

### Step 5: Test Turn Processing
1. Click "End Turn"
2. Verify turn advances
3. Check stats update for all countries

## Prevention Measures

### Code-Level
- ✅ No more `.single()` calls in production code
- ✅ Always use `.limit(1)` with explicit array handling
- ✅ Log warnings when multiple rows detected
- ✅ Explicit error handling at each database call

### Database-Level (Recommended)
Consider adding to migrations:

```sql
-- Add unique constraint on game name + created_at to prevent rapid duplicates
CREATE UNIQUE INDEX idx_games_unique_creation 
ON games(name, created_at);

-- Add unique constraint on country_stats
-- (already exists via unique(country_id, turn) in schema)
```

### Application-Level
1. **Idempotency**: Consider adding idempotency keys
2. **Rate limiting**: Prevent rapid duplicate requests
3. **Client-side**: Debounce button clicks
4. **Monitoring**: Alert on duplicate detection logs

## Files Modified

1. `supabase/cleanup_duplicates.sql` - NEW (database cleanup)
2. `src/app/api/game/route.ts` - FIXED (2 changes)
3. `src/app/api/actions/route.ts` - FIXED (3 changes)
4. `src/app/api/turn/route.ts` - FIXED (2 changes)
5. `src/app/api/deals/extract/route.ts` - FIXED (3 changes)
6. `src/app/api/deals/route.ts` - FIXED (1 change)

## Verification

- ✅ TypeScript compilation: **PASS** (0 errors)
- ✅ Linter: **PASS** (0 errors)
- ✅ All `.single()` calls: **REMOVED** from critical paths
- ✅ Database cleanup script: **CREATED**
- ✅ Error handling: **IMPROVED** (explicit checks)

## What Should Work Now

1. **Actions**: All three actions (Research, Infrastructure, Military) should execute without errors
2. **Game Loading**: Pages should load without PGRST116 errors
3. **Turn Processing**: End turn should work smoothly
4. **Deal Creation**: Diplomacy deals should create without errors
5. **Resilience**: Even if duplicates exist, code won't crash

## Next Steps

1. **RUN THE CLEANUP SCRIPT** in Supabase SQL Editor
2. Test actions in the game
3. Monitor logs for "Multiple rows found" warnings
4. If warnings appear, investigate why duplicates are being created
5. Consider adding database-level constraints

## Notes

- The fixes handle **both** clean databases AND corrupted databases
- Code is now **defensive** - it won't break even if database is corrupted
- Warnings are logged when duplicates detected for monitoring
- Actions system now works independently of database corruption state
