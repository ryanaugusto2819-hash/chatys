-- Add mode column to manager_config and manager_analyses

ALTER TABLE public.manager_config
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'human';

ALTER TABLE public.manager_analyses
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'human';

-- Ensure existing config row is tagged as 'human'
UPDATE public.manager_config
  SET mode = 'human'
  WHERE id = '00000000-0000-0000-0000-000000000001';

-- Insert default configs for the two new modes
INSERT INTO public.manager_config (id, mode, custom_prompt, evaluation_criteria)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'follow_up',     '', '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'flow_selector', '', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Index for fast filtering by mode
CREATE INDEX IF NOT EXISTS idx_manager_analyses_mode ON public.manager_analyses(mode);
