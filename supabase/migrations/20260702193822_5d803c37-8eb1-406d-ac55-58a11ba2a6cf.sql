ALTER TABLE public.quick_messages ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.quick_messages ADD COLUMN IF NOT EXISTS is_pinned_sidebar boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_quick_messages_pinned ON public.quick_messages (workspace_id, is_pinned_sidebar) WHERE is_pinned_sidebar = true;