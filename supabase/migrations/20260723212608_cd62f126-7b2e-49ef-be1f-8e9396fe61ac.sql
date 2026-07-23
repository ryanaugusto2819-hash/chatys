CREATE TABLE public.ads_link_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url_template TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ads_link_templates_workspace ON public.ads_link_templates(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_link_templates TO authenticated;
GRANT ALL ON public.ads_link_templates TO service_role;
ALTER TABLE public.ads_link_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view templates" ON public.ads_link_templates FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can insert templates" ON public.ads_link_templates FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can update templates" ON public.ads_link_templates FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members can delete templates" ON public.ads_link_templates FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE TRIGGER update_ads_link_templates_updated_at BEFORE UPDATE ON public.ads_link_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();