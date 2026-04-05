-- ================================================================
-- WORKSPACE SYSTEM: Isolamento completo por conta/país
-- Brasil 🇧🇷  e  Uruguay 🇺🇾
-- ================================================================

-- ── 1. Tabela workspaces ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  country     TEXT        NOT NULL DEFAULT 'BR',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Tabela workspace_members ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'agent'
                           CHECK (role IN ('admin', 'supervisor', 'agent')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- ── 3. Adicionar workspace_id às tabelas principais ─────────────────
ALTER TABLE connection_configs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE niches              ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE conversations       ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE automation_flows    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

-- ── 4. Criar workspace Brasil (ID fixo para referência) ─────────────
INSERT INTO workspaces (id, name, country) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Brasil',  'BR')
ON CONFLICT (id) DO NOTHING;

-- ── 5. Criar workspace Uruguay (ID fixo para referência) ─────────────
INSERT INTO workspaces (id, name, country) VALUES
  ('10000000-0000-0000-0000-000000000002', 'Uruguay', 'UY')
ON CONFLICT (id) DO NOTHING;

-- ── 6. Atribuir dados existentes ao workspace Brasil ─────────────────
UPDATE connection_configs SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE niches              SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE conversations       SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE automation_flows    SET workspace_id = '10000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;

-- ── 6b. Mover conexão EDMUNDO e suas conversas para workspace Uruguay ──
UPDATE connection_configs
SET workspace_id = '10000000-0000-0000-0000-000000000002'
WHERE label ILIKE 'EDMUNDO';

UPDATE conversations c
SET workspace_id = '10000000-0000-0000-0000-000000000002'
FROM connection_configs cc
WHERE c.connection_config_id = cc.id
  AND cc.label ILIKE 'EDMUNDO';

-- ── 7. Adicionar todos os usuários existentes ao workspace Brasil ──────
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT
  '10000000-0000-0000-0000-000000000001'::uuid,
  p.user_id,
  COALESCE(
    (SELECT ur.role FROM user_roles ur
     WHERE ur.user_id = p.user_id
     ORDER BY CASE ur.role WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END
     LIMIT 1),
    'agent'
  )
FROM profiles p
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- ── 8. Trigger: conversas herdam workspace da conexão automaticamente ──
CREATE OR REPLACE FUNCTION inherit_workspace_from_connection()
RETURNS TRIGGER AS $$
BEGIN
  -- Herdar do connection_config se disponível
  IF NEW.workspace_id IS NULL AND NEW.connection_config_id IS NOT NULL THEN
    SELECT cc.workspace_id INTO NEW.workspace_id
    FROM connection_configs cc
    WHERE cc.id = NEW.connection_config_id;
  END IF;
  -- Fallback: herdar do niche
  IF NEW.workspace_id IS NULL AND NEW.niche_id IS NOT NULL THEN
    SELECT n.workspace_id INTO NEW.workspace_id
    FROM niches n
    WHERE n.id = NEW.niche_id;
  END IF;
  -- Fallback final: Brasil
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := '10000000-0000-0000-0000-000000000001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS conversations_inherit_workspace ON conversations;
CREATE TRIGGER conversations_inherit_workspace
  BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION inherit_workspace_from_connection();

-- ── 9. Trigger: flows herdam workspace do niche automaticamente ────────
CREATE OR REPLACE FUNCTION inherit_workspace_from_niche()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.niche_id IS NOT NULL THEN
    SELECT n.workspace_id INTO NEW.workspace_id
    FROM niches n
    WHERE n.id = NEW.niche_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS flows_inherit_workspace ON automation_flows;
CREATE TRIGGER flows_inherit_workspace
  BEFORE INSERT ON automation_flows
  FOR EACH ROW EXECUTE FUNCTION inherit_workspace_from_niche();

-- ── 10. Habilitar RLS nas novas tabelas ────────────────────────────────
ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- workspaces: visível apenas para membros
CREATE POLICY "workspaces_member_select"
  ON workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
    )
  );

-- workspace_members: visível para membros do mesmo workspace
CREATE POLICY "workspace_members_select"
  ON workspace_members FOR SELECT
  USING (
    workspace_id IN (
      SELECT wm2.workspace_id FROM workspace_members wm2
      WHERE wm2.user_id = auth.uid()
    )
  );

-- workspace_members: apenas admins podem adicionar/remover membros
CREATE POLICY "workspace_members_admin_write"
  ON workspace_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'admin'
    )
  );

