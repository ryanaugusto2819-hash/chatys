ALTER TABLE public.automation_edges
ADD COLUMN IF NOT EXISTS source_handle text;

COMMENT ON COLUMN public.automation_edges.source_handle IS 'Identifies the originating output handle for branching nodes, such as x or y.';