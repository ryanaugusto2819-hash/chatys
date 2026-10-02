CREATE OR REPLACE FUNCTION public.clone_automation_flow(p_flow_id uuid, p_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.automation_flows%ROWTYPE;
  v_new_id uuid;
  v_node record;
  v_edge record;
  v_node_ids jsonb := '{}'::jsonb;
  v_source_node uuid;
  v_target_node uuid;
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL OR NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Selecione um espaço de trabalho ao qual você tem acesso.';
  END IF;

  SELECT * INTO v_source FROM public.automation_flows WHERE id = p_flow_id;
  IF NOT FOUND OR v_source.workspace_id IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Fluxo não encontrado neste espaço de trabalho.';
  END IF;

  INSERT INTO public.automation_flows
    (name, description, is_active, manual_only, niche_id, category, workspace_id, trigger_count, is_pinned_sidebar, pinned_sectors)
  VALUES
    (v_source.name || ' (cópia)', v_source.description, false, v_source.manual_only,
     v_source.niche_id, v_source.category, p_workspace_id, 0, false, '{}'::text[])
  RETURNING id INTO v_new_id;

  FOR v_node IN SELECT * FROM public.automation_nodes WHERE flow_id = p_flow_id ORDER BY sort_order, id LOOP
    v_node_ids := v_node_ids || jsonb_build_object(v_node.id::text, gen_random_uuid()::text);
    INSERT INTO public.automation_nodes
      (id, flow_id, node_type, label, config, position_x, position_y, sort_order)
    VALUES
      ((v_node_ids ->> v_node.id::text)::uuid, v_new_id, v_node.node_type, v_node.label,
       v_node.config, v_node.position_x, v_node.position_y, v_node.sort_order);
  END LOOP;

  FOR v_edge IN SELECT * FROM public.automation_edges WHERE flow_id = p_flow_id ORDER BY created_at, id LOOP
    v_source_node := (v_node_ids ->> v_edge.source_node_id::text)::uuid;
    v_target_node := (v_node_ids ->> v_edge.target_node_id::text)::uuid;
    IF v_source_node IS NULL OR v_target_node IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Há uma conexão sem bloco correspondente no fluxo original.';
    END IF;
    INSERT INTO public.automation_edges
      (flow_id, source_node_id, target_node_id, source_handle)
    VALUES
      (v_new_id, v_source_node, v_target_node, v_edge.source_handle);
  END LOOP;

  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.clone_automation_flow(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_automation_flow(uuid, uuid) TO authenticated;