-- Strato initial schema (games, countries, stats, actions, chat, deals)

create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type game_status as enum ('active','paused','finished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type action_type as enum ('diplomacy','military','economic','research');
exception when duplicate_object then null; end $$;

do $$ begin
  create type action_status as enum ('pending','executed','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_type as enum ('trade','alliance','non_aggression','military_aid','technology_share','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_status as enum ('draft','proposed','accepted','rejected','active','completed','violated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_confirmation_action as enum ('propose','accept','reject','modify');
exception when duplicate_object then null; end $$;

-- Tables
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  current_turn integer not null default 1,
  status game_status not null default 'active',
  player_country_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  name text not null,
  is_player_controlled boolean not null default false,
  color text not null default '#888888',
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table games
  drop constraint if exists games_player_country_fk;
alter table games
  add constraint games_player_country_fk foreign key (player_country_id) references countries(id);

create table if not exists country_stats (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  turn integer not null,
  population integer not null default 1000000,
  budget numeric not null default 1000,
  technology_level numeric not null default 1,
  military_strength integer not null default 10,
  military_equipment jsonb not null default '{}'::jsonb,
  resources jsonb not null default '{}'::jsonb,
  diplomatic_relations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(country_id, turn)
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  turn integer not null,
  action_type action_type not null,
  action_data jsonb not null default '{}'::jsonb,
  status action_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists turn_history (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  turn integer not null,
  state_snapshot jsonb not null,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(game_id, turn)
);

create table if not exists diplomacy_chats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  country_a_id uuid not null references countries(id) on delete cascade,
  country_b_id uuid not null references countries(id) on delete cascade,
  last_message_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, country_a_id, country_b_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references diplomacy_chats(id) on delete cascade,
  sender_country_id uuid not null references countries(id) on delete cascade,
  message_text text not null,
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  proposing_country_id uuid not null references countries(id) on delete cascade,
  receiving_country_id uuid not null references countries(id) on delete cascade,
  deal_type deal_type not null,
  deal_terms jsonb not null default '{}'::jsonb,
  status deal_status not null default 'draft',
  proposed_at timestamptz null,
  accepted_at timestamptz null,
  expires_at timestamptz null,
  turn_created integer not null,
  turn_expires integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deal_confirmations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  action deal_confirmation_action not null,
  message text null,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_countries_game_id on countries(game_id);
create index if not exists idx_country_stats_country_id_turn on country_stats(country_id, turn);
create index if not exists idx_actions_game_id_turn on actions(game_id, turn);
create index if not exists idx_chat_messages_chat_id_created_at on chat_messages(chat_id, created_at);
create index if not exists idx_deals_game_id_status on deals(game_id, status);

