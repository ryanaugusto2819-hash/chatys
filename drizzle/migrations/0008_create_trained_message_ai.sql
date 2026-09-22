ALTER TABLE public.ai_agent_configs
  DROP CONSTRAINT IF EXISTS ai_agent_configs_agent_key_check;
ALTER TABLE public.ai_agent_configs
  ADD CONSTRAINT ai_agent_configs_agent_key_check
  CHECK (agent_key IN ('orchestrator','flow_selector','support','payment','trained_messages','post_sale','upsell','remarketing','supervisor'));

ALTER TABLE public.ai_orchestration_decisions
  DROP CONSTRAINT IF EXISTS ai_orchestration_decisions_selected_agent_check;
ALTER TABLE public.ai_orchestration_decisions
  ADD CONSTRAINT ai_orchestration_decisions_selected_agent_check
  CHECK (selected_agent IN ('none','flow_selector','support','payment','trained_messages','post_sale','upsell','remarketing'));

CREATE TABLE public.ai_trained_message_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_config_id uuid NOT NULL REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  source_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  example_message text NOT NULL,
  context_notes text NOT NULL DEFAULT '',
  official_response text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_trained_message_rules TO authenticated;
GRANT ALL ON public.ai_trained_message_rules TO service_role;
ALTER TABLE public.ai_trained_message_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view trained message rules"
ON public.ai_trained_message_rules FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Workspace admins can create trained message rules"
ON public.ai_trained_message_rules FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can update trained message rules"
ON public.ai_trained_message_rules FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can delete trained message rules"
ON public.ai_trained_message_rules FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id));
CREATE INDEX ai_trained_message_rules_workspace_active_idx
ON public.ai_trained_message_rules(workspace_id, active, updated_at DESC);
CREATE TRIGGER update_ai_trained_message_rules_updated_at
BEFORE UPDATE ON public.ai_trained_message_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ai_training_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_config_id uuid NOT NULL REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  customer_message text NOT NULL DEFAULT '',
  message_type text NOT NULL DEFAULT 'text',
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','unmatched','trained','no_response','ignored','failed')),
  matched_rule_id uuid REFERENCES public.ai_trained_message_rules(id) ON DELETE SET NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  match_reason text NOT NULL DEFAULT '',
  suggested_response text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_training_queue TO authenticated;
GRANT ALL ON public.ai_training_queue TO service_role;
ALTER TABLE public.ai_training_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view AI training queue"
ON public.ai_training_queue FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Workspace admins can create AI training queue items"
ON public.ai_training_queue FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can update AI training queue items"
ON public.ai_training_queue FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can delete AI training queue items"
ON public.ai_training_queue FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id));
CREATE INDEX ai_training_queue_workspace_status_idx
ON public.ai_training_queue(workspace_id, status, created_at DESC);
CREATE INDEX ai_training_queue_conversation_idx
ON public.ai_training_queue(conversation_id, created_at DESC);
CREATE TRIGGER update_ai_training_queue_updated_at
BEFORE UPDATE ON public.ai_training_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();