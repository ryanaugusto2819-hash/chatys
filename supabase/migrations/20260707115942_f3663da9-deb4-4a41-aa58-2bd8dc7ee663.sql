
DROP POLICY IF EXISTS "Workspace members can view connection_configs" ON public.connection_configs;
CREATE POLICY "Workspace admins can view connection_configs"
ON public.connection_configs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (workspace_id IS NOT NULL AND is_workspace_admin(workspace_id))
);

DROP POLICY IF EXISTS "Workspace members can view meta_connections" ON public.meta_connections;
CREATE POLICY "Workspace admins can view meta_connections"
ON public.meta_connections
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_workspace_admin(workspace_id)
);
