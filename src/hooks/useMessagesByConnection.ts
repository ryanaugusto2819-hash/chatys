import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import type { LeadPeriod } from './useLeadMonitor';

export interface MessagesByConnection {
  connectionId: string;
  name: string;
  total: number;
  incoming: number;
  outgoing: number;
}

function getRange(period: LeadPeriod): { from: string; to: string } {
  const now = new Date();
  if (period === 'hoje')  return { from: startOfDay(now).toISOString(),            to: now.toISOString() };
  if (period === 'ontem') return { from: startOfDay(subDays(now, 1)).toISOString(), to: endOfDay(subDays(now, 1)).toISOString() };
  if (period === '7d')    return { from: startOfDay(subDays(now, 6)).toISOString(), to: now.toISOString() };
  if (period === '30d')   return { from: startOfDay(subDays(now, 29)).toISOString(),to: now.toISOString() };
  if (period === 'mes')   return { from: startOfMonth(now).toISOString(),           to: now.toISOString() };
  return { from: startOfDay(now).toISOString(), to: now.toISOString() };
}

function labelFor(cc: any): string {
  if (!cc) return 'Sem conexão';
  return (
    cc.label ||
    cc.config?.name ||
    cc.config?.instance_name ||
    cc.config?.phone_number ||
    cc.connection_id ||
    'Conexão'
  );
}

export function useMessagesByConnection(period: LeadPeriod) {
  const { from, to } = getRange(period);

  return useQuery<MessagesByConnection[]>({
    queryKey: ['messages-by-connection', period],
    queryFn: async () => {
      // Aggregate server-side (avoids pulling tens of thousands of rows)
      const [{ data, error }, { data: configs }] = await Promise.all([
        (supabase.rpc as any)('get_messages_by_connection', { p_from: from, p_to: to }),
        supabase.from('connection_configs').select('id, label, connection_id, config'),
      ]);

      if (error) throw error;

      const byId = new Map<string, any>((configs ?? []).map((c: any) => [c.id, c]));

      return ((data ?? []) as any[])
        .map((row) => {
          const cc = row.connection_config_id ? byId.get(row.connection_config_id) : null;
          return {
            connectionId: row.connection_config_id ?? 'none',
            name: labelFor(cc),
            total: Number(row.total) || 0,
            incoming: Number(row.incoming) || 0,
            outgoing: Number(row.outgoing) || 0,
          };
        })
        .sort((a, b) => b.incoming - a.incoming);
    },
    staleTime: 30_000,
  });
}

