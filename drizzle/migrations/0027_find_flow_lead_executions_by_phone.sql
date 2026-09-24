CREATE OR REPLACE FUNCTION public.find_flow_lead_executions_by_phone(
  p_flow_id uuid,
  p_phone text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  execution_id uuid,
  conversation_id uuid,
  contact_name text,
  contact_phone text,
  status text,
  failed_at_node_id uuid,
  waiting_node_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  waiting_since timestamptz,
  wait_timeout_at timestamptz,
  completed_nodes integer,
  total_nodes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fe.id,
    fe.conversation_id,
    c.contact_name,
    c.contact_phone,
    fe.status,
    fe.failed_at_node_id,
    fe.waiting_node_id,
    fe.started_at,
    fe.completed_at,
    fe.waiting_since,
    fe.wait_timeout_at,
    fe.completed_nodes,
    fe.total_nodes
  FROM public.flow_executions fe
  JOIN public.automation_flows af ON af.id = fe.flow_id
  JOIN public.conversations c ON c.id = fe.conversation_id
  WHERE fe.flow_id = p_flow_id
    AND af.workspace_id IS NOT NULL
    AND public.is_workspace_member(af.workspace_id)
    AND c.workspace_id = af.workspace_id
    AND c.contact_phone NOT LIKE '%-group'
    AND regexp_replace(c.contact_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
    AND regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') <> ''
  ORDER BY fe.started_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.find_flow_lead_executions_by_phone(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_flow_lead_executions_by_phone(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_flow_lead_executions_by_phone(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_flow_lead_executions_by_phone(uuid, text, integer) TO service_role;