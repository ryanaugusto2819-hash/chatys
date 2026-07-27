CREATE TABLE public.warmup_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  connection_config_id uuid NOT NULL REFERENCES public.connection_configs(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  paused_at timestamptz,
  persona_prompt text NOT NULL DEFAULT 'Você é uma pessoa comum respondendo no WhatsApp. Responda de forma curta, natural, informal e humana, como um brasileiro real digitando no celular. Nunca diga que é uma IA.',
  language text NOT NULL DEFAULT 'pt-BR',
  base_daily_target integer NOT NULL DEFAULT 6,
  growth_rate numeric NOT NULL DEFAULT 0.3,
  max_daily integer NOT NULL DEFAULT 60,
  active_hours_start integer NOT NULL DEFAULT 8,
  active_hours_end integer NOT NULL DEFAULT 21,
  min_delay_seconds integer NOT NULL DEFAULT 45,
  max_delay_seconds integer NOT NULL DEFAULT 240,
  messages_sent integer NOT NULL DEFAULT 0,
  messages_received integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_config_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warmup_profiles TO authenticated;
GRANT ALL ON public.warmup_profiles TO service_role;
ALTER TABLE public.warmup_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warmup_profiles_member_access" ON public.warmup_profiles
FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER warmup_profiles_updated_at
BEFORE UPDATE ON public.warmup_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.warmup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warmup_id uuid NOT NULL REFERENCES public.warmup_profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  connection_config_id uuid,
  conversation_id uuid,
  contact_phone text,
  contact_name text,
  direction text NOT NULL DEFAULT 'out',
  content text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.warmup_logs TO authenticated;
GRANT ALL ON public.warmup_logs TO service_role;
ALTER TABLE public.warmup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warmup_logs_member_read" ON public.warmup_logs
FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_warmup_logs_warmup ON public.warmup_logs (warmup_id, created_at DESC);
CREATE INDEX idx_warmup_logs_workspace ON public.warmup_logs (workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_warmup_overview(p_workspace_id uuid)
RETURNS TABLE(
  id uuid,
  connection_config_id uuid,
  connection_label text,
  connection_status text,
  is_active boolean,
  status text,
  started_at timestamptz,
  days_in_warmup integer,
  base_daily_target integer,
  growth_rate numeric,
  max_daily integer,
  daily_target integer,
  active_hours_start integer,
  active_hours_end integer,
  messages_sent bigint,
  messages_received bigint,
  sent_today bigint,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    w.id,
    w.connection_config_id,
    cc.label,
    cc.status,
    w.is_active,
    w.status,
    w.started_at,
    GREATEST(1, (EXTRACT(day FROM (now() - w.started_at))::integer + 1)) AS days_in_warmup,
    w.base_daily_target,
    w.growth_rate,
    w.max_daily,
    LEAST(
      w.max_daily,
      CEIL(w.base_daily_target * POWER(1 + w.growth_rate, GREATEST(0, EXTRACT(day FROM (now() - w.started_at))::integer)))::integer
    ) AS daily_target,
    w.active_hours_start,
    w.active_hours_end,
    (SELECT COUNT(*) FROM warmup_logs l WHERE l.warmup_id = w.id AND l.direction = 'out' AND l.status = 'sent') AS messages_sent,
    (SELECT COUNT(*) FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.connection_config_id = w.connection_config_id
        AND m.sender_type = 'customer'
        AND m.created_at >= w.started_at) AS messages_received,
    (SELECT COUNT(*) FROM warmup_logs l
      WHERE l.warmup_id = w.id AND l.direction = 'out' AND l.status = 'sent'
        AND l.created_at >= date_trunc('day', now())) AS sent_today,
    w.last_activity_at
  FROM warmup_profiles w
  JOIN connection_configs cc ON cc.id = w.connection_config_id
  WHERE (p_workspace_id IS NULL OR w.workspace_id = p_workspace_id)
    AND (public.is_workspace_member(w.workspace_id) OR public.has_role(auth.uid(), 'admin'))
  ORDER BY w.created_at DESC;
$$;