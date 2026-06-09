
CREATE TABLE public.evolution_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  event TEXT,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.evolution_webhook_events TO service_role;
GRANT SELECT ON public.evolution_webhook_events TO authenticated;
ALTER TABLE public.evolution_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read evolution events" ON public.evolution_webhook_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT,
  event TEXT,
  remote_jid TEXT,
  push_name TEXT,
  message_text TEXT,
  from_me BOOLEAN DEFAULT false,
  raw_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_messages TO service_role;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read whatsapp messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_evolution_events_created_at ON public.evolution_webhook_events (created_at DESC);
CREATE INDEX idx_whatsapp_messages_remote_jid ON public.whatsapp_messages (remote_jid);
CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages (created_at DESC);
