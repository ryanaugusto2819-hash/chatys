-- ================================================================
-- SAAS MULTI-TENANT: Base do sistema comercial
-- Cada usuário tem seu próprio workspace isolado
-- ================================================================

-- ── 1. Adicionar colunas ao workspaces existente ────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS slug         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'active'
                                        CHECK (status IN ('active', 'suspended', 'cancelled')),
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS logo_url     TEXT,
  ADD COLUMN IF NOT EXISTS plan_id      UUID; -- FK adicionado após criar tabela plans

-- Gerar slugs para workspaces existentes
UPDATE workspaces SET slug = 'brasil'  WHERE id = '10000000-0000-0000-0000-000000000001' AND slug IS NULL;
UPDATE workspaces SET slug = 'uruguay' WHERE id = '10000000-0000-0000-0000-000000000002' AND slug IS NULL;

-- ── 2. Tabela de planos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,           -- 'Starter', 'Pro', 'Enterprise'
  slug                  TEXT        NOT NULL UNIQUE,    -- 'starter', 'pro', 'enterprise'
  price_monthly         NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_connections       INTEGER     NOT NULL DEFAULT 1,
  max_flows             INTEGER     NOT NULL DEFAULT 5,
  max_members           INTEGER     NOT NULL DEFAULT 3,
  allow_ai_auto_reply   BOOLEAN     NOT NULL DEFAULT false,
  allow_ai_manager      BOOLEAN     NOT NULL DEFAULT false,
  allow_advanced_reports BOOLEAN    NOT NULL DEFAULT false,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Planos padrão
INSERT INTO plans (id, name, slug, price_monthly, max_connections, max_flows, max_members, allow_ai_auto_reply, allow_ai_manager, allow_advanced_reports) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Starter',    'starter',    0,      1,  5,  3,  false, false, false),
  ('00000000-0000-0000-0000-000000000020', 'Pro',         'pro',        97,     5,  30, 15, true,  true,  true),
  ('00000000-0000-0000-0000-000000000030', 'Enterprise',  'enterprise', 297,    -1, -1, -1, true,  true,  true)
ON CONFLICT (id) DO NOTHING;

-- FK plan_id em workspaces
ALTER TABLE workspaces
  ADD CONSTRAINT fk_workspace_plan FOREIGN KEY (plan_id) REFERENCES plans(id);

-- Workspaces existentes ficam no plano Enterprise (legado)
UPDATE workspaces SET plan_id = '00000000-0000-0000-0000-000000000030'
WHERE plan_id IS NULL;

-- ── 3. Assinaturas de workspace ─────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id         UUID        NOT NULL REFERENCES plans(id),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  trial_ends_at   TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id)
);

-- ── 4. Configurações de IA por workspace ────────────────────────
CREATE TABLE IF NOT EXISTS ai_configs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  openai_api_key      TEXT,                      -- chave API OpenAI do cliente
  model               TEXT        NOT NULL DEFAULT 'gpt-4o-mini',
  temperature         NUMERIC(3,2) NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens          INTEGER     NOT NULL DEFAULT 1000,
  system_prompt       TEXT,                      -- prompt de sistema customizado
  auto_reply_enabled  BOOLEAN     NOT NULL DEFAULT false,
  manager_enabled     BOOLEAN     NOT NULL DEFAULT false,
  follow_up_enabled   BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Configurações gerais do workspace ────────────────────────
CREATE TABLE IF NOT EXISTS workspace_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  timezone          TEXT        NOT NULL DEFAULT 'America/Sao_Paulo',
  language          TEXT        NOT NULL DEFAULT 'pt-BR',
  business_hours_start TIME     DEFAULT '08:00',
  business_hours_end   TIME     DEFAULT '18:00',
  business_days     INTEGER[]   DEFAULT ARRAY[1,2,3,4,5], -- 0=Dom, 1=Seg...6=Sáb
  notification_email TEXT,
  webhook_url       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Convites de workspace ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_by      UUID        NOT NULL REFERENCES auth.users(id),
  email           TEXT        NOT NULL,
  role            TEXT        NOT NULL DEFAULT 'agent'
                              CHECK (role IN ('admin', 'supervisor', 'agent')),
  token           TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);

-- ── 7. Adicionar is_platform_admin ao profiles ─────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- ── 8. Adicionar workspace_id ao manager_config ────────────────
ALTER TABLE manager_config
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

-- Configs existentes apontam para workspace Brasil (legado)
UPDATE manager_config SET workspace_id = '10000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;

