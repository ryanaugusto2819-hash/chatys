
DROP POLICY IF EXISTS "Service role can insert ai usage logs" ON public.ai_usage_logs;
CREATE POLICY "Service role can insert ai usage logs" ON public.ai_usage_logs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service can insert flow executions" ON public.flow_executions;
DROP POLICY IF EXISTS "Service can update flow executions" ON public.flow_executions;
CREATE POLICY "Service can insert flow executions" ON public.flow_executions
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service can update flow executions" ON public.flow_executions
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service can insert step logs" ON public.flow_step_logs;
CREATE POLICY "Service can insert step logs" ON public.flow_step_logs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view niche_connections" ON public.niche_connections;
CREATE POLICY "Workspace members can view niche_connections" ON public.niche_connections
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.niches n
      WHERE n.id = niche_connections.niche_id
        AND (n.workspace_id IS NULL OR public.is_workspace_member(n.workspace_id))
    )
  );

DROP POLICY IF EXISTS "Authenticated can view webhook_flow_mappings" ON public.webhook_flow_mappings;
CREATE POLICY "Workspace members can view webhook_flow_mappings" ON public.webhook_flow_mappings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.automation_flows f
      WHERE f.id = webhook_flow_mappings.flow_id
        AND (f.workspace_id IS NULL OR public.is_workspace_member(f.workspace_id))
    )
  );

DROP POLICY IF EXISTS "Authenticated can upload chat-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload automation-media" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload follow-up images" ON storage.objects;

CREATE POLICY "Workspace members can upload chat-media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media' AND owner = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can upload automation-media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'automation-media' AND owner = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can upload follow-up images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'follow-up-images' AND owner = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Public read access for chat media" ON storage.objects;
CREATE POLICY "Workspace members can read chat-media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE m.media_url LIKE '%' || storage.objects.name
          AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id))
      )
    )
  );
