ALTER TABLE public.warmup_profiles
  ADD COLUMN IF NOT EXISTS behavior_style text NOT NULL DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS extra_instructions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reply_length text NOT NULL DEFAULT 'curto',
  ADD COLUMN IF NOT EXISTS emoji_usage text NOT NULL DEFAULT 'raro';