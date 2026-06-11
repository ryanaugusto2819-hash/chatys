
-- ai_configs: restrict member SELECT to admins (contains openai_api_key)
DROP POLICY IF EXISTS "ai_configs_member_select" ON public.ai_configs;
CREATE POLICY "ai_configs_admin_select" ON public.ai_configs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = ai_configs.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = 'admin'));

-- conversion_events: drop open policies, scope by workspace via conversation
DROP POLICY IF EXISTS "Service can manage conversion_events" ON public.conversion_events;
DROP POLICY IF EXISTS "Authenticated can view conversion_events" ON public.conversion_events;
CREATE POLICY "Workspace members can view conversion_events" ON public.conversion_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = conversion_events.conversation_id AND wm.user_id = auth.uid()
  ));
CREATE POLICY "Workspace admins can manage conversion_events" ON public.conversion_events
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = conversion_events.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = conversion_events.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ));

-- conversion_leads
DROP POLICY IF EXISTS "Service can manage conversion_leads" ON public.conversion_leads;
DROP POLICY IF EXISTS "Authenticated can view conversion_leads" ON public.conversion_leads;
CREATE POLICY "Workspace members can view conversion_leads" ON public.conversion_leads
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = conversion_leads.conversation_id AND wm.user_id = auth.uid()
  ));
CREATE POLICY "Workspace admins can manage conversion_leads" ON public.conversion_leads
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = conversion_leads.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = conversion_leads.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ));

-- follow_up_executions
DROP POLICY IF EXISTS "Service can manage follow_up_executions" ON public.follow_up_executions;
DROP POLICY IF EXISTS "Authenticated can view follow_up_executions" ON public.follow_up_executions;
CREATE POLICY "Workspace members can view follow_up_executions" ON public.follow_up_executions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = follow_up_executions.conversation_id AND wm.user_id = auth.uid()
  ));
CREATE POLICY "Workspace admins can manage follow_up_executions" ON public.follow_up_executions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = follow_up_executions.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = follow_up_executions.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ));

-- manager_analyses: drop public-role open policy (service role bypasses RLS)
DROP POLICY IF EXISTS "Service can insert analyses" ON public.manager_analyses;

-- meta_capi_config: drop overly broad SELECT (admin ALL policy remains)
DROP POLICY IF EXISTS "Authenticated can view meta_capi_config" ON public.meta_capi_config;

-- orders: drop public manage; scope to workspace via conversation
DROP POLICY IF EXISTS "Service can manage orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated can view orders" ON public.orders;
CREATE POLICY "Workspace members can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = orders.conversation_id AND wm.user_id = auth.uid()
  ));
CREATE POLICY "Workspace admins can manage orders" ON public.orders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = orders.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE c.id = orders.conversation_id
      AND wm.user_id = auth.uid() AND wm.role = 'admin'
  ));

-- tags: restrict from public to authenticated
DROP POLICY IF EXISTS "Allow all on tags" ON public.tags;
CREATE POLICY "Authenticated can manage tags" ON public.tags
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- webhook_flow_mappings: drop anon read
DROP POLICY IF EXISTS "Service can read webhook_flow_mappings" ON public.webhook_flow_mappings;

-- webhook_logs: drop anon insert
DROP POLICY IF EXISTS "Service can insert webhook_logs" ON public.webhook_logs;

-- Revoke anon grants where appropriate
REVOKE ALL ON public.tags FROM anon;
REVOKE ALL ON public.webhook_flow_mappings FROM anon;
REVOKE ALL ON public.webhook_logs FROM anon;
REVOKE ALL ON public.conversion_events FROM anon;
REVOKE ALL ON public.conversion_leads FROM anon;
REVOKE ALL ON public.follow_up_executions FROM anon;
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.manager_analyses FROM anon;
