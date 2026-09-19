CREATE TABLE public.ai_agent_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_config_id uuid NOT NULL REFERENCES public.ai_agent_configs(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_faqs TO authenticated;
GRANT ALL ON public.ai_agent_faqs TO service_role;
ALTER TABLE public.ai_agent_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view AI agent FAQs"
ON public.ai_agent_faqs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND config.agent_key = 'support'
    AND public.is_workspace_member(config.workspace_id)
));
CREATE POLICY "Workspace admins can create AI agent FAQs"
ON public.ai_agent_faqs FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND config.agent_key = 'support'
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE POLICY "Workspace admins can update AI agent FAQs"
ON public.ai_agent_faqs FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND config.agent_key = 'support'
    AND public.is_workspace_admin(config.workspace_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND config.agent_key = 'support'
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE POLICY "Workspace admins can delete AI agent FAQs"
ON public.ai_agent_faqs FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.ai_agent_configs config
  WHERE config.id = agent_config_id
    AND config.agent_key = 'support'
    AND public.is_workspace_admin(config.workspace_id)
));
CREATE INDEX ai_agent_faqs_config_sort_idx ON public.ai_agent_faqs(agent_config_id, sort_order);
CREATE TRIGGER update_ai_agent_faqs_updated_at
BEFORE UPDATE ON public.ai_agent_faqs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();