-- ── 11. Função: retorna workspaces do usuário atual ─────────────────────
CREATE OR REPLACE FUNCTION public.get_user_workspaces()
RETURNS TABLE(
  id       uuid,
  name     text,
  country  text,
  role     text,
  is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.name, w.country, wm.role, w.is_active
  FROM workspaces w
  JOIN workspace_members wm ON wm.workspace_id = w.id
  WHERE wm.user_id = auth.uid()
    AND w.is_active = true
  ORDER BY w.country;
$$;

-- ── 12. Função: adicionar usuário a workspace (admin) ───────────────────
CREATE OR REPLACE FUNCTION public.add_user_to_workspace(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_role         text DEFAULT 'agent'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se o chamador é admin do workspace
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Apenas administradores podem adicionar membros';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, p_user_id, p_role)
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET role = EXCLUDED.role;
END;
$$;

-- ── 13. Atualizar get_inbox_page para filtrar por workspace ────────────
CREATE OR REPLACE FUNCTION public.get_inbox_page(
  p_limit        integer   DEFAULT 30,
  p_offset       integer   DEFAULT 0,
  p_search       text      DEFAULT '',
  p_status       text      DEFAULT '',
  p_agent_id     uuid      DEFAULT NULL,
  p_connection_ids uuid[]  DEFAULT NULL,
  p_tag_id       uuid      DEFAULT NULL,
  p_only_unread  boolean   DEFAULT false,
  p_last_customer boolean  DEFAULT false,
  p_workspace_id uuid      DEFAULT NULL
)
RETURNS TABLE(
  id                 uuid,
  contact_name       text,
  contact_phone      text,
  status             text,
  tags               text[],
  updated_at         timestamptz,
  assigned_agent_id  uuid,
  last_message       text,
  last_message_sender text,
  unread_count       bigint,
  niche_id           uuid,
  connection_config_id uuid,
  contact_tags       jsonb,
  total_count        bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH filtered_convos AS (
    SELECT c.id, c.contact_name, c.contact_phone, c.status, c.tags,
           c.updated_at, c.assigned_agent_id, c.niche_id, c.connection_config_id
    FROM conversations c
    WHERE c.contact_phone NOT LIKE '%-group'
      AND (p_workspace_id IS NULL OR c.workspace_id = p_workspace_id)
      AND (p_search = '' OR c.contact_name ILIKE '%' || p_search || '%' OR c.contact_phone ILIKE '%' || p_search || '%')
      AND (p_status = '' OR c.status = p_status)
      AND (p_agent_id IS NULL OR c.assigned_agent_id = p_agent_id)
      AND (p_connection_ids IS NULL OR c.connection_config_id = ANY(p_connection_ids))
      AND (p_tag_id IS NULL OR EXISTS (
        SELECT 1 FROM contact_tags ct WHERE ct.contact_phone = c.contact_phone AND ct.tag_id = p_tag_id
      ))
  ),
  with_messages AS (
    SELECT
      fc.*,
      lm.content as last_message,
      lm.sender_type as last_message_sender,
      lm.created_at as last_message_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = fc.id AND m.sender_type = 'customer' AND m.status != 'read') as unread_count
    FROM filtered_convos fc
    LEFT JOIN LATERAL (
      SELECT m.content, m.sender_type, m.created_at
      FROM messages m
      WHERE m.conversation_id = fc.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lm ON true
  ),
  post_filtered AS (
    SELECT wm.*
    FROM with_messages wm
    WHERE (NOT p_only_unread OR wm.unread_count > 0)
      AND (NOT p_last_customer OR wm.last_message_sender = 'customer')
  ),
  counted AS (
    SELECT COUNT(*)::bigint as cnt FROM post_filtered
  ),
  paged AS (
    SELECT pf.*
    FROM post_filtered pf
    ORDER BY COALESCE(pf.last_message_at, pf.updated_at) DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    pg.id,
    pg.contact_name,
    pg.contact_phone,
    pg.status,
    pg.tags,
    COALESCE(pg.last_message_at, pg.updated_at) as updated_at,
    pg.assigned_agent_id,
    pg.last_message,
    pg.last_message_sender,
    pg.unread_count,
    pg.niche_id,
    pg.connection_config_id,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'tag_id', t.id, 'name', t.name, 'color', t.color))
       FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_phone = pg.contact_phone),
      '[]'::jsonb
    ) as contact_tags,
    (SELECT cnt FROM counted) as total_count
  FROM paged pg
  ORDER BY COALESCE(pg.last_message_at, pg.updated_at) DESC;
$function$;

-- ── 14. Trigger: auto-adicionar libertyuy@gmail.com ao workspace Uruguay ──
CREATE OR REPLACE FUNCTION auto_add_liberty_uy()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  IF v_email = 'libertyuy@gmail.com' THEN
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES ('10000000-0000-0000-0000-000000000002', NEW.user_id, 'admin')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_liberty_uy ON profiles;
CREATE TRIGGER trigger_auto_liberty_uy
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_add_liberty_uy();

-- ── 15. Se libertyuy@gmail.com já existe, adicionar ao Uruguay agora ──
INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT '10000000-0000-0000-0000-000000000002', u.id, 'admin'
FROM auth.users u
WHERE u.email = 'libertyuy@gmail.com'
ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'admin';
