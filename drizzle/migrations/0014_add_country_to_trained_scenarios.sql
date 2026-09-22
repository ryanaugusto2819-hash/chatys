ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN country_code text NOT NULL DEFAULT 'any';

ALTER TABLE public.ai_trained_message_rules
  ADD CONSTRAINT ai_trained_message_rules_country_code_check
  CHECK (country_code IN ('any', 'MX', 'UY', 'AR')) NOT VALID;

CREATE INDEX ai_trained_message_rules_country_idx
  ON public.ai_trained_message_rules (agent_config_id, country_code, active);

ALTER TABLE public.ai_training_queue
  ADD COLUMN detected_country_code text;

ALTER TABLE public.ai_training_queue
  ADD CONSTRAINT ai_training_queue_detected_country_check
  CHECK (detected_country_code IS NULL OR detected_country_code IN ('MX', 'UY', 'AR')) NOT VALID;

COMMENT ON COLUMN public.ai_trained_message_rules.country_code IS 'Country condition inferred from contact phone DDI; any is the fallback.';
COMMENT ON COLUMN public.ai_training_queue.detected_country_code IS 'Country inferred from contact phone DDI at analysis time.';