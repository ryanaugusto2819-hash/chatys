CREATE OR REPLACE FUNCTION public.claim_waiting_flow(
  p_conversation_id uuid,
  p_reason text,
  p_execution_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(execution_id uuid, flow_id uuid, conversation_id uuid, resume_node_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claimed public.flow_executions%ROWTYPE;
BEGIN
  IF p_reason NOT IN ('response', 'timeout') THEN
    RAISE EXCEPTION 'Invalid resume reason';
  END IF;

  SELECT fe.* INTO claimed
  FROM public.flow_executions AS fe
  WHERE fe.conversation_id = p_conversation_id
    AND fe.status = 'waiting_for_response'
    AND (p_execution_id IS NULL OR fe.id = p_execution_id)
    AND (p_reason = 'response' OR fe.wait_timeout_at <= now())
  ORDER BY fe.waiting_since DESC NULLS LAST
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.flow_executions AS older
  SET status = 'superseded', completed_at = now(), resume_reason = 'superseded'
  WHERE older.conversation_id = p_conversation_id
    AND older.status = 'waiting_for_response'
    AND older.id <> claimed.id;

  UPDATE public.flow_executions AS selected_execution
  SET status = 'running', resumed_at = now(), resume_reason = p_reason
  WHERE selected_execution.id = claimed.id;

  RETURN QUERY SELECT claimed.id, claimed.flow_id, claimed.conversation_id,
    CASE WHEN p_reason = 'response' THEN claimed.response_resume_node_id ELSE claimed.timeout_resume_node_id END;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_waiting_flow(uuid, text, uuid) TO service_role;