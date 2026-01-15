# Deal System Implementation Plan

## Overview

This plan outlines the implementation of the deal system that bridges chat-based diplomacy with structured deal execution. The system will extract deals from natural language conversations, summarize them, allow both parties to confirm, and execute them in the game engine.

## Current State

### What Exists
- ✅ Chat system with AI responses (ChatHandler using Gemini)
- ✅ Database schema for deals and deal_confirmations
- ✅ Basic DealProposal component (manual JSON input)
- ✅ Deal API endpoint for creating deals
- ✅ DealExecutor class (placeholder implementation)
- ✅ Deal types and structures defined

### What's Missing
- ❌ Automatic deal extraction from chat conversations
- ❌ Deal summarization and human-readable display
- ❌ Deal confirmation workflow (both parties)
- ❌ AI deal evaluation and auto-confirmation logic
- ❌ Deal execution in game engine (resource transfers, effects)
- ❌ Deal status tracking and expiration handling
- ❌ UI for viewing and confirming deals

## Architecture Flow

```
Chat Conversation
    ↓
[Deal Detection] → Extract deal terms using LLM
    ↓
[Deal Summarization] → Create human-readable summary
    ↓
[Deal Proposal] → Save as 'proposed' status
    ↓
[Player Confirmation] → Player reviews and confirms
    ↓
[AI Confirmation] → AI evaluates and confirms/rejects
    ↓
[Deal Activation] → Status changes to 'active'
    ↓
[Deal Execution] → Game engine applies effects each turn
    ↓
[Deal Completion] → Status changes to 'completed' or 'violated'
```

## Implementation Components

### 1. Deal Extraction Service (`lib/deals/DealExtractor.ts`)

**Purpose**: Extract structured deal terms from chat conversation context using LLM.

**Responsibilities**:
- Analyze recent chat messages for deal proposals
- Use LLM to extract structured deal terms
- Validate extracted terms against game rules
- Return structured DealTerms object or null if no deal detected

**Input**:
- Chat messages (last N messages)
- Game context (country stats, resources)
- Current turn

**Output**:
- `DealExtractionResult | null`
  - `dealType: DealType`
  - `dealTerms: DealTerms`
  - `confidence: number` (0-1)
  - `extractedFromMessages: string[]` (message IDs)

**Implementation Approach**:
- Use Gemini API with structured output (JSON schema)
- Prompt includes:
  - Recent chat history
  - Available resources/types
  - Deal type definitions
  - Examples of valid deal structures
- Fallback to rule-based extraction if LLM fails

**Key Methods**:
```typescript
async extractDealFromChat(
  chatId: string,
  gameId: string,
  recentMessages: ChatMessage[]
): Promise<DealExtractionResult | null>
```

### 2. Deal Summarizer (`lib/deals/DealSummarizer.ts`)

**Purpose**: Convert structured deal terms into human-readable summaries.

**Responsibilities**:
- Generate natural language summary of deal terms
- Format commitments clearly (what each party gives/receives)
- Highlight conditions and duration
- Create both short (notification) and long (detail view) summaries

**Output**:
- `DealSummary`
  - `shortSummary: string` (1-2 sentences)
  - `detailedSummary: string` (full breakdown)
  - `proposerGives: string[]`
  - `receiverGives: string[]`
  - `conditions: string[]`
  - `duration: string`

**Key Methods**:
```typescript
summarizeDeal(deal: Deal): DealSummary
formatCommitment(commitment: DealCommitment): string
```

### 3. Deal Confirmation Service (`lib/deals/DealConfirmationService.ts`)

**Purpose**: Handle deal confirmation workflow for both player and AI.

**Responsibilities**:
- Create deal confirmations in database
- Check if both parties have confirmed
- Update deal status when both confirm
- Handle rejections and modifications
- Notify parties of confirmation status

**Key Methods**:
```typescript
async confirmDeal(
  dealId: string,
  countryId: string,
  action: 'accept' | 'reject' | 'modify',
  message?: string
): Promise<DealConfirmation>

async checkAndActivateDeal(dealId: string): Promise<Deal | null>
```

**Workflow**:
1. Player or AI confirms deal → create DealConfirmation record
2. Check if both parties confirmed
3. If both confirmed → update deal status to 'accepted'
4. On next turn → deal status changes to 'active' and execution begins

### 4. AI Deal Evaluator (`lib/ai/DealEvaluator.ts`)

