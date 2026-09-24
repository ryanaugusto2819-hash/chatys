CREATE OR REPLACE FUNCTION public.save_automation_flow_atomic(
  p_flow_id uuid,
  p_name text,
  p_description text,
  p_manual_only boolean,
  p_niche_id uuid,
  p_nodes jsonb,
  p_edges jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_node_count integer;
  v_edge_count integer;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.automation_flows
  WHERE id = p_flow_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Fluxo não encontrado.';
  END IF;
  IF v_workspace_id IS NULL OR NOT public.is_workspace_member(v_workspace_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem permissão para salvar este fluxo.';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O fluxo precisa de um nome.';
  END IF;
  IF jsonb_typeof(p_nodes) <> 'array' OR jsonb_typeof(p_edges) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Os blocos ou conexões enviados são inválidos.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_edges) AS edge(source_node_id uuid, target_node_id uuid)
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_nodes) AS node(id uuid) WHERE node.id = edge.source_node_id)
       OR NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(p_nodes) AS node(id uuid) WHERE node.id = edge.target_node_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Existe uma conexão apontando para um bloco que não está mais no fluxo.';
  END IF;

  UPDATE public.automation_flows
  SET name = btrim(p_name), description = COALESCE(p_description, ''),
      manual_only = COALESCE(p_manual_only, false), niche_id = p_niche_id
  WHERE id = p_flow_id;

  INSERT INTO public.automation_nodes (id, flow_id, node_type, label, config, position_x, position_y, sort_order)
  SELECT node.id, p_flow_id, node.node_type, COALESCE(node.label, ''), COALESCE(node.config, '{}'::jsonb),
         node.position_x, node.position_y, node.sort_order
  FROM jsonb_to_recordset(p_nodes) AS node(
    id uuid, node_type text, label text, config jsonb,
    position_x double precision, position_y double precision, sort_order integer
  )
  ON CONFLICT (id) DO UPDATE SET
    flow_id = EXCLUDED.flow_id,
    node_type = EXCLUDED.node_type,
    label = EXCLUDED.label,
    config = EXCLUDED.config,
    position_x = EXCLUDED.position_x,
    position_y = EXCLUDED.position_y,
    sort_order = EXCLUDED.sort_order;
  GET DIAGNOSTICS v_node_count = ROW_COUNT;

  DELETE FROM public.automation_edges WHERE flow_id = p_flow_id;

  DELETE FROM public.automation_nodes existing
  WHERE existing.flow_id = p_flow_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_nodes) AS incoming(id uuid)
      WHERE incoming.id = existing.id
    );

  INSERT INTO public.automation_edges (id, flow_id, source_node_id, target_node_id, source_handle)
  SELECT edge.id, p_flow_id, edge.source_node_id, edge.target_node_id, NULLIF(btrim(edge.source_handle), '')
  FROM jsonb_to_recordset(p_edges) AS edge(
    id uuid, source_node_id uuid, target_node_id uuid, source_handle text
  );
  GET DIAGNOSTICS v_edge_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'node_count', v_node_count, 'edge_count', v_edge_count);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Existem blocos ou conexões duplicados no fluxo.';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Uma conexão aponta para um bloco inválido.';
END;
$$;

REVOKE ALL ON FUNCTION public.save_automation_flow_atomic(uuid, text, text, boolean, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_automation_flow_atomic(uuid, text, text, boolean, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_automation_flow_atomic(uuid, text, text, boolean, uuid, jsonb, jsonb) TO service_role;