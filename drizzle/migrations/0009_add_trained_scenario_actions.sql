ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN expected_action text NOT NULL DEFAULT '',
  ADD COLUMN action_type text NOT NULL DEFAULT 'reply';

ALTER TABLE public.ai_trained_message_rules
  ADD CONSTRAINT ai_trained_message_rules_action_type_check
  CHECK (action_type IN ('reply','no_response','wait','route','other'));

ALTER TABLE public.ai_training_queue
  ADD COLUMN suggested_action text,
  ADD COLUMN suggested_action_type text;

ALTER TABLE public.ai_training_queue
  ADD CONSTRAINT ai_training_queue_suggested_action_type_check
  CHECK (suggested_action_type IS NULL OR suggested_action_type IN ('reply','no_response','wait','route','other'));

COMMENT ON COLUMN public.ai_trained_message_rules.expected_action IS 'Ação operacional exata ensinada pelo administrador para o cenário.';
COMMENT ON COLUMN public.ai_trained_message_rules.action_type IS 'Tipo seguro da ação treinada; reply permite mensagem literal, demais não executam automaticamente.';
COMMENT ON COLUMN public.ai_training_queue.suggested_action IS 'Ação treinada que seria selecionada no modo de teste.';
COMMENT ON COLUMN public.ai_training_queue.suggested_action_type IS 'Tipo da ação sugerida no modo de teste.';