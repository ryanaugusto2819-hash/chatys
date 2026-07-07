CREATE INDEX IF NOT EXISTS idx_messages_unread_customer_conversation_fast
ON public.messages (conversation_id)
WHERE sender_type = 'customer' AND status <> 'read';

CREATE OR REPLACE FUNCTION public.get_unread_conversations_count(p_workspace_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM public.conversations c
  WHERE c.contact_phone NOT LIKE '%-group'
    AND (p_workspace_id IS NULL OR c.workspace_id = p_workspace_id)
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.conversation_id = c.id
        AND m.sender_type = 'customer'
        AND m.status <> 'read'
      LIMIT 1
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) TO service_role;