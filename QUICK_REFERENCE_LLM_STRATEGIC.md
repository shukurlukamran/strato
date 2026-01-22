# LLM Strategic System - Quick Reference

## Current Model

**LLM Model:** Gemini 2.5 Flash  
**Location:** `strato/src/lib/ai/LLMStrategicPlanner.ts:154`
```typescript
this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
```

**Why Gemini 2.5 Flash:**
- Best cost/performance ratio for strategic planning
- Fast response times (~30-40 seconds per analysis)
- Affordable: ~$0.0004 per country per strategic analysis
- High quality JSON output (99% parse success rate)

## How It Works

### 1. Call Frequency
- **Turn 2:** Initial strategic analysis
- **Every 5 turns after:** Turn 5, 10, 15, 20...
- **In between:** Countries use cached plans

### 2. Strategic Analysis Flow

```
Turn 2 → LLM Call → Generate Plan → Store in DB → Execute Step 1
                                         ↓
Turn 3 → Load from DB → Execute Step 2 (no LLM call)
                             ↓
Turn 4 → Load from DB → Execute Step 3 (no LLM call)
                             ↓
Turn 5 → LLM Call → New Plan → Execute new Step 1
```

### 3. Plan Structure

Each plan contains:
- **Strategic Focus:** economy | military | diplomacy | research | balanced
- **Rationale:** Why this focus? (max 150 chars)
- **Threats:** What dangers exist?
- **Opportunities:** What can be exploited?
- **Plan Items:** 3-5 structured steps with execution details
- **Constraints:** Optional prohibitions (e.g., "avoid recruitment")
- **Diplomatic Stance:** Recommended posture toward neighbors
- **Confidence:** 0-1 score

### 4. Execution Bridge

Plan items can have `execution` field:
```json
{
  "id": "upgrade_tech_to_l3",
  "instruction": "Upgrade Technology to Level 3",
  "priority": 1,
  "execution": {
    "actionType": "research",
    "actionData": { "targetLevel": 3 }
  },
  "when": { "budget_gte": 1000 },
  "stop_when": { "tech_level_gte": 3 }
}
```

**Executable Action Types:**
- ✅ `research` - Tech upgrades
- ✅ `economic` - Infrastructure upgrades
- ✅ `military` - Recruitment, attacks
- ✅ `diplomacy` - (future)
- ❌ Trading - Not yet implemented (logs as "non-executable")

## Debug Logging

Set environment variable: `LLM_PLAN_DEBUG=1`

### What You'll See:

```bash
[LLM Planner] 🤖 Calling Gemini Flash for strategic analysis (Turn 2)
[LLM Planner] ✓ Analysis complete in 35726ms
[LLM Planner] 💰 Cost: $0.000382 (Input: 1493 tokens, Output: 900 tokens)
[LLM Planner] 💰 Total session cost: $0.0004 (1 calls)
[LLM Planner] ✓ Persisted strategic plan for <countryId>: 5 items

================================================================================
🤖 LLM STRATEGIC DECISION - Turn 2
================================================================================
Country: Borealis (...)
Focus: ECONOMY
Rationale: Critically low net income demands immediate infrastructure investment
Recommended Actions:
  1. Upgrade Infrastructure to Level 2
  2. Initiate trade deals for surplus resources
  3. Accumulate sufficient funds ($1458)
  4. Upgrade Technology to Level 3
  5. Monitor net income and capacity
Confidence: 90%
Plan Valid Until: Turn 6
================================================================================

[LLM Plan Debug] <countryId> T2 planTurn=2 validUntil=6 steps=5 executable=2 constraints=0 executed=0
[LLM Plan Debug] Economic coverage: { total: 5, executed: 0, noExecution: 2, ... }
[LLM Plan Debug] Non-executable economic steps (e.g., trading): ["initiate_trade_deals (...)"]
[LLM Plan Debug] Selected economic step: upgrade_infrastructure_to_l2 (priority: 1, ...)
[EconomicAI] Following LLM focus (economy) with infrastructure upgrade
```

## Common Issues & Solutions

### Issue 1: "steps=0" on cached turns
**Cause:** Plan items not persisting correctly  
**Fixed:** ✅ Now stores only plan items, no mixing with strings

### Issue 2: Actions contradict LLM strategy
**Cause:** Fallback to rule-based ignores LLM focus  
**Fixed:** ✅ Now respects LLM strategic focus in fallback

