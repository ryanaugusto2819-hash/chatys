ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN requires_no_tags boolean NOT NULL DEFAULT false;

CREATE INDEX ai_trained_message_rules_requires_no_tags_idx
  ON public.ai_trained_message_rules (agent_config_id, requires_no_tags)
  WHERE requires_no_tags = true;

COMMENT ON COLUMN public.ai_trained_message_rules.requires_no_tags IS 'When true, this rule is eligible only when the contact has no tags.';