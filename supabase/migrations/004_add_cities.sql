-- Add cities table for military conquest and resource distribution

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  name text not null,
  position_x numeric not null,
  position_y numeric not null,
  size text not null check (size in ('small', 'medium', 'large')),
  resources_per_turn jsonb not null default '{}'::jsonb,
  population integer not null,
  infrastructure integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add infrastructure_level to country_stats if it doesn't exist
alter table country_stats
  add column if not exists infrastructure_level integer not null default 0;

-- Indexes
create index if not exists idx_cities_country_id on cities(country_id);

-- Enable RLS
alter table cities enable row level security;

-- RLS policies
create policy "cities_select" on cities for select using (true);
create policy "cities_insert" on cities for insert with check (true);
create policy "cities_update" on cities for update using (true);
create policy "cities_delete" on cities for delete using (true);