**Purpose**: AI evaluates deals and decides whether to accept/reject/modify.

**Responsibilities**:
- Evaluate deal from AI country's perspective
- Consider:
  - Resource availability
  - Strategic value
  - Diplomatic relations
  - Country needs/goals
- Return accept/reject/modify decision
- Generate counter-proposals if needed

**Key Methods**:
```typescript
async evaluateDeal(
  deal: Deal,
  aiCountryId: string,
  gameContext: GameContext
): Promise<DealEvaluation>

interface DealEvaluation {
  decision: 'accept' | 'reject' | 'modify';
  reasoning: string;
  counterProposal?: DealTerms;
  confidence: number;
}
```

**Integration with ChatHandler**:
- When deal is proposed, ChatHandler calls DealEvaluator
- AI response includes evaluation decision
- If accepted, auto-confirm deal
- If rejected/modified, respond in chat with reasoning

### 5. Enhanced DealExecutor (`lib/game-engine/DealExecutor.ts`)

**Purpose**: Execute active deals each turn and track compliance.

**Responsibilities**:
- Process all active deals each turn
- Execute commitments (resource transfers, budget transfers, etc.)
- Track deal progress and duration
- Handle deal expiration
- Detect violations (future: reputation system)
- Update deal status (active → completed/violated)

**Deal Execution Logic**:

**Trade Deals**:
- Transfer resources between countries
- Transfer budget if specified
- Validate availability before transfer
- Log transfers in turn events

**Alliance Deals**:
- Update diplomatic relations
- Apply mutual defense modifiers (future)
- Track alliance status

**Non-Aggression Deals**:
- Prevent military actions between parties
- Update diplomatic relations
- Track violations

**Military Aid Deals**:
- Transfer military equipment/resources
- Transfer budget for military spending
- Apply military strength modifiers

**Technology Share Deals**:
- Increase technology level
- Share research progress
- Apply technology bonuses

**Custom Deals**:
- Execute based on custom terms
- Flexible execution based on deal_terms structure

**Key Methods**:
```typescript
async executeDeals(
  gameState: GameState,
  turn: number
): Promise<DealExecutionResult[]>

private executeTradeDeal(deal: Deal, gameState: GameState): Promise<void>
private executeAllianceDeal(deal: Deal, gameState: GameState): Promise<void>
// ... other deal type handlers
```

### 6. Deal API Endpoints

#### `POST /api/deals/extract` - Extract deal from chat
- Input: `{ chatId, gameId, messageIds? }`
- Output: `{ deal: DealExtractionResult | null }`
- Extracts deal from recent chat messages

#### `POST /api/deals/:id/confirm` - Confirm deal
- Input: `{ countryId, action: 'accept' | 'reject' | 'modify', message? }`
- Output: `{ confirmation: DealConfirmation, deal: Deal }`
- Creates confirmation record and checks if deal should activate

#### `GET /api/deals?gameId=...&status=...` - List deals
- Returns deals for a game, optionally filtered by status
- Includes deal summaries

#### `GET /api/deals/:id` - Get deal details
- Returns full deal with summary and confirmations

### 7. UI Components

#### `DealExtractionButton` - Extract deal from chat
- Button in DiplomacyChat component
- Triggers deal extraction from recent messages
- Shows extracted deal preview
- Allows proposing the extracted deal

#### `DealSummaryCard` - Display deal summary
- Shows human-readable deal summary
- Displays what each party commits to
- Shows status and confirmations
- Action buttons (accept/reject/modify)

#### `DealConfirmationPanel` - Deal review and confirmation
- Full deal details
- Confirmation status for both parties
- Accept/Reject/Modify buttons
- Shows AI's evaluation if available

#### `ActiveDealsList` - List active deals
- Shows all active deals for current game
- Progress indicators
- Expiration warnings
- Quick actions

#### Enhanced `DiplomacyChat`
- "Extract Deal" button when deal-like conversation detected
- Deal proposal notifications
- Inline deal previews
- Link to deal confirmation panel

## Implementation Phases

### Phase 1: Deal Extraction (Foundation)
1. Create `DealExtractor` service
2. Add LLM prompt for deal extraction
3. Create `/api/deals/extract` endpoint
4. Add "Extract Deal" button to DiplomacyChat
5. Test extraction with various deal types

