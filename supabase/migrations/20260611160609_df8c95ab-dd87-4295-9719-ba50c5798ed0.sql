CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO service_role;

DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_admin_write" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_platform_admin" ON public.workspace_members;

CREATE POLICY "workspace_members_select"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "workspace_members_admin_write"
ON public.workspace_members
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_workspace_admin(workspace_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "workspace_members_platform_admin"
ON public.workspace_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_platform_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.is_platform_admin = true
  )
);

DROP POLICY IF EXISTS "Workspace members can view connection_configs" ON public.connection_configs;
CREATE POLICY "Workspace members can view connection_configs"
ON public.connection_configs
FOR SELECT
TO authenticated
USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Workspace members can view conversations" ON public.conversations;
CREATE POLICY "Workspace members can view conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Workspace members can update conversations" ON public.conversations;
CREATE POLICY "Workspace members can update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (workspace_id IS NULL OR public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Workspace members can view messages" ON public.messages;
CREATE POLICY "Workspace members can view messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "Workspace members can update messages" ON public.messages;
CREATE POLICY "Workspace members can update messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id) OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "Workspace members can delete messages" ON public.messages;
CREATE POLICY "Workspace members can delete messages"
ON public.messages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id) OR public.has_role(auth.uid(), 'admin'))
  )
);