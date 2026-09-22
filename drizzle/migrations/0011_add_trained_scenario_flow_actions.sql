ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN flow_id uuid REFERENCES public.automation_flows(id) ON DELETE SET NULL;

ALTER TABLE public.ai_training_queue
  ADD COLUMN suggested_flow_id uuid REFERENCES public.automation_flows(id) ON DELETE SET NULL;

ALTER TABLE public.ai_trained_message_rules
  DROP CONSTRAINT ai_trained_message_rules_action_type_check;

ALTER TABLE public.ai_trained_message_rules
  ADD CONSTRAINT ai_trained_message_rules_action_type_check
  CHECK (action_type IN ('reply','flow','reply_then_flow','no_response','wait','route','other'));

ALTER TABLE public.ai_training_queue
  DROP CONSTRAINT ai_training_queue_suggested_action_type_check;

ALTER TABLE public.ai_training_queue
  ADD CONSTRAINT ai_training_queue_suggested_action_type_check
  CHECK (suggested_action_type IS NULL OR suggested_action_type IN ('reply','flow','reply_then_flow','no_response','wait','route','other'));

CREATE INDEX ai_trained_message_rules_flow_idx
  ON public.ai_trained_message_rules(flow_id)
  WHERE flow_id IS NOT NULL;

COMMENT ON COLUMN public.ai_trained_message_rules.flow_id IS 'Fluxo selecionado para ações flow ou reply_then_flow; a IA apenas escolhe uma regra previamente cadastrada.';
COMMENT ON COLUMN public.ai_training_queue.suggested_flow_id IS 'Fluxo selecionado pela regra no modo de teste ou execução.';