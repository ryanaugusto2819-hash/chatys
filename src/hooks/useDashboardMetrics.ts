import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';

export interface DashboardMetrics {
  totalConversations: number;
  messagesSent: number;
  messagesReceived: number;
  resolutionRate: number;
  activeAgents: number;
  avgResponseTime: string;
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async (): Promise<DashboardMetrics> => {
      const since = subDays(new Date(), 7).toISOString();

      const [
        totalConvRes,
        sentRes,
        receivedRes,
        resolvedRes,
        agentsRes,
      ] = await Promise.all([
        supabase
          .from('conversations')
          .select('id', { count: 'planned', head: true })
          .gte('created_at', since),
        supabase
          .from('messages')
          .select('id', { count: 'planned', head: true })
          .in('sender_type', ['agent', 'bot'])
          .gte('created_at', since),
        supabase
          .from('messages')
          .select('id', { count: 'planned', head: true })
          .eq('sender_type', 'customer')
          .gte('created_at', since),
        supabase
          .from('conversations')
          .select('id', { count: 'planned', head: true })
          .eq('status', 'resolved')
          .gte('created_at', since),
        supabase
          .from('profiles')
          .select('id', { count: 'planned', head: true })
          .eq('status', 'online'),
      ]);

      const total = totalConvRes.count ?? 0;
      const resolved = resolvedRes.count ?? 0;
      const resolutionRate = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0;

      return {
        totalConversations: total,
        messagesSent: sentRes.count ?? 0,
        messagesReceived: receivedRes.count ?? 0,
        resolutionRate,
        activeAgents: agentsRes.count ?? 0,
        avgResponseTime: '—',
      };
    },
    staleTime: 1000 * 60 * 2, // 2 minutos
    refetchInterval: 1000 * 60 * 5, // auto-refresh a cada 5 min
  });
}
