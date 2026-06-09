
ALTER TABLE public.evolution_webhook_events
  ADD COLUMN IF NOT EXISTS remote_jid text,
  ADD COLUMN IF NOT EXISTS push_name text,
  ADD COLUMN IF NOT EXISTS message_text text;

CREATE INDEX IF NOT EXISTS idx_evolution_webhook_events_created_at ON public.evolution_webhook_events (created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.evolution_webhook_events;
ALTER TABLE public.evolution_webhook_events REPLICA IDENTITY FULL;
