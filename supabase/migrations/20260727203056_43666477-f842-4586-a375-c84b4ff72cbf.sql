CREATE OR REPLACE FUNCTION public.get_unread_conversations_count(p_workspace_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int
  FROM conversations c
  WHERE (p_workspace_id IS NULL OR c.workspace_id = p_workspace_id)
    AND c.contact_phone NOT LIKE '%-group'
    AND (
      c.connection_config_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM warmup_profiles wp WHERE wp.connection_config_id = c.connection_config_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id AND m.sender_type = 'customer' AND m.status <> 'read'
    );
$function$;