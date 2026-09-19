ALTER TABLE public.ai_agent_configs
  DROP CONSTRAINT IF EXISTS ai_agent_configs_agent_key_check;

ALTER TABLE public.ai_agent_configs
  ADD CONSTRAINT ai_agent_configs_agent_key_check
  CHECK (agent_key IN ('orchestrator','flow_selector','support','payment','post_sale','upsell','remarketing','supervisor'));

ALTER TABLE public.ai_orchestration_decisions
  DROP CONSTRAINT IF EXISTS ai_orchestration_decisions_selected_agent_check;

ALTER TABLE public.ai_orchestration_decisions
  ADD CONSTRAINT ai_orchestration_decisions_selected_agent_check
  CHECK (selected_agent IN ('none','flow_selector','support','payment','post_sale','upsell','remarketing'));