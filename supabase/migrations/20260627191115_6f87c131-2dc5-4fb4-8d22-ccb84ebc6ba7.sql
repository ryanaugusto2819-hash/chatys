ALTER TABLE public.automation_flows ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_automation_flows_category ON public.automation_flows(category);