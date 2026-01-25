-- Make LLM advisory fields nullable (rationale, threat_assessment, opportunity_identified)
-- These fields are deprecated and no longer required for gameplay
-- Existing rows will retain their values; new rows can omit them

-- Check if table exists and columns are not already nullable
-- If running this multiple times, it should be idempotent

alter table if exists llm_strategic_plans
  alter column rationale drop not null,
  alter column threat_assessment drop not null,
  alter column opportunity_identified drop not null;

-- Set default values for new rows
alter table if exists llm_strategic_plans
  alter column rationale set default '',
  alter column threat_assessment set default '',
  alter column opportunity_identified set default '';
