CREATE OR REPLACE FUNCTION public.find_latest_conversation_by_phone(p_phone text)
RETURNS TABLE(id uuid, workspace_id uuid, contact_name text, contact_phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.workspace_id, c.contact_name, c.contact_phone
  FROM public.conversations c
  WHERE c.workspace_id IS NOT NULL
    AND c.contact_phone NOT LIKE '%-group'
    AND regexp_replace(c.contact_phone, '\D', '', 'g') = regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g')
    AND regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') <> ''
  ORDER BY c.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_latest_conversation_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_latest_conversation_by_phone(text) FROM anon;
REVOKE ALL ON FUNCTION public.find_latest_conversation_by_phone(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_latest_conversation_by_phone(text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_conversations_normalized_phone_updated
ON public.conversations ((regexp_replace(contact_phone, '\D', '', 'g')), updated_at DESC)
WHERE workspace_id IS NOT NULL AND contact_phone NOT LIKE '%-group';