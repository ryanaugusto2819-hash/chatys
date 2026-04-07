-- Add flow_id to follow_up_templates for AI context from automation flows
ALTER TABLE public.follow_up_templates
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES public.automation_flows(id) ON DELETE SET NULL;

-- Add give_up_detected flag to conversations for blocking follow-ups
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS follow_up_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS follow_up_blocked_reason TEXT;

-- Index for efficient querying of blocked conversations
CREATE INDEX IF NOT EXISTS idx_conversations_follow_up_blocked ON public.conversations(follow_up_blocked) WHERE follow_up_blocked = TRUE;
