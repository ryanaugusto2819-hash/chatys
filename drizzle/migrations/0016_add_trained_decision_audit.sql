ALTER TABLE public.ai_training_queue
  ADD COLUMN IF NOT EXISTS matched_rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_feedback text,
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_by uuid;

ALTER TABLE public.ai_training_queue
  ADD CONSTRAINT ai_training_queue_decision_feedback_check
  CHECK (decision_feedback IS NULL OR decision_feedback IN ('correct', 'incorrect'));

CREATE INDEX IF NOT EXISTS ai_training_queue_feedback_idx
  ON public.ai_training_queue(workspace_id, decision_feedback, processed_at DESC)
  WHERE decision_feedback IS NOT NULL;

COMMENT ON COLUMN public.ai_training_queue.matched_rule_snapshot IS 'Immutable copy of the trained rule used for this decision, preserving the exact historical basis even if the source rule changes.';
COMMENT ON COLUMN public.ai_training_queue.decision_feedback IS 'Human review of the AI decision: correct or incorrect; does not execute actions or modify rules.';
COMMENT ON COLUMN public.ai_training_queue.feedback_at IS 'Timestamp of the latest human decision review.';
COMMENT ON COLUMN public.ai_training_queue.feedback_by IS 'Authenticated user who last reviewed the decision; intentionally not linked to auth.users.';