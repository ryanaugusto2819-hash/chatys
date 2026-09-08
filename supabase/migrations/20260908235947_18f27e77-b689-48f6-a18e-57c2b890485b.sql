ALTER TABLE public.manager_analyses
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'human';

CREATE INDEX IF NOT EXISTS idx_manager_analyses_mode ON public.manager_analyses(mode);

CREATE OR REPLACE FUNCTION public.get_messages_by_connection(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(connection_config_id uuid, total bigint, incoming bigint, outgoing bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.connection_config_id,
         count(*)::bigint AS total,
         count(*) FILTER (WHERE m.sender_type = 'customer')::bigint AS incoming,
         count(*) FILTER (WHERE m.sender_type <> 'customer')::bigint AS outgoing
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.created_at >= p_from
    AND m.created_at <= p_to
    AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id))
  GROUP BY c.connection_config_id
$$;

GRANT EXECUTE ON FUNCTION public.get_messages_by_connection(timestamptz, timestamptz) TO authenticated;