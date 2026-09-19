CREATE TABLE public.ai_agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  niche_id uuid REFERENCES public.niches(id) ON DELETE CASCADE,
  agent_key text NOT NULL CHECK (agent_key IN ('orchestrator','flow_selector','support','post_sale','upsell','remarketing','supervisor')),
  enabled boolean NOT NULL DEFAULT false,
  operation_mode text NOT NULL DEFAULT 'test' CHECK (operation_mode IN ('test','live')),
  priority integer NOT NULL DEFAULT 100,
  instructions text NOT NULL DEFAULT '',
  entry_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocking_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_configs TO authenticated;
GRANT ALL ON public.ai_agent_configs TO service_role;
ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view AI agent configs"
ON public.ai_agent_configs FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Workspace admins can create AI agent configs"
ON public.ai_agent_configs FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can update AI agent configs"
ON public.ai_agent_configs FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can delete AI agent configs"
ON public.ai_agent_configs FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id));
CREATE UNIQUE INDEX ai_agent_configs_workspace_global_unique
ON public.ai_agent_configs(workspace_id, agent_key)
WHERE niche_id IS NULL;
CREATE UNIQUE INDEX ai_agent_configs_workspace_niche_unique
ON public.ai_agent_configs(workspace_id, niche_id, agent_key)
WHERE niche_id IS NOT NULL;
CREATE INDEX ai_agent_configs_workspace_idx ON public.ai_agent_configs(workspace_id, agent_key);

CREATE TABLE public.ai_orchestration_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  selected_agent text NOT NULL CHECK (selected_agent IN ('none','flow_selector','support','post_sale','upsell','remarketing')),
  action text NOT NULL DEFAULT 'none',
  reason text NOT NULL DEFAULT '',
  confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  operation_mode text NOT NULL DEFAULT 'test' CHECK (operation_mode IN ('test','live')),
  status text NOT NULL DEFAULT 'decided' CHECK (status IN ('decided','skipped','executed','failed')),
  execution_result jsonb,
  duration_ms integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_orchestration_decisions TO authenticated;
GRANT INSERT, UPDATE ON public.ai_orchestration_decisions TO authenticated;
GRANT ALL ON public.ai_orchestration_decisions TO service_role;
ALTER TABLE public.ai_orchestration_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view AI decisions"
ON public.ai_orchestration_decisions FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Workspace admins can create AI decisions"
ON public.ai_orchestration_decisions FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can update AI decisions"
ON public.ai_orchestration_decisions FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE UNIQUE INDEX ai_orchestration_one_decision_per_message
ON public.ai_orchestration_decisions(conversation_id, source_message_id)
WHERE source_message_id IS NOT NULL;
CREATE INDEX ai_orchestration_workspace_created_idx
ON public.ai_orchestration_decisions(workspace_id, created_at DESC);
CREATE INDEX ai_orchestration_conversation_created_idx
ON public.ai_orchestration_decisions(conversation_id, created_at DESC);

CREATE TRIGGER update_ai_agent_configs_updated_at
BEFORE UPDATE ON public.ai_agent_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();