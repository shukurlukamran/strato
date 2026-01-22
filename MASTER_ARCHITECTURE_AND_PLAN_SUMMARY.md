# Strato Master Architecture and Plan Summary

## Primary Reference Files
- `README.md` (tech stack, project structure, roadmap)
- `NEXT_STEPS_PLAN.md` (phase structure, architecture improvements)
- `NEXT_PHASES_PLAN.md` (current status, priority matrix)

## Architecture Snapshot
- Frontend: Next.js App Router with TypeScript
- Backend: Supabase (Postgres, Auth, Realtime); deployment on Vercel
- State management: Zustand
- AI: Rule-based core with optional LLM strategic layer
- Core modules:
  - `src/app` routes and API endpoints
  - `src/components/game` UI
  - `src/lib/game-engine` for TurnProcessor and game logic
  - `src/lib/ai` for AI decision making
  - `src/lib/deals` for deal extraction and execution
- Turn pipeline (from plan): TurnProcessor -> EconomicEngine, MilitaryEngine,
  ActionResolver, EventSystem, DealExecutor, AIController
  (RuleBasedAI + StrategyPlanner)

## Built Features (Current State)
- Economy: budget generation, resource production, population growth
- Military basics: strength calculations and recruitment; consistent per-unit costs
- Technology: research actions and multiplier effects
- Infrastructure: build actions and economic bonuses
- Turn processing: automatic AI action generation
- AI: rule-based economic and military decisions
- Diplomacy: chat-based diplomacy with basic deal execution
  (budget/resource transfers)
- Country specialization: 8 resource profile types

## Next Features by Priority
### P0 - Critical Fixes (Phase 3A)
- Deal system security and validation (prevent exploits, verify sender capacity)
- Implement missing deal types: technology boost, diplomatic commitment,
  military equipment transfer, action commitment
- Resource usage in actions: require and deduct resources; surface costs in UI
- Deal audit logging for traceability

### P1 - High Value Features (Phase 3B/3C)
- Military combat system: attack action UI, combat resolver, event output
- AI attack logic that uses combat mechanics
- Country selection at new game with randomized but fair starting stats

### P2 - Medium Value Features (Phase 3D)
- AI deal proposals and templates, plus player notifications

### P3 - Polish and UX (Phase 3E)
- Deal summaries (human-readable)
- Tooltips and info displays for core stats
- Chat restrictions to keep diplomacy on-topic
- General UI refinements

## Post-MVP / Deferred
- Multi-turn deal execution and advanced negotiation
- Territory/city capture details and deeper military unit types
- Expanded economy details, production chains, and market dynamics
- World map visual improvements and large-scale diplomacy systems
