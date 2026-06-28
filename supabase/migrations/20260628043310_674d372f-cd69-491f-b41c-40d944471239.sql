
-- =========================
-- TAGS, CONTACT_TAGS, QUICK_MESSAGES: add workspace_id
-- =========================
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE public.tags SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.tags ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.tags ALTER COLUMN workspace_id SET DEFAULT '10000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS tags_workspace_id_idx ON public.tags(workspace_id);

ALTER TABLE public.contact_tags ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE public.contact_tags ct
  SET workspace_id = t.workspace_id
  FROM public.tags t
  WHERE ct.tag_id = t.id AND ct.workspace_id IS NULL;
UPDATE public.contact_tags SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.contact_tags ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.contact_tags ALTER COLUMN workspace_id SET DEFAULT '10000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS contact_tags_workspace_id_idx ON public.contact_tags(workspace_id);

ALTER TABLE public.quick_messages ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE public.quick_messages SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE public.quick_messages ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.quick_messages ALTER COLUMN workspace_id SET DEFAULT '10000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS quick_messages_workspace_id_idx ON public.quick_messages(workspace_id);

-- =========================
-- POLICIES
-- =========================

-- agent_assignment_history
DROP POLICY IF EXISTS "Authenticated can manage agent_assignment_history" ON public.agent_assignment_history;
CREATE POLICY "Workspace members can read agent_assignment_history"
  ON public.agent_assignment_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_workspace_member(c.workspace_id)));
CREATE POLICY "Workspace members can manage agent_assignment_history"
  ON public.agent_assignment_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_workspace_member(c.workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND public.is_workspace_member(c.workspace_id)));

-- automation_flows
DROP POLICY IF EXISTS "Authenticated can manage flows" ON public.automation_flows;
CREATE POLICY "Workspace members can manage automation_flows"
  ON public.automation_flows FOR ALL TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  WITH CHECK (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

-- automation_nodes
DROP POLICY IF EXISTS "Authenticated can manage nodes" ON public.automation_nodes;
CREATE POLICY "Workspace members can manage automation_nodes"
  ON public.automation_nodes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))));

-- automation_edges
DROP POLICY IF EXISTS "Authenticated can manage edges" ON public.automation_edges;
CREATE POLICY "Workspace members can manage automation_edges"
  ON public.automation_edges FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))));

-- flow_executions
DROP POLICY IF EXISTS "Authenticated users can view flow executions" ON public.flow_executions;
CREATE POLICY "Workspace members can view flow_executions"
  ON public.flow_executions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.automation_flows f WHERE f.id = flow_id AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))));

-- flow_step_logs
DROP POLICY IF EXISTS "Authenticated users can view step logs" ON public.flow_step_logs;
CREATE POLICY "Workspace members can view flow_step_logs"
  ON public.flow_step_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.flow_executions e
    JOIN public.automation_flows f ON f.id = e.flow_id
    WHERE e.id = execution_id AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))
  ));

-- follow_up_templates
DROP POLICY IF EXISTS "Authenticated can view follow_up_templates" ON public.follow_up_templates;
CREATE POLICY "Workspace members can view follow_up_templates"
  ON public.follow_up_templates FOR SELECT TO authenticated
  USING (niche_id IS NULL OR EXISTS (SELECT 1 FROM public.niches n WHERE n.id = niche_id AND public.is_workspace_member(n.workspace_id)));

-- knowledge_base_items
DROP POLICY IF EXISTS "Authenticated can manage knowledge_base_items" ON public.knowledge_base_items;
CREATE POLICY "Workspace members can manage knowledge_base_items"
  ON public.knowledge_base_items FOR ALL TO authenticated
  USING (niche_id IS NULL OR EXISTS (SELECT 1 FROM public.niches n WHERE n.id = niche_id AND public.is_workspace_member(n.workspace_id)))
  WITH CHECK (niche_id IS NULL OR EXISTS (SELECT 1 FROM public.niches n WHERE n.id = niche_id AND public.is_workspace_member(n.workspace_id)));

-- manager_config
DROP POLICY IF EXISTS "Authenticated can view manager config" ON public.manager_config;
CREATE POLICY "Workspace members can view manager_config"
  ON public.manager_config FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

-- niche_funnel_stages
DROP POLICY IF EXISTS "Authenticated can view niche_funnel_stages" ON public.niche_funnel_stages;
CREATE POLICY "Workspace members can view niche_funnel_stages"
  ON public.niche_funnel_stages FOR SELECT TO authenticated
  USING (niche_id IS NULL OR EXISTS (SELECT 1 FROM public.niches n WHERE n.id = niche_id AND public.is_workspace_member(n.workspace_id)));

-- niches
DROP POLICY IF EXISTS "Authenticated users can view niches" ON public.niches;
CREATE POLICY "Workspace members can view niches"
  ON public.niches FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

-- sales_orders
DROP POLICY IF EXISTS "Authenticated can manage sales_orders" ON public.sales_orders;
CREATE POLICY "Workspace members can manage sales_orders"
  ON public.sales_orders FOR ALL TO authenticated
  USING (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  WITH CHECK (workspace_id IS NULL OR public.is_workspace_member(workspace_id));

-- tags
DROP POLICY IF EXISTS "Authenticated can manage tags" ON public.tags;
CREATE POLICY "Workspace members can manage tags"
  ON public.tags FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- contact_tags
DROP POLICY IF EXISTS "Authenticated can manage contact_tags" ON public.contact_tags;
CREATE POLICY "Workspace members can manage contact_tags"
  ON public.contact_tags FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- quick_messages
DROP POLICY IF EXISTS "Authenticated can manage quick_messages" ON public.quick_messages;
CREATE POLICY "Workspace members can manage quick_messages"
  ON public.quick_messages FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- workspace_invites: restrict SELECT of tokens to the inviter
DROP POLICY IF EXISTS "workspace_invites_admin_manage" ON public.workspace_invites;
CREATE POLICY "workspace_invites_admin_write"
  ON public.workspace_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id) AND invited_by = auth.uid());
CREATE POLICY "workspace_invites_admin_update"
  ON public.workspace_invites FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
CREATE POLICY "workspace_invites_admin_delete"
  ON public.workspace_invites FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id));
CREATE POLICY "workspace_invites_inviter_select"
  ON public.workspace_invites FOR SELECT TO authenticated
  USING (invited_by = auth.uid() AND public.is_workspace_admin(workspace_id));

-- =========================
-- STORAGE: ownership checks
-- =========================

-- automation-media: enforce ownership on delete; require auth on upload (store owner)
DROP POLICY IF EXISTS "Authenticated users can delete their media" ON storage.objects;
CREATE POLICY "Owners can delete automation-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'automation-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated can upload automation-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'automation-media' AND owner = auth.uid());

-- chat-media: require auth + ownership on insert, owner-only delete
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;
CREATE POLICY "Authenticated can upload chat-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND owner = auth.uid());

CREATE POLICY "Owners can delete chat-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid());
