
CREATE TABLE public.activity_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  actions_count INTEGER NOT NULL DEFAULT 0,
  route TEXT,
  workspace_id UUID,
  UNIQUE (user_id, session_id)
);

CREATE INDEX idx_activity_sessions_user_last ON public.activity_sessions(user_id, last_seen DESC);
CREATE INDEX idx_activity_sessions_ip ON public.activity_sessions(ip);
CREATE INDEX idx_activity_sessions_last_seen ON public.activity_sessions(last_seen DESC);

GRANT SELECT ON public.activity_sessions TO authenticated;
GRANT ALL ON public.activity_sessions TO service_role;

ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own activity" ON public.activity_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
