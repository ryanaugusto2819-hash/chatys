import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef, useCallback } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const PAGE_SIZE = 30;

export interface InboxFilters {
  search: string;
  status: string;
  agentId: string | null;
  connectionIds: string[];
  tagId: string | null;
  onlyUnread: boolean;
  lastCustomer: boolean;
}

export interface ContactTagInfo {
  id: string;
  tag_id: string;
  name: string;
  color: string;
}

export interface InboxConversation {
  id: string;
  contact_name: string;
  contact_phone: string;
  status: string;
  tags: string[] | null;
  updated_at: string;
  assigned_agent_id: string | null;
  last_message: string | null;
  last_message_sender: string | null;
  unread_count: number;
  niche_id: string | null;
  connection_config_id: string | null;
  contact_tags: ContactTagInfo[];
}

interface InboxPage {
  conversations: InboxConversation[];
  totalCount: number;
  offset: number;
}

export function useInboxQuery(filters: InboxFilters) {
  const queryClient = useQueryClient();
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { currentWorkspace } = useWorkspace();

  const query = useInfiniteQuery<InboxPage>({
    queryKey: ['inbox', filters, currentWorkspace?.id],
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam ?? 0) as number;
      const { data, error } = await (supabase.rpc as any)('get_inbox_page', {
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_search: filters.search,
        p_status: filters.status,
        p_agent_id: filters.agentId || null,
        p_connection_ids: filters.connectionIds.length > 0 ? filters.connectionIds : null,
        p_tag_id: filters.tagId || null,
        p_only_unread: filters.onlyUnread,
        p_last_customer: filters.lastCustomer,
        p_workspace_id: currentWorkspace?.id ?? null,
      });

      if (error) throw error;

      const rows = (data || []) as any[];
      const totalCount: number = rows[0]?.total_count ?? 0;

      return {
        conversations: rows.map((r: any) => ({
          ...r,
          unread_count: Number(r.unread_count) || 0,
          contact_tags: typeof r.contact_tags === 'string'
            ? (() => { try { return JSON.parse(r.contact_tags); } catch { return []; } })()
            : Array.isArray(r.contact_tags) ? r.contact_tags : [],
        })),
        totalCount,
        offset,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + PAGE_SIZE;
      if (nextOffset >= lastPage.totalCount) return undefined;
      return nextOffset;
    },
    initialPageParam: 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Schedule a debounced invalidation (used after realtime updates to fix ordering)
  const scheduleInvalidation = useCallback(() => {
    if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    invalidateTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['inbox', filters] });
    }, 5000);
  }, [queryClient, filters]);

  // Realtime: update cache incrementally
  useEffect(() => {
    const channel = supabase
      .channel('inbox-realtime-v2')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
        const updated = payload.new as any;
        queryClient.setQueryData<{ pages: InboxPage[]; pageParams: any }>(['inbox', filters], (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              conversations: page.conversations.map((c) =>
                c.id === updated.id
                  ? { ...c, status: updated.status, assigned_agent_id: updated.assigned_agent_id, contact_name: updated.contact_name, tags: updated.tags, updated_at: updated.updated_at, connection_config_id: updated.connection_config_id }
                  : c
              ),
            })),
          };
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any;
        let found = false;

        queryClient.setQueryData<{ pages: InboxPage[]; pageParams: any }>(['inbox', filters], (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              conversations: page.conversations.map((c) => {
                if (c.id === msg.conversation_id) {
                  found = true;
                  return {
                    ...c,
                    last_message: msg.content,
                    last_message_sender: msg.sender_type,
                    updated_at: msg.created_at,
                    unread_count: msg.sender_type === 'customer' ? (c.unread_count || 0) + 1 : c.unread_count,
                  };
                }
                return c;
              }),
            })),
          };
        });

        if (!found) {
          // New conversation's message not in cache — invalidate to pick it up
          queryClient.invalidateQueries({ queryKey: ['inbox', filters, currentWorkspace?.id] });
        } else {
          // Schedule ordering fix
          scheduleInvalidation();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inbox', filters, currentWorkspace?.id] });
      })
      .subscribe();

    return () => {
      if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [filters, queryClient, scheduleInvalidation, currentWorkspace?.id]);

  const allConversations = query.data?.pages.flatMap((p) => p.conversations) ?? [];
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    conversations: allConversations,
    totalCount,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
