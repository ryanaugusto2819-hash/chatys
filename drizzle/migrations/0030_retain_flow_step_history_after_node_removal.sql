ALTER TABLE public.flow_step_logs
  DROP CONSTRAINT flow_step_logs_node_id_fkey;

COMMENT ON COLUMN public.flow_step_logs.node_id IS
  'Historical node identifier intentionally retained after a flow node is edited or removed.';

ALTER TABLE public.ai_smart_reply_logs
  DROP CONSTRAINT ai_smart_reply_logs_node_id_fkey;

COMMENT ON COLUMN public.ai_smart_reply_logs.node_id IS
  'Historical node identifier intentionally retained after a flow node is edited or removed.';