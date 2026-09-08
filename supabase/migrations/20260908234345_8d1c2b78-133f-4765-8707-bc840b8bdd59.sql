CREATE OR REPLACE FUNCTION public.delete_connection_conversations_batch(p_connection_id uuid, p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
  v_count integer;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM conversations WHERE connection_config_id = p_connection_id LIMIT p_limit
  ) s;

  IF v_ids IS NULL THEN RETURN 0; END IF;

  DELETE FROM flow_step_logs WHERE execution_id IN (SELECT id FROM flow_executions WHERE conversation_id = ANY(v_ids));
  DELETE FROM flow_executions WHERE conversation_id = ANY(v_ids);
  DELETE FROM messages WHERE conversation_id = ANY(v_ids);
  DELETE FROM agent_assignment_history WHERE conversation_id = ANY(v_ids);
  DELETE FROM follow_up_executions WHERE conversation_id = ANY(v_ids);
  DELETE FROM manager_analyses WHERE conversation_id = ANY(v_ids);
  DELETE FROM ai_usage_logs WHERE conversation_id = ANY(v_ids);
  DELETE FROM conversion_events WHERE conversation_id = ANY(v_ids);
  DELETE FROM conversion_leads WHERE conversation_id = ANY(v_ids);
  DELETE FROM orders WHERE conversation_id = ANY(v_ids);
  DELETE FROM pending_ai_replies WHERE conversation_id = ANY(v_ids);
  DELETE FROM sales_orders WHERE conversation_id = ANY(v_ids);
  DELETE FROM webhook_logs WHERE conversation_id = ANY(v_ids);
  DELETE FROM extension_commands WHERE conversation_id = ANY(v_ids);
  DELETE FROM conversations WHERE id = ANY(v_ids);

  v_count := array_length(v_ids, 1);
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_connection_conversations_batch(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_connection_conversations_batch(uuid, integer) TO service_role;