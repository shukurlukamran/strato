-- Adds cached leader summaries for tooltip descriptions

alter table leader_profiles
  add column if not exists summary text;
