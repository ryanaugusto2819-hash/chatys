CREATE INDEX IF NOT EXISTS idx_messages_media_url ON public.messages (media_url) WHERE media_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_read_chat_media(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.media_url IN (
      'https://glceihfavfvebaaxgsnq.supabase.co/storage/v1/object/public/chat-media/' || _name,
      'https://glceihfavfvebaaxgsnq.supabase.co/storage/v1/object/authenticated/chat-media/' || _name,
      'https://glceihfavfvebaaxgsnq.supabase.co/storage/v1/object/sign/chat-media/' || _name
    )
    AND (c.workspace_id IS NULL OR public.is_workspace_member(c.workspace_id))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_chat_media(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_read_chat_media(text) TO authenticated;

DROP POLICY IF EXISTS "Workspace members can read chat-media" ON storage.objects;
CREATE POLICY "Workspace members can read chat-media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-media' AND (owner = auth.uid() OR public.can_read_chat_media(name)));