REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_conversations_count(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_current_user_meta() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_user_meta() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_meta() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_meta() TO service_role;