CREATE INDEX IF NOT EXISTS idx_messages_unread_customer_conversation
ON public.messages (conversation_id)
WHERE sender_type = 'customer' AND status IS DISTINCT FROM 'read';

CREATE INDEX IF NOT EXISTS idx_messages_sender_created_at
ON public.messages (sender_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_not_group
ON public.conversations (workspace_id, id)
WHERE contact_phone NOT LIKE '%-group';

CREATE INDEX IF NOT EXISTS idx_conversations_phone_connection_created
ON public.conversations (contact_phone, connection_config_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_executions_conversation_created
ON public.flow_executions (conversation_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.get_unread_conversations_count(p_workspace_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(DISTINCT c.id)::integer
  FROM public.conversations c
  JOIN public.messages m ON m.conversation_id = c.id
  WHERE c.contact_phone NOT LIKE '%-group'
    AND (p_workspace_id IS NULL OR c.workspace_id = p_workspace_id)
    AND m.sender_type = 'customer'
    AND m.status IS DISTINCT FROM 'read'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_current_user_meta()
RETURNS TABLE(is_approved boolean, role public.app_role, is_platform_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(p.is_approved, false) AS is_approved,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin') THEN 'admin'::public.app_role
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'supervisor') THEN 'supervisor'::public.app_role
      ELSE 'agent'::public.app_role
    END AS role,
    COALESCE(p.is_platform_admin, false) AS is_platform_admin
  FROM (SELECT auth.uid() AS user_id) u
  LEFT JOIN public.profiles p ON p.user_id = u.user_id
  WHERE u.user_id IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_user_meta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_meta() TO service_role;