CREATE OR REPLACE FUNCTION public.get_inbox_page(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_agent_id uuid DEFAULT NULL::uuid, p_connection_ids uuid[] DEFAULT NULL::uuid[], p_tag_id uuid DEFAULT NULL::uuid, p_only_unread boolean DEFAULT false, p_last_customer boolean DEFAULT false, p_workspace_id uuid DEFAULT NULL::uuid, p_sector text DEFAULT '')
 RETURNS TABLE(id uuid, contact_name text, contact_phone text, status text, tags text[], updated_at timestamp with time zone, assigned_agent_id uuid, last_message text, last_message_sender text, unread_count bigint, niche_id uuid, connection_config_id uuid, contact_tags jsonb, sector text, total_count bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT regexp_replace(COALESCE(p_search,''), '\D', '', 'g') AS search_digits
  ),
  filtered_convos AS (
    SELECT c.id, c.contact_name, c.contact_phone, c.status, c.tags,
           c.updated_at, c.assigned_agent_id, c.niche_id, c.connection_config_id, c.sector
    FROM conversations c, params
    WHERE c.contact_phone NOT LIKE '%-group'
      AND (p_workspace_id IS NULL OR c.workspace_id = p_workspace_id)
      AND (
        p_search = ''
        OR c.contact_name ILIKE '%' || p_search || '%'
        OR c.contact_phone ILIKE '%' || p_search || '%'
        OR (params.search_digits <> '' AND regexp_replace(c.contact_phone, '\D', '', 'g') ILIKE '%' || params.search_digits || '%')
      )
      AND (p_status = '' OR c.status = p_status)
      AND (p_sector = '' OR c.sector = p_sector)
      AND (p_agent_id IS NULL OR c.assigned_agent_id = p_agent_id)
      AND (p_connection_ids IS NULL OR c.connection_config_id = ANY(p_connection_ids))
      AND (p_tag_id IS NULL OR EXISTS (
        SELECT 1 FROM contact_tags ct WHERE ct.contact_phone = c.contact_phone AND ct.tag_id = p_tag_id
      ))
  ),
  with_messages AS (
    SELECT fc.*,
      lm.content AS last_message,
      lm.sender_type AS last_message_sender,
      lm.created_at AS last_message_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = fc.id AND m.sender_type = 'customer' AND m.status != 'read') AS unread_count
    FROM filtered_convos fc
    LEFT JOIN LATERAL (
      SELECT m.content, m.sender_type, m.created_at
      FROM messages m WHERE m.conversation_id = fc.id
      ORDER BY m.created_at DESC LIMIT 1
    ) lm ON true
  ),
  post_filtered AS (
    SELECT wm.* FROM with_messages wm
    WHERE (NOT p_only_unread OR wm.unread_count > 0)
      AND (NOT p_last_customer OR wm.last_message_sender = 'customer')
  ),
  counted AS (SELECT COUNT(*)::bigint AS cnt FROM post_filtered),
  paged AS (
    SELECT pf.* FROM post_filtered pf
    ORDER BY COALESCE(pf.last_message_at, pf.updated_at) DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    pg.id, pg.contact_name, pg.contact_phone, pg.status, pg.tags,
    COALESCE(pg.last_message_at, pg.updated_at) AS updated_at,
    pg.assigned_agent_id, pg.last_message, pg.last_message_sender,
    pg.unread_count, pg.niche_id, pg.connection_config_id,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'tag_id', t.id, 'name', t.name, 'color', t.color))
       FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_phone = pg.contact_phone),
      '[]'::jsonb
    ) AS contact_tags,
    pg.sector,
    (SELECT cnt FROM counted) AS total_count
  FROM paged pg
  ORDER BY COALESCE(pg.last_message_at, pg.updated_at) DESC;
$function$;