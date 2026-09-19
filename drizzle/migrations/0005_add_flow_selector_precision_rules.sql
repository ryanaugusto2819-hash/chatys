ALTER TABLE public.ai_agent_flows
  ADD COLUMN do_not_send_when text NOT NULL DEFAULT '',
  ADD COLUMN trigger_examples text NOT NULL DEFAULT '',
  ADD COLUMN analyze_flow_content boolean NOT NULL DEFAULT false;