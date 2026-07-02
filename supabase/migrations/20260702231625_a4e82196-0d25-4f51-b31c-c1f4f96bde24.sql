
ALTER TABLE public.automation_flows ADD COLUMN IF NOT EXISTS pinned_sectors text[] NOT NULL DEFAULT '{}';
-- Backfill: existing pinned flows default to comercial
UPDATE public.automation_flows
   SET pinned_sectors = ARRAY['comercial']::text[]
 WHERE is_pinned_sidebar = true
   AND (pinned_sectors IS NULL OR array_length(pinned_sectors, 1) IS NULL);
