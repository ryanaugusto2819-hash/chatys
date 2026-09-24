ALTER TABLE public.knowledge_base_items
  ADD COLUMN workspace_id uuid,
  ADD COLUMN country_code text NOT NULL DEFAULT 'any';

UPDATE public.knowledge_base_items k
SET workspace_id = n.workspace_id
FROM public.niches n
WHERE k.niche_id = n.id
  AND k.workspace_id IS NULL;

UPDATE public.knowledge_base_items
SET workspace_id = '10000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;

ALTER TABLE public.knowledge_base_items
  ALTER COLUMN workspace_id SET NOT NULL,
  ADD CONSTRAINT knowledge_base_items_country_code_check
    CHECK (country_code IN ('any', 'MX', 'UY', 'AR', 'BR'));

CREATE INDEX idx_knowledge_base_items_scope
  ON public.knowledge_base_items (workspace_id, niche_id, country_code, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_knowledge_base_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_niche_workspace uuid;
BEGIN
  IF NEW.niche_id IS NOT NULL THEN
    SELECT workspace_id INTO v_niche_workspace
    FROM public.niches
    WHERE id = NEW.niche_id;

    IF NOT FOUND OR v_niche_workspace IS DISTINCT FROM NEW.workspace_id THEN
      RAISE EXCEPTION 'O nicho selecionado não pertence a este espaço de trabalho';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_knowledge_base_scope
BEFORE INSERT OR UPDATE ON public.knowledge_base_items
FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_base_scope();

DROP POLICY IF EXISTS "Workspace members can manage knowledge_base_items" ON public.knowledge_base_items;
CREATE POLICY "Workspace members can view knowledge base"
ON public.knowledge_base_items
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Workspace admins can insert knowledge base"
ON public.knowledge_base_items
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can update knowledge base"
ON public.knowledge_base_items
FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "Workspace admins can delete knowledge base"
ON public.knowledge_base_items
FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base_items TO authenticated;
GRANT ALL ON public.knowledge_base_items TO service_role;

CREATE TABLE public.ai_smart_reply_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  execution_id uuid NOT NULL REFERENCES public.flow_executions(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.automation_flows(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.automation_nodes(id) ON DELETE CASCADE,
  niche_id uuid REFERENCES public.niches(id) ON DELETE SET NULL,
  country_code text NOT NULL DEFAULT 'any' CHECK (country_code IN ('any', 'MX', 'UY', 'AR', 'BR')),
  customer_message text NOT NULL DEFAULT '',
  context_snapshot text NOT NULL DEFAULT '',
  consulted_source_ids uuid[] NOT NULL DEFAULT '{}',
  used_source_ids uuid[] NOT NULL DEFAULT '{}',
  generated_response text,
  confidence numeric(5,4),
  outcome text NOT NULL DEFAULT 'processing' CHECK (outcome IN ('processing', 'answered', 'no_answer', 'error')),
  reason text,
  safe_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (execution_id, node_id)
);

GRANT SELECT ON public.ai_smart_reply_logs TO authenticated;
GRANT ALL ON public.ai_smart_reply_logs TO service_role;
ALTER TABLE public.ai_smart_reply_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view smart reply logs"
ON public.ai_smart_reply_logs
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Service can manage smart reply logs"
ON public.ai_smart_reply_logs
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_ai_smart_reply_logs_workspace_created
  ON public.ai_smart_reply_logs (workspace_id, created_at DESC);
CREATE INDEX idx_ai_smart_reply_logs_conversation
  ON public.ai_smart_reply_logs (conversation_id, created_at DESC);