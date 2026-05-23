
-- 1. Enable RLS on tables that had it disabled
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2. Replace "Allow all" public policies with authenticated-only equivalents
DROP POLICY IF EXISTS "Allow all on agent_assignment_history" ON public.agent_assignment_history;
CREATE POLICY "Authenticated can manage agent_assignment_history"
  ON public.agent_assignment_history FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on flows" ON public.automation_flows;
CREATE POLICY "Authenticated can manage flows"
  ON public.automation_flows FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on nodes" ON public.automation_nodes;
CREATE POLICY "Authenticated can manage nodes"
  ON public.automation_nodes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on edges" ON public.automation_edges;
CREATE POLICY "Authenticated can manage edges"
  ON public.automation_edges FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on contact_tags" ON public.contact_tags;
CREATE POLICY "Authenticated can manage contact_tags"
  ON public.contact_tags FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on knowledge_base_items" ON public.knowledge_base_items;
CREATE POLICY "Authenticated can manage knowledge_base_items"
  ON public.knowledge_base_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on quick_messages" ON public.quick_messages;
CREATE POLICY "Authenticated can manage quick_messages"
  ON public.quick_messages FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sales_orders_all" ON public.sales_orders;
CREATE POLICY "Authenticated can manage sales_orders"
  ON public.sales_orders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. pending_ai_replies: only service role (bypasses RLS); drop public ALL policy
DROP POLICY IF EXISTS "Service can manage pending_ai_replies" ON public.pending_ai_replies;

-- 4. meta_connections: drop the anon ALL policy entirely; keep workspace-scoped ones
DROP POLICY IF EXISTS "Service can manage meta_connections" ON public.meta_connections;

-- 5. connection_configs: remove public SELECT, restrict to authenticated
DROP POLICY IF EXISTS "Public can view connection status" ON public.connection_configs;
CREATE POLICY "Authenticated can view connection_configs"
  ON public.connection_configs FOR SELECT TO authenticated
  USING (true);

-- 6. workspace_invites: drop blanket public token_select; provide SECURITY DEFINER lookup
DROP POLICY IF EXISTS "workspace_invites_token_select" ON public.workspace_invites;

CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token text)
RETURNS TABLE (id uuid, workspace_id uuid, email text, role text, expires_at timestamptz, accepted_at timestamptz, workspace_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at, w.name
  FROM public.workspace_invites i
  LEFT JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = p_token AND i.accepted_at IS NULL
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;

-- 7. Fix function search_path warnings on trigger functions
ALTER FUNCTION public.update_status_since() SET search_path = public;
ALTER FUNCTION public.inherit_workspace_from_connection() SET search_path = public;
ALTER FUNCTION public.inherit_workspace_from_niche() SET search_path = public;
ALTER FUNCTION public.auto_add_liberty_uy() SET search_path = public;
ALTER FUNCTION public.handle_new_user_workspace() SET search_path = public;

-- 8. Storage: prevent listing of public buckets (files still reachable by direct URL)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
