CREATE TABLE public.knowledge_base_item_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_item_id uuid NOT NULL REFERENCES public.knowledge_base_items(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (knowledge_base_item_id, tag_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base_item_tags TO authenticated;
GRANT ALL ON public.knowledge_base_item_tags TO service_role;

ALTER TABLE public.knowledge_base_item_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view knowledge base item tags"
ON public.knowledge_base_item_tags
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Workspace members can add knowledge base item tags"
ON public.knowledge_base_item_tags
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Workspace members can update knowledge base item tags"
ON public.knowledge_base_item_tags
FOR UPDATE TO authenticated
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Workspace members can delete knowledge base item tags"
ON public.knowledge_base_item_tags
FOR DELETE TO authenticated
USING (public.is_workspace_member(workspace_id));

CREATE INDEX knowledge_base_item_tags_workspace_idx
ON public.knowledge_base_item_tags(workspace_id);

CREATE INDEX knowledge_base_item_tags_tag_idx
ON public.knowledge_base_item_tags(tag_id);

CREATE OR REPLACE FUNCTION public.validate_knowledge_base_item_tag_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item_workspace uuid;
  v_tag_workspace uuid;
BEGIN
  SELECT workspace_id INTO v_item_workspace
  FROM public.knowledge_base_items
  WHERE id = NEW.knowledge_base_item_id;

  SELECT workspace_id INTO v_tag_workspace
  FROM public.tags
  WHERE id = NEW.tag_id;

  IF v_item_workspace IS NULL OR v_tag_workspace IS NULL
     OR v_item_workspace IS DISTINCT FROM NEW.workspace_id
     OR v_tag_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'O conteúdo e a etiqueta devem pertencer ao mesmo espaço de trabalho';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_knowledge_base_item_tag_scope
BEFORE INSERT OR UPDATE ON public.knowledge_base_item_tags
FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_base_item_tag_scope();