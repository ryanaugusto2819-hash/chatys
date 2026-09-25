CREATE TABLE public.knowledge_base_item_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_item_id uuid NOT NULL REFERENCES public.knowledge_base_items(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL,
  description text NOT NULL DEFAULT '',
  mime_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_base_item_images_item_order_key UNIQUE (knowledge_base_item_id, sort_order),
  CONSTRAINT knowledge_base_item_images_sort_order_check CHECK (sort_order >= 0 AND sort_order < 5),
  CONSTRAINT knowledge_base_item_images_mime_type_check CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base_item_images TO authenticated;
GRANT ALL ON public.knowledge_base_item_images TO service_role;

ALTER TABLE public.knowledge_base_item_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view knowledge images"
ON public.knowledge_base_item_images
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Workspace admins can add knowledge images"
ON public.knowledge_base_item_images
FOR INSERT TO authenticated
WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "Workspace admins can update knowledge images"
ON public.knowledge_base_item_images
FOR UPDATE TO authenticated
USING (public.is_workspace_admin(workspace_id))
WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "Workspace admins can delete knowledge images"
ON public.knowledge_base_item_images
FOR DELETE TO authenticated
USING (public.is_workspace_admin(workspace_id));

CREATE OR REPLACE FUNCTION public.validate_knowledge_base_item_image_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item_workspace uuid;
  v_image_count integer;
BEGIN
  SELECT workspace_id INTO v_item_workspace
  FROM public.knowledge_base_items
  WHERE id = NEW.knowledge_base_item_id;

  IF v_item_workspace IS NULL OR v_item_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'A imagem e o conteúdo devem pertencer ao mesmo espaço de trabalho';
  END IF;

  SELECT count(*) INTO v_image_count
  FROM public.knowledge_base_item_images
  WHERE knowledge_base_item_id = NEW.knowledge_base_item_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_image_count >= 5 THEN
    RAISE EXCEPTION 'Cada conteúdo pode ter no máximo cinco imagens';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_knowledge_base_item_image_scope
BEFORE INSERT OR UPDATE ON public.knowledge_base_item_images
FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_base_item_image_scope();

ALTER TABLE public.ai_smart_reply_logs
ADD COLUMN sent_image_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];