ALTER TABLE public.ai_training_queue
ADD COLUMN IF NOT EXISTS conversation_started_at timestamptz;

UPDATE public.ai_training_queue q
SET conversation_started_at = first_message.started_at
FROM (
  SELECT conversation_id, min(created_at) AS started_at
  FROM public.messages
  GROUP BY conversation_id
) AS first_message
WHERE q.conversation_id = first_message.conversation_id
  AND q.conversation_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_training_queue_workspace_conversation_started
ON public.ai_training_queue (workspace_id, conversation_started_at DESC);