ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS provider_chat_id TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_connection_provider_chat_id ON public.conversations (connection_config_id, provider_chat_id) WHERE provider_chat_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;