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
      // Fetch messages in range with joined conversation → connection
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id, sender_type,
          conversations!inner(
            connection_config_id,
            connection_configs!connection_config_id(id, label, connection_id, config)
          )
        `)
        .gte('created_at', from)
        .lte('created_at', to)
        .limit(50000);

      if (error) throw error;

      const buckets = new Map<string, MessagesByConnection>();

      (data ?? []).forEach((row: any) => {
        const cc = row.conversations?.connection_configs;
        const id = cc?.id ?? 'none';
        const name = labelFor(cc);
        if (!buckets.has(id)) {
          buckets.set(id, { connectionId: id, name, total: 0, incoming: 0, outgoing: 0 });
        }
        const bucket = buckets.get(id)!;
        bucket.total += 1;
        if (row.sender_type === 'customer') bucket.incoming += 1;
        else bucket.outgoing += 1;
      });

      return Array.from(buckets.values()).sort((a, b) => b.incoming - a.incoming);
    },
    staleTime: 30_000,
  });
}
