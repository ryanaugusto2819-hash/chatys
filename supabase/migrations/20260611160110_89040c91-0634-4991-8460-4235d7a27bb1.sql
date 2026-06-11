
-- 1) profiles: prevent self-escalation of is_platform_admin / is_approved
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
      RAISE EXCEPTION 'Cannot modify is_platform_admin on your own profile';
    END IF;
    IF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'Cannot modify is_approved on your own profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_self_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- 2) connection_configs: restrict SELECT to workspace members
DROP POLICY IF EXISTS "Authenticated can view connection_configs" ON public.connection_configs;
CREATE POLICY "Workspace members can view connection_configs"
  ON public.connection_configs FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = connection_configs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- 3) conversations: scope SELECT and UPDATE to workspace members
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON public.conversations;
CREATE POLICY "Workspace members can view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
CREATE POLICY "Workspace members can update conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (
    workspace_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = conversations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- 4) messages: scope by parent conversation workspace
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can update messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can delete messages" ON public.messages;
CREATE POLICY "Workspace members can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id
        AND (c.workspace_id IS NULL OR wm.user_id = auth.uid())
    )
  );
CREATE POLICY "Workspace members can update messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id
        AND (c.workspace_id IS NULL OR wm.user_id = auth.uid())
    )
  );
CREATE POLICY "Workspace members can delete messages"
  ON public.messages FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = messages.conversation_id
        AND (c.workspace_id IS NULL OR wm.user_id = auth.uid())
    )
  );

-- 5) webhook_logs: restrict SELECT to admins only (drop open policy)
DROP POLICY IF EXISTS "Authenticated can view webhook_logs" ON public.webhook_logs;

-- 6) user_roles: restrict SELECT to own roles or admins
DROP POLICY IF EXISTS "Roles viewable by authenticated users" ON public.user_roles;
CREATE POLICY "Users view own roles or admins view all"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
