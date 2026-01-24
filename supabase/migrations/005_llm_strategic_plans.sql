-- LLM strategic plan persistence
-- PHASE 5 VERIFICATION: Supabase alignment check
-- ✓ recommended_actions column is JSONB - supports mixed arrays (strings + objects)
-- ✓ All required columns present for LLMStrategicAnalysis persistence
-- ✓ Schema supports 8-10 step plans (planItems stored as JSONB array)
-- ✓ Indexes optimized for query patterns in LLMStrategicPlanner.ts

-- Test query to verify plan persistence:
-- SELECT 
--   country_id,
--   strategic_focus,
--   jsonb_array_length(recommended_actions) as action_count,
--   jsonb_typeof(recommended_actions) as type,
--   turn_analyzed,
--   confidence_score
-- FROM llm_strategic_plans
-- WHERE game_id = 'GAME_ID'
-- ORDER BY turn_analyzed DESC
-- LIMIT 10;

create table if not exists llm_strategic_plans (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  turn_analyzed integer not null,
  valid_until_turn integer not null,
  strategic_focus text not null,
  rationale text not null,
  threat_assessment text not null,
  opportunity_identified text not null,
  recommended_actions jsonb not null default '[]'::jsonb,
  diplomatic_stance jsonb not null default '{}'::jsonb,
  confidence_score numeric not null default 0.7,
  created_at timestamptz not null default now(),
  unique(game_id, country_id, turn_analyzed)
);

create index if not exists idx_llm_strategic_plans_lookup
  on llm_strategic_plans(game_id, country_id, turn_analyzed desc);

create index if not exists idx_llm_strategic_plans_active
  on llm_strategic_plans(game_id, country_id, valid_until_turn);
