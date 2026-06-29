
CREATE OR REPLACE FUNCTION public.shares_workspace_with(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members me
    JOIN workspace_members them ON them.workspace_id = me.workspace_id
    WHERE me.user_id = _a AND them.user_id = _b
  );
$$;

DROP POLICY IF EXISTS "Users view own and workspace-shared profiles" ON public.profiles;
CREATE POLICY "Users view own and workspace-shared profiles"
ON public.profiles FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.shares_workspace_with(auth.uid(), user_id)
);
