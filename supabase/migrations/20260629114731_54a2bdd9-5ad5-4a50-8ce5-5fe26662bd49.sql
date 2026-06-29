
-- Tighten conversations INSERT: require workspace membership (or NULL workspace, or admin)
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON public.conversations;
CREATE POLICY "Workspace members can insert conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id IS NULL
  OR public.is_workspace_member(workspace_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Tighten messages INSERT: must belong to a conversation in the user's workspace
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
CREATE POLICY "Workspace members can insert messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (
        c.workspace_id IS NULL
        OR public.is_workspace_member(c.workspace_id)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

-- Restrict profile visibility: own profile, profiles of users sharing a workspace, or admin
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Users view own and workspace-shared profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.workspace_members me
    JOIN public.workspace_members them
      ON them.workspace_id = me.workspace_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = profiles.user_id
  )
);

-- Storage: follow-up-images — require owner = auth.uid() on INSERT and DELETE
DROP POLICY IF EXISTS "Authenticated users can upload follow-up images" ON storage.objects;
CREATE POLICY "Owners can upload follow-up images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'follow-up-images'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Authenticated users can delete follow-up images" ON storage.objects;
CREATE POLICY "Owners can delete follow-up images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'follow-up-images'
  AND owner = auth.uid()
);

-- Storage: knowledge-base — restrict DELETE to file owner
DROP POLICY IF EXISTS "Allow authenticated delete on knowledge-base" ON storage.objects;
CREATE POLICY "Owners can delete knowledge-base files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND owner = auth.uid()
);
