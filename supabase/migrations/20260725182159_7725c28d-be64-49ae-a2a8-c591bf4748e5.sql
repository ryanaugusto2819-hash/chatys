
-- Multi-pixel per workspace
CREATE TABLE public.meta_capi_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pixel_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  test_event_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_capi_pixels_workspace ON public.meta_capi_pixels(workspace_id) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_capi_pixels TO authenticated;
GRANT ALL ON public.meta_capi_pixels TO service_role;

ALTER TABLE public.meta_capi_pixels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins manage capi pixels"
  ON public.meta_capi_pixels FOR ALL
  TO authenticated
  USING (public.is_workspace_admin(workspace_id) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_workspace_admin(workspace_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Workspace members view capi pixels"
  ON public.meta_capi_pixels FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_meta_capi_pixels_updated_at
  BEFORE UPDATE ON public.meta_capi_pixels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Event log
CREATE TABLE public.meta_capi_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  pixel_id_ref UUID REFERENCES public.meta_capi_pixels(id) ON DELETE SET NULL,
  pixel_id TEXT NOT NULL,
  conversation_id UUID,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  value NUMERIC,
  currency TEXT,
  ctwa_clid TEXT,
  request_payload JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_capi_events_workspace ON public.meta_capi_events(workspace_id, created_at DESC);
CREATE INDEX idx_meta_capi_events_conversation ON public.meta_capi_events(conversation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_capi_events TO authenticated;
GRANT ALL ON public.meta_capi_events TO service_role;

ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view capi events"
  ON public.meta_capi_events FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Service role writes capi events"
  ON public.meta_capi_events FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