-- ── 9. RLS nas novas tabelas ────────────────────────────────────
ALTER TABLE plans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites       ENABLE ROW LEVEL SECURITY;

-- plans: visível para todos autenticados
CREATE POLICY "plans_select_authenticated"
  ON plans FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- workspace_subscriptions: visível para membros do workspace
CREATE POLICY "workspace_subscriptions_member_select"
  ON workspace_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_subscriptions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- workspace_subscriptions: apenas platform_admin escreve
CREATE POLICY "workspace_subscriptions_platform_admin_write"
  ON workspace_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_platform_admin = true
    )
  );

-- ai_configs: membros lêem, admins escrevem
CREATE POLICY "ai_configs_member_select"
  ON ai_configs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_configs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_configs_admin_write"
  ON ai_configs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_configs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_configs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- workspace_settings: membros lêem, admins escrevem
CREATE POLICY "workspace_settings_member_select"
  ON workspace_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_settings_admin_write"
  ON workspace_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- workspace_invites: admins gerenciam
CREATE POLICY "workspace_invites_admin_manage"
  ON workspace_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- workspace_invites: convidado pode ver pelo token (sem auth)
CREATE POLICY "workspace_invites_token_select"
  ON workspace_invites FOR SELECT
  USING (true); -- token é secreto, controle na aplicação

