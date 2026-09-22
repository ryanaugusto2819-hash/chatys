ALTER TABLE public.ai_trained_message_rules
ADD COLUMN action_observation text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.ai_trained_message_rules.action_observation IS 'Internal explanation of why the configured action is correct; never sent to the customer.';