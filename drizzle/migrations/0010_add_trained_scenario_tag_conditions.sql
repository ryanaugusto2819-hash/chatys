ALTER TABLE public.ai_trained_message_rules
  ADD COLUMN required_tag_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN excluded_tag_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.ai_trained_message_rules.required_tag_ids IS 'All listed workspace tag IDs must be assigned to the contact before this trained scenario is eligible.';
COMMENT ON COLUMN public.ai_trained_message_rules.excluded_tag_ids IS 'This trained scenario is ineligible when any listed workspace tag ID is assigned to the contact.';

CREATE INDEX idx_ai_trained_rules_required_tags
  ON public.ai_trained_message_rules USING gin (required_tag_ids);

CREATE INDEX idx_ai_trained_rules_excluded_tags
  ON public.ai_trained_message_rules USING gin (excluded_tag_ids);