-- ── 10. Atualizar get_user_workspaces() com mais dados ──────────
CREATE OR REPLACE FUNCTION public.get_user_workspaces()
RETURNS TABLE(
  id          uuid,
  name        text,
  country     text,
  role        text,
  is_active   boolean,
  slug        text,
  logo_url    text,
  plan_name   text,
  plan_slug   text,
  status      text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    w.id,
    w.name,
    w.country,
    wm.role,
    w.is_active,
    w.slug,
    w.logo_url,
    COALESCE(p.name, 'Starter') as plan_name,
    COALESCE(p.slug, 'starter') as plan_slug,
    w.status
  FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id
  LEFT JOIN plans p ON p.id = w.plan_id
  WHERE wm.user_id = auth.uid()
    AND w.is_active = true
  ORDER BY w.created_at;
$$;

-- ── 11. Função: criar workspace para novo usuário ───────────────
CREATE OR REPLACE FUNCTION public.create_workspace_for_user(
  p_user_id   uuid,
  p_name      text,
  p_slug      text DEFAULT NULL,
  p_country   text DEFAULT 'BR'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id uuid;
  v_slug         text;
  v_plan_id      uuid;
BEGIN
  -- Gerar slug único se não fornecido
  v_slug := COALESCE(
    p_slug,
    lower(regexp_replace(p_name, '[^a-zA-Z0-9]', '-', 'g'))
  );

  -- Garantir slug único
  WHILE EXISTS (SELECT 1 FROM workspaces WHERE slug = v_slug) LOOP
    v_slug := v_slug || '-' || floor(random() * 9000 + 1000)::text;
  END LOOP;

  -- Plano Starter por padrão
  SELECT id INTO v_plan_id FROM plans WHERE slug = 'starter' LIMIT 1;

  -- Criar workspace
  INSERT INTO workspaces (name, country, slug, created_by, plan_id, status)
  VALUES (p_name, p_country, v_slug, p_user_id, v_plan_id, 'active')
  RETURNING id INTO v_workspace_id;

  -- Adicionar usuário como admin
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, p_user_id, 'admin');

  -- Criar assinatura (trial 14 dias)
  INSERT INTO workspace_subscriptions (workspace_id, plan_id, status, trial_ends_at, current_period_end)
  VALUES (v_workspace_id, v_plan_id, 'trialing',
          NOW() + INTERVAL '14 days',
          NOW() + INTERVAL '14 days');

  -- Criar configurações de IA padrão
  INSERT INTO ai_configs (workspace_id)
  VALUES (v_workspace_id);

  -- Criar configurações gerais padrão
  INSERT INTO workspace_settings (workspace_id)
  VALUES (v_workspace_id);

  RETURN v_workspace_id;
END;
$$;

-- ── 12. Função: verificar limites do plano ──────────────────────
CREATE OR REPLACE FUNCTION public.check_workspace_limit(
  p_workspace_id uuid,
  p_resource     text  -- 'connections', 'flows', 'members'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan        plans%ROWTYPE;
  v_current     integer;
  v_max         integer;
  v_allowed     boolean;
BEGIN
  -- Buscar plano do workspace
  SELECT pl.* INTO v_plan
  FROM plans pl
  JOIN workspaces w ON w.plan_id = pl.id
  WHERE w.id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Workspace não encontrado');
  END IF;

  -- Verificar recurso
  CASE p_resource
    WHEN 'connections' THEN
      SELECT COUNT(*) INTO v_current
      FROM connection_configs
      WHERE workspace_id = p_workspace_id;
      v_max := v_plan.max_connections;

    WHEN 'flows' THEN
      SELECT COUNT(*) INTO v_current
      FROM automation_flows
      WHERE workspace_id = p_workspace_id;
      v_max := v_plan.max_flows;

    WHEN 'members' THEN
      SELECT COUNT(*) INTO v_current
      FROM workspace_members
      WHERE workspace_id = p_workspace_id;
      v_max := v_plan.max_members;

    ELSE
      RETURN jsonb_build_object('allowed', false, 'reason', 'Recurso desconhecido');
  END CASE;

  -- -1 = ilimitado (Enterprise)
  v_allowed := (v_max = -1 OR v_current < v_max);

  RETURN jsonb_build_object(
    'allowed',  v_allowed,
    'current',  v_current,
    'max',      v_max,
    'plan',     v_plan.name,
    'resource', p_resource,
    'reason',   CASE WHEN NOT v_allowed
                  THEN 'Limite do plano ' || v_plan.name || ' atingido (' || v_current || '/' || v_max || ')'
                  ELSE NULL
                END
  );
END;
$$;

-- ── 13. Função: aceitar convite ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_workspace_invite(
  p_token   text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite workspace_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM workspace_invites
  WHERE token = p_token
    AND accepted_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Convite inválido ou expirado');
  END IF;

  -- Adicionar ao workspace
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (v_invite.workspace_id, p_user_id, v_invite.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Marcar como aceito
  UPDATE workspace_invites SET accepted_at = NOW() WHERE id = v_invite.id;

  RETURN jsonb_build_object('success', true, 'workspace_id', v_invite.workspace_id, 'role', v_invite.role);
END;
$$;

-- ── 14. Trigger: criar workspace automático no signup ───────────
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER AS $$
DECLARE
  v_name text;
BEGIN
  -- Nome padrão baseado no email
  v_name := split_part(NEW.email, '@', 1);

  -- Só cria workspace se não é libertyuy (que vai pro workspace UY)
  IF NEW.email != 'libertyuy@gmail.com' THEN
    PERFORM create_workspace_for_user(NEW.user_id, v_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger no profiles (criado após auth.users)
DROP TRIGGER IF EXISTS trigger_new_user_workspace ON profiles;
CREATE TRIGGER trigger_new_user_workspace
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_workspace();

-- ── 15. Platform admin policy para workspaces ──────────────────
-- Platform admin vê todos os workspaces
CREATE POLICY "workspaces_platform_admin_select"
  ON workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_platform_admin = true
    )
  );

CREATE POLICY "workspaces_platform_admin_write"
  ON workspaces FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_platform_admin = true
    )
  );

-- Platform admin vê todos os workspace_members
CREATE POLICY "workspace_members_platform_admin"
  ON workspace_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid() AND p.is_platform_admin = true
    )
  );

-- ── 16. Índices para performance ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workspaces_slug         ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_status       ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites(email);
CREATE INDEX IF NOT EXISTS idx_ai_configs_workspace    ON ai_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_manager_config_workspace ON manager_config(workspace_id);

-- ── 17. Função para platform admin: listar todos workspaces ────
CREATE OR REPLACE FUNCTION public.admin_list_workspaces(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text    DEFAULT ''
)
RETURNS TABLE(
  id              uuid,
  name            text,
  slug            text,
  country         text,
  status          text,
  plan_name       text,
  member_count    bigint,
  created_at      timestamptz,
  owner_email     text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    w.id,
    w.name,
    w.slug,
    w.country,
    w.status,
    COALESCE(p.name, 'Starter') as plan_name,
    COUNT(wm.id) as member_count,
    w.created_at,
    u.email as owner_email
  FROM workspaces w
  LEFT JOIN plans p ON p.id = w.plan_id
  LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
  LEFT JOIN auth.users u ON u.id = w.created_by
  WHERE (p_search = '' OR w.name ILIKE '%' || p_search || '%' OR w.slug ILIKE '%' || p_search || '%')
  GROUP BY w.id, w.name, w.slug, w.country, w.status, p.name, w.created_at, u.email
  ORDER BY w.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;
