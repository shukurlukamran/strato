# 🔍 Development Logging Guide

## Where to Look for Logs

### Server Console (Terminal)
**This is where you want to look!** All AI decisions, LLM analysis, and turn processing logs appear here.

```bash
# Start dev server
npm run dev

# Server logs will appear in this terminal
# Keep it visible while testing!
```

### Browser Console
Only shows client-side errors and warnings. **AI decisions are NOT here.**

---

## LLM Decision Logs

### When LLM is Called (Turn 1, 5, 10, 15...)

You'll see a big formatted box in your **server console**:

```
================================================================================
🤖 LLM STRATEGIC DECISION - Turn 5
================================================================================
Country: Mining Empire (abc-123-def-456)
Focus: MILITARY
Rationale: Technology level 3 achieved, now critically under-defended
Threats: Neighbor military 65 vs our 42 (deficit: 23)
Opportunities: Strong economy with 2.2x tech multiplier
Recommended Actions:
  1. Recruit military immediately (20+ units)
  2. Build infrastructure to support military
  3. Maintain tech advantage
  4. Consider defensive alliances
Diplomatic Stance: { "neighbor-abc": "neutral", "neighbor-xyz": "friendly" }
Confidence: 85%
Plan Valid Until: Turn 9
================================================================================
```

### What Each Field Means

| Field | Description | Example |
|-------|-------------|---------|
| **Country** | Which AI country this is for | "Mining Empire (abc-123)" |
| **Focus** | Strategic priority for next 5 turns | "MILITARY", "ECONOMY", "RESEARCH" |
| **Rationale** | Why this strategy was chosen | "Tech achieved, now under-defended" |
| **Threats** | What dangers the LLM identified | "Neighbor military 65 vs our 42" |
| **Opportunities** | What advantages to leverage | "Strong economy with 2.2x multiplier" |
| **Recommended Actions** | Specific actions to take | "Recruit 20+ units", "Build infra" |
| **Diplomatic Stance** | How to treat each neighbor | "friendly", "neutral", "hostile" |
| **Confidence** | How confident the LLM is (0-100%) | "85%" |
| **Plan Valid Until** | When LLM will re-evaluate | "Turn 9" (current + 5) |

---

## Cached Plan Logs

### When Using Cached Plan (Turn 2, 3, 4, 6, 7, 8...)

You'll see a simpler log in your **server console**:

```
[Strategic Planner] Country abc-123: Using cached LLM plan from turn 5 (2 turns ago)
  Cached plan: military - Technology level 3 achieved, now critically under-defended
[AI Controller] Country abc-123 strategic focus: military - [LLM (T5, 2t ago)] Technology level 3 achieved
```

This means:
- ✅ AI is following the LLM plan from Turn 5
- ✅ No new LLM call (saving money!)
- ✅ Strategic consistency maintained

---

## Turn Processing Logs

### AI Action Generation
```
[Turn API] Generating AI actions for turn 5...
[AI] Mining Empire: Generated 2 actions
[AI] Mining Empire actions: [ { type: 'military', data: { subType: 'recruit', amount: 20 } }, ... ]
[AI] Tech Hub: Generated 1 actions
[AI] Tech Hub actions: [ { type: 'research', data: {} } ]
[AI] ✓ Saved 3 AI actions to database
```

### Economic Processing
```
[Turn API] Processing economics for 3 countries...
[Economic Engine] Mining Empire: Budget +$1,234, Population +1,890
[Economic Engine] Tech Hub: Budget +$987, Population +1,456
⚡ All economic processing completed in 0.8s (parallel)
```

### Performance Timing
```
[Turn API] Turn 5 processing started...
⚡ AI decisions completed in 1.2s (parallel)
⚡ Economic processing completed in 0.8s (parallel)
⚡ Database updates completed in 0.4s (batched)
✓ Turn 5 → 6 completed in 3.2s
```

---

## LLM Cost Tracking

Every LLM call logs its cost:

```
[LLM Planner] 🤖 Calling Gemini Flash for strategic analysis (Turn 5)
[LLM Planner] ✓ Analysis complete in 1,247ms
[LLM Planner] 💰 Cost: $0.000234 (Input: 1,245 tokens, Output: 187 tokens)
[LLM Planner] 💰 Total session cost: $0.0012 (5 calls)
```

### Cost Breakdown
- **Input tokens**: Prompt sent to LLM (~1,200 tokens)
- **Output tokens**: LLM response (~150-200 tokens)
- **Cost per call**: ~$0.0002 (very cheap!)
- **Total session cost**: Cumulative cost since server started

---

## How to Test LLM Decisions

### Step-by-Step

1. **Start dev server**
   ```bash
   cd /Users/kamranshukurlu/Documents/Strato/strato
   npm run dev
   ```

2. **Keep terminal visible**
   - Don't minimize it!
   - This is where logs appear

3. **Open browser**
   ```
   http://localhost:3000
   ```

4. **Create a new game**
   - Click "New Game"
   - Select a country
   - Start game

