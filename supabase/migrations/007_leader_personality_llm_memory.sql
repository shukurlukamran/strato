-- Adds leader personality persistence, chat memory summaries, and LLM usage ledger

do $$ begin
  create type llm_usage_operation as enum (
    'chat_reply',
    'deal_extract',
    'military_decision',
    'strategic_plan',
    'summary_update'
  );
exception when duplicate_object then null; end $$;

create table if not exists leader_profiles (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  leader_name text not null default 'Unknown Leader',
  title text null,
  public_values text null,
  traits jsonb not null default '{}'::jsonb,
  decision_weights jsonb not null default '{}'::jsonb,
  voice_profile jsonb not null default '{}'::jsonb,
  seed text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, country_id)
);

create table if not exists chat_memory_summaries (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references diplomacy_chats(id) on delete cascade,
  summary text null,
  open_threads jsonb not null default '{}'::jsonb,
  relationship_state jsonb not null default '{"trust":50,"grievance":0,"respect":50}'::jsonb,
  policy_state jsonb not null default '{}'::jsonb,
  last_summarized_message_at timestamptz null,
  last_message_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(chat_id)
);

create table if not exists llm_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_country_id uuid not null references countries(id) on delete cascade,
  chat_id uuid null references diplomacy_chats(id) on delete set null,
  operation llm_usage_operation not null,
  turn integer not null,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  input_tokens integer null,
  output_tokens integer null,
  usd_estimate numeric not null default 0,
  budget_cost_charged numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_llm_usage_game_country_turn on llm_usage_ledger(game_id, player_country_id, turn);
create index if not exists idx_llm_usage_chat_created_at on llm_usage_ledger(chat_id, created_at desc);
