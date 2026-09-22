ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN response_messages jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.ai_trained_message_rules
SET response_messages = jsonb_build_array(official_response)
WHERE official_response IS NOT NULL
  AND btrim(official_response) <> ''
  AND response_messages = '[]'::jsonb;

ALTER TABLE public.ai_trained_message_rules
  ADD CONSTRAINT ai_trained_message_rules_response_messages_array
  CHECK (jsonb_typeof(response_messages) = 'array') NOT VALID;

ALTER TABLE public.ai_training_queue
  ADD COLUMN suggested_responses jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.ai_training_queue
SET suggested_responses = jsonb_build_array(suggested_response)
WHERE suggested_response IS NOT NULL
  AND btrim(suggested_response) <> ''
  AND suggested_responses = '[]'::jsonb;

ALTER TABLE public.ai_training_queue
  ADD CONSTRAINT ai_training_queue_suggested_responses_array
  CHECK (jsonb_typeof(suggested_responses) = 'array') NOT VALID;

COMMENT ON COLUMN public.ai_trained_message_rules.official_response IS 'Compatibility field containing the first response; ordered messages live in response_messages.';
COMMENT ON COLUMN public.ai_training_queue.suggested_response IS 'Compatibility field containing the first suggested response; ordered messages live in suggested_responses.';