5. **End turns and watch logs**
   - Click "End Turn"
   - **Look at terminal** (not browser!)
   - Turn 1: Should see LLM decision box
   - Turn 2-4: Should see "Using cached plan"
   - Turn 5: Should see new LLM decision box
   - Turn 6-9: Should see "Using cached plan"

### What to Look For

✅ **Turn 1**: Big LLM decision box appears  
✅ **Turn 2-4**: "Using cached LLM plan from turn 1"  
✅ **Turn 5**: New LLM decision box appears  
✅ **Turn 6-9**: "Using cached LLM plan from turn 5"  
✅ **Cost tracking**: Total cost increases only on turns 1, 5, 10...  

---

## Troubleshooting

### "No LLM logs appearing"

**Check 1**: Is API key set?
```bash
# Check if environment variable exists
echo $GOOGLE_GEMINI_API_KEY
# or
echo $GEMINI_API_KEY

# If empty, set it:
export GOOGLE_GEMINI_API_KEY="your-key-here"
# Then restart server
```

**Check 2**: Are you looking at the right place?
- ❌ Browser console (wrong!)
- ✅ Terminal where `npm run dev` is running (correct!)

**Check 3**: Are there AI countries?
- Game needs at least 1 AI-controlled country
- Player-only games won't trigger AI decisions

### "LLM call failed"

You'll see:
```
[LLM Planner] Error calling Gemini: [error details]
[Strategic Planner] LLM analysis failed, falling back to rule-based
```

**Common causes**:
1. Invalid API key
2. API rate limit exceeded
3. Network issue
4. Gemini API down

**Solution**: Game still works! It falls back to rule-based AI.

### "Turn taking too long"

**Expected times**:
- Regular turn (no LLM): 2-4 seconds
- LLM turn (every 5 turns): 3-5 seconds

**If slower**:
1. Check database connection
2. Check network speed
3. Check number of AI countries (more = slower)

---

## Log Filtering Tips

### Only Show LLM Decisions
```bash
npm run dev 2>&1 | grep "LLM STRATEGIC DECISION" -A 15
```

### Only Show Performance Metrics
```bash
npm run dev 2>&1 | grep "⚡"
```

### Only Show Costs
```bash
npm run dev 2>&1 | grep "💰"
```

### Save Logs to File
```bash
npm run dev 2>&1 | tee game-logs.txt
# Now logs appear in terminal AND saved to file
```

---

## Example Full Turn Log

Here's what a complete turn looks like in your terminal:

```
[Turn API] Processing turn 5 → 6...

[Turn API] Generating AI actions for turn 5...

================================================================================
🤖 LLM STRATEGIC DECISION - Turn 5
================================================================================
Country: Mining Empire (abc-123)
Focus: MILITARY
Rationale: Technology level 3 achieved, now critically under-defended
Threats: Neighbor military 65 vs our 42 (deficit: 23)
Opportunities: Strong economy with 2.2x tech multiplier
Recommended Actions:
  1. Recruit military immediately (20+ units)
  2. Build infrastructure to support military
  3. Maintain tech advantage
Diplomatic Stance: { "neighbor-1": "neutral" }
Confidence: 85%
Plan Valid Until: Turn 9
================================================================================

[LLM Planner] 💰 Cost: $0.000234 (Input: 1,245 tokens, Output: 187 tokens)
[LLM Planner] 💰 Total session cost: $0.0012 (5 calls)

[AI] Mining Empire: Generated 2 actions
[AI] Mining Empire actions: [
  { type: 'military', data: { subType: 'recruit', amount: 20 } },
  { type: 'economic', data: { subType: 'infrastructure' } }
]

[Strategic Planner] Country xyz-789: Using cached LLM plan from turn 1 (4 turns ago)
  Cached plan: research - Early tech investment compounds over time

[AI] Tech Hub: Generated 1 actions
[AI] Tech Hub actions: [
  { type: 'research', data: {} }
]

[AI] ✓ Saved 3 AI actions to database

[Turn API] Processing economics for 3 countries...
[Economic Engine] Mining Empire: Budget +$1,234, Population +1,890
[Economic Engine] Tech Hub: Budget +$987, Population +1,456
[Economic Engine] Agriculture Nation: Budget +$1,100, Population +2,000
⚡ All economic processing completed in 0.8s (parallel)

[Turn Processor] Resolving 3 actions...
[Action Resolver] Mining Empire: Recruited 20 military (42 → 62)
[Action Resolver] Mining Empire: Built infrastructure (Level 2 → 3)
[Action Resolver] Tech Hub: Researched technology (Level 1 → 2)

⚡ Database updates completed in 0.4s (batched)

✓ Turn 5 → 6 completed in 3.2s
```

---

## Summary

**Where to look**: Terminal running `npm run dev` (not browser!)  
**When LLM is called**: Turn 1, 5, 10, 15, 20...  
**What you'll see**: Big formatted box with strategic analysis  
**Cost per call**: ~$0.0002 (very cheap!)  
**Turn speed**: 3-5 seconds (55% faster than before!)  

**Keep your terminal visible while testing to see all the AI magic!** 🎯
