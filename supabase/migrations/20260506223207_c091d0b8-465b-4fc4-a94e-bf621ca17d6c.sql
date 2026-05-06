
-- Meta connections table for Embedded Signup onboarding
CREATE TABLE public.meta_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  connection_config_id uuid REFERENCES public.connection_configs(id) ON DELETE CASCADE,
  business_id text,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  access_token text NOT NULL,
  token_type text DEFAULT 'long_lived',
  expires_in integer,
  connected_phone text,
  verified_name text,
  quality_rating text,
  webhook_status text NOT NULL DEFAULT 'pending',
  status text NOT NULL DEFAULT 'active',
  raw_debug_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_meta_connections_workspace ON public.meta_connections(workspace_id);
CREATE INDEX idx_meta_connections_waba ON public.meta_connections(waba_id);
CREATE INDEX idx_meta_connections_phone ON public.meta_connections(phone_number_id);
CREATE UNIQUE INDEX idx_meta_connections_phone_unique ON public.meta_connections(phone_number_id) WHERE status = 'active';

-- RLS
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view meta_connections"
ON public.meta_connections FOR SELECT
USING (EXISTS (
  SELECT 1 FROM workspace_members wm
  WHERE wm.workspace_id = meta_connections.workspace_id AND wm.user_id = auth.uid()
));

CREATE POLICY "Workspace admins can manage meta_connections"
ON public.meta_connections FOR ALL
USING (EXISTS (
  SELECT 1 FROM workspace_members wm
  WHERE wm.workspace_id = meta_connections.workspace_id AND wm.user_id = auth.uid() AND wm.role = 'admin'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM workspace_members wm
  WHERE wm.workspace_id = meta_connections.workspace_id AND wm.user_id = auth.uid() AND wm.role = 'admin'
));

-- Service role insert (for edge functions)
CREATE POLICY "Service can manage meta_connections"
ON public.meta_connections FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_meta_connections_updated_at
BEFORE UPDATE ON public.meta_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
