-- LLM strategic plan persistence

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
