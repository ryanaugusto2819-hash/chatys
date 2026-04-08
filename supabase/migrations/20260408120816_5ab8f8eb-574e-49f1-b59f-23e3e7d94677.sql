
ALTER TABLE public.manager_config ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'human';

UPDATE public.manager_config SET mode = 'human' WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.manager_config (id, mode, custom_prompt, evaluation_criteria)
VALUES 
  ('00000000-0000-0000-0000-000000000002', 'follow_up', '', '[]'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'flow_selector', '', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;