### Phase 2: Deal Summarization
1. Create `DealSummarizer` service
2. Generate human-readable summaries
3. Update DealProposal component to show summaries
4. Add deal summary to deal API responses

### Phase 3: Deal Confirmation Workflow
1. Create `DealConfirmationService`
2. Implement `/api/deals/:id/confirm` endpoint
3. Create `DealConfirmationPanel` component
4. Add confirmation status tracking
5. Auto-activate deals when both parties confirm

### Phase 4: AI Deal Evaluation
1. Create `DealEvaluator` service
2. Integrate with ChatHandler
3. Auto-confirm deals when AI accepts
4. Generate counter-proposals when AI modifies
5. Add evaluation reasoning to chat responses

### Phase 5: Deal Execution
1. Enhance `DealExecutor` with full implementation
2. Implement execution for each deal type
3. Integrate with TurnProcessor
4. Add deal execution events
5. Handle deal expiration and completion

### Phase 6: UI Polish
1. Add deal notifications
2. Improve deal summary display
3. Add deal history view
4. Add deal violation tracking (future)
5. Polish animations and transitions

## Database Considerations

### Deal Status Flow
```
draft → proposed → accepted → active → completed
                              ↓
                           violated
```

### Deal Confirmations
- Each confirmation creates a `deal_confirmations` record
- Track who confirmed and when
- Store optional message with confirmation
- Support 'modify' action for counter-proposals

### Deal Execution Tracking
- Consider adding `deal_executions` table for history
- Track each turn's execution results
- Log resource transfers and effects

## Error Handling

### Deal Extraction Failures
- Return null if no deal detected
- Log extraction attempts
- Allow manual deal creation as fallback

### Deal Execution Failures
- Handle insufficient resources gracefully
- Mark deal as 'violated' if execution fails
- Notify parties of violations
- Allow deal renegotiation

### AI Evaluation Failures
- Fallback to simple rule-based evaluation
- Default to 'reject' if uncertain
- Log evaluation errors

## Testing Strategy

### Unit Tests
- DealExtractor: Test extraction with various chat scenarios
- DealSummarizer: Test summary generation
- DealEvaluator: Test AI evaluation logic
- DealExecutor: Test execution for each deal type

### Integration Tests
- Full workflow: Chat → Extract → Propose → Confirm → Execute
- AI auto-confirmation flow
- Deal expiration handling
- Resource validation

### Manual Testing
- Test with real chat conversations
- Verify deal summaries are clear
- Test confirmation workflow
- Verify deal execution in game

## Future Enhancements

1. **Auto-detection**: Automatically detect deals in chat without button click
2. **Deal Templates**: Pre-defined deal templates for common scenarios
3. **Deal Negotiation**: Multi-round negotiation with counter-proposals
4. **Deal Violations**: Track and penalize deal violations
5. **Reputation System**: Countries remember broken deals
6. **Deal Analytics**: Track deal success rates and patterns
7. **Multi-party Deals**: Support deals between 3+ countries
8. **Conditional Deals**: Deals with complex conditions and triggers

## Key Files to Create/Modify

### New Files
- `lib/deals/DealExtractor.ts`
- `lib/deals/DealSummarizer.ts`
- `lib/deals/DealConfirmationService.ts`
- `lib/ai/DealEvaluator.ts`
- `app/api/deals/extract/route.ts`
- `app/api/deals/[id]/confirm/route.ts`
- `components/game/DealExtractionButton.tsx`
- `components/game/DealSummaryCard.tsx`
- `components/game/DealConfirmationPanel.tsx`

### Modified Files
- `lib/game-engine/DealExecutor.ts` (full implementation)
- `lib/ai/ChatHandler.ts` (integrate deal extraction)
- `components/game/DiplomacyChat.tsx` (add deal extraction UI)
- `components/game/DealProposal.tsx` (use DealSummarizer)
- `app/api/deals/route.ts` (add GET endpoint)
- `app/api/turn/route.ts` (call DealExecutor)

## Success Criteria

1. ✅ Deals can be extracted from natural language chat
2. ✅ Deals are summarized in clear, human-readable format
3. ✅ Both player and AI can confirm deals
4. ✅ Deals are executed correctly in the game engine
5. ✅ Deal status is tracked and updated properly
6. ✅ UI provides clear feedback throughout the process
7. ✅ System handles errors gracefully
8. ✅ Performance is acceptable (LLM calls are reasonable)
