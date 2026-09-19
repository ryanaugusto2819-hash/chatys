CREATE TABLE public.ai_agent_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id uuid NOT NULL REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  connection_config_id uuid NOT NULL REFERENCES public.connection_configs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_config_id, connection_config_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_connections TO authenticated;
GRANT ALL ON public.ai_agent_connections TO service_role;
ALTER TABLE public.ai_agent_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view AI agent connections"
ON public.ai_agent_connections FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_member(config.workspace_id)
));
CREATE POLICY "Workspace admins can create AI agent connections"
ON public.ai_agent_connections FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE POLICY "Workspace admins can update AI agent connections"
ON public.ai_agent_connections FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_admin(config.workspace_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE POLICY "Workspace admins can delete AI agent connections"
ON public.ai_agent_connections FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE INDEX ai_agent_connections_config_idx ON public.ai_agent_connections(agent_config_id);
CREATE INDEX ai_agent_connections_connection_idx ON public.ai_agent_connections(connection_config_id);

CREATE TABLE public.ai_agent_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id uuid NOT NULL REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  send_when text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_config_id, flow_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_flows TO authenticated;
GRANT ALL ON public.ai_agent_flows TO service_role;
ALTER TABLE public.ai_agent_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view AI agent flows"
ON public.ai_agent_flows FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_member(config.workspace_id)
));
CREATE POLICY "Workspace admins can create AI agent flows"
ON public.ai_agent_flows FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  JOIN public.automation_flows flow ON flow.id = flow_id
  WHERE config.id = agent_config_id
    AND flow.workspace_id = config.workspace_id
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE POLICY "Workspace admins can update AI agent flows"
ON public.ai_agent_flows FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_admin(config.workspace_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  JOIN public.automation_flows flow ON flow.id = flow_id
  WHERE config.id = agent_config_id
    AND flow.workspace_id = config.workspace_id
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE POLICY "Workspace admins can delete AI agent flows"
ON public.ai_agent_flows FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE INDEX ai_agent_flows_config_idx ON public.ai_agent_flows(agent_config_id);
CREATE INDEX ai_agent_flows_flow_idx ON public.ai_agent_flows(flow_id);
CREATE TRIGGER update_ai_agent_flows_updated_at
BEFORE UPDATE ON public.ai_agent_flows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();