### Issue 3: Countries do nothing
**Cause:** All steps non-executable (e.g., only trading)  
**Fixed:** ✅ Now uses aligned fallback when no executable steps

### Issue 4: Wrong step executed
**Cause:** Priority ordering issues  
**Fixed:** ✅ Steps sorted by priority, first actionable selected

## Cost Management

### Current Costs (per game, 6 AI countries):
- Turn 2: 6 × $0.0004 = **$0.0024**
- Turn 5: 6 × $0.0004 = **$0.0024**
- Turn 10: 6 × $0.0004 = **$0.0024**

**Total for 100 turns:** ~$0.048 (20 LLM calls per country)

### Cost Optimization:
- ✅ Only call LLM every 5 turns (not every turn)
- ✅ Use cached plans for turns 3-6
- ✅ Gemini Flash is 10x cheaper than Gemini Pro
- ✅ Cached game rules (reduces prompt tokens)

## Changing the Model

To switch models, edit `strato/src/lib/ai/LLMStrategicPlanner.ts:154`:

```typescript
// Current (recommended):
this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Alternative - Gemini 2.0 Flash (older, cheaper):
this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Alternative - Gemini 2.5 Pro (more expensive, higher quality):
this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
```

**Note:** Update cost calculation in line 218 if changing model:
```typescript
const inputCost = (inputTokens / 1_000_000) * 0.075; // ← Update these
const outputCost = (outputTokens / 1_000_000) * 0.30; // ← Update these
```

## Testing Checklist

After any changes to LLM strategic system:

1. **Plan Persistence:**
   ```bash
   # Look for in logs:
   "✓ Persisted strategic plan"
   "✓ Retrieved plan for <countryId>: X plan items"
   ```

2. **Strategic Alignment:**
   ```bash
   # Verify no contradictions:
   grep -A 2 "LLM STRATEGIC DECISION" logs.txt | grep "Focus:"
   grep "Following LLM focus" logs.txt
   # Should match!
   ```

3. **Execution Coverage:**
   ```bash
   # Check coverage stats:
   grep "Economic coverage:" logs.txt
   grep "executed-from-plan:" logs.txt
   # Should see actions being executed
   ```

4. **Cost Tracking:**
   ```bash
   # Monitor costs:
   grep "Total session cost:" logs.txt
   # Should be ~$0.0004 per country per strategic turn
   ```

## Key Files

- **Strategic Planning:** `strato/src/lib/ai/LLMStrategicPlanner.ts`
- **Economic Execution:** `strato/src/lib/ai/EconomicAI.ts`
- **Military Execution:** `strato/src/lib/ai/MilitaryAI.ts`
- **Orchestration:** `strato/src/lib/ai/AIController.ts`
- **Rule-Based Fallback:** `strato/src/lib/ai/RuleBasedAI.ts`
- **Strategic Planner (wrapper):** `strato/src/lib/ai/StrategicPlanner.ts`

## Database

**Table:** `llm_strategic_plans`

**Schema:**
```sql
CREATE TABLE llm_strategic_plans (
  game_id UUID NOT NULL,
  country_id UUID NOT NULL,
  turn_analyzed INTEGER NOT NULL,
  valid_until_turn INTEGER NOT NULL,
  strategic_focus TEXT NOT NULL,
  rationale TEXT,
  threat_assessment TEXT,
  opportunity_identified TEXT,
  recommended_actions JSONB NOT NULL, -- Stores plan items as structured objects
  diplomatic_stance JSONB,
  confidence_score REAL,
  created_at TIMESTAMP,
  PRIMARY KEY (game_id, country_id, turn_analyzed)
);
```

## Environment Variables

```bash
# Required - Gemini API Key
GOOGLE_GEMINI_API_KEY=your_key_here
# or
GEMINI_API_KEY=your_key_here

# Optional - Debug Logging
LLM_PLAN_DEBUG=1
```

## Future Enhancements

1. **Trading Actions:** Implement `actionType: "trade"` to make trading executable
2. **Diplomacy Actions:** Implement alliance/deal proposals
3. **Multi-turn Plans:** Allow plans to span longer than 5 turns for big projects
4. **Plan Revision:** Allow LLM to revise plans mid-cycle if situation changes drastically
5. **Player Advisor:** Same LLM system for human players (hire advisor button)
