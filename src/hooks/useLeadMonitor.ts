import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays, startOfDay, endOfDay, format, startOfMonth, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type LeadPeriod = 'hoje' | 'ontem' | '7d' | '30d' | 'mes';

function getRange(period: LeadPeriod): { from: string; to: string } {
  const now = new Date();
  if (period === 'hoje')  return { from: startOfDay(now).toISOString(),              to: now.toISOString() };
  if (period === 'ontem') return { from: startOfDay(subDays(now, 1)).toISOString(),   to: endOfDay(subDays(now, 1)).toISOString() };
  if (period === '7d')    return { from: startOfDay(subDays(now, 6)).toISOString(),   to: now.toISOString() };
  if (period === '30d')   return { from: startOfDay(subDays(now, 29)).toISOString(),  to: now.toISOString() };
  if (period === 'mes')   return { from: startOfMonth(now).toISOString(),             to: now.toISOString() };
  return { from: startOfDay(now).toISOString(), to: now.toISOString() };
}

export interface AgentLead { name: string; count: number; }
export interface ConnectionLead { name: string; count: number; connectionId: string; }
export interface ChartPoint { label: string; leads: number; }

export interface LeadMonitorData {
  total: number;
  hoje: number;
  ativos: number;
  resolvidos: number;
  chart: ChartPoint[];
  byAgent: AgentLead[];
  byConnection: ConnectionLead[];
}

export function useLeadMonitor(period: LeadPeriod) {
  const { from, to } = getRange(period);

  return useQuery<LeadMonitorData>({
    queryKey: ['lead-monitor', period],
    queryFn: async () => {
      const now = new Date();

      const [convsRes, todayRes, activeRes, resolvedRes] = await Promise.all([
        supabase
          .from('conversations')
          .select(`id, created_at, status, assigned_agent_id, connection_config_id,
            profiles!assigned_agent_id(full_name),
            connection_configs!connection_config_id(connection_id, config)`)
          .gte('created_at', from)
          .lte('created_at', to),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfDay(now).toISOString())
          .lte('created_at', now.toISOString()),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .gte('created_at', from)
          .lte('created_at', to),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'resolved')
          .gte('created_at', from)
          .lte('created_at', to),
      ]);

      const convs = (convsRes.data ?? []) as any[];
      const total = convs.length;

      // ── Chart: by hour (hoje/ontem) or by day (other periods) ──
      let chart: ChartPoint[] = [];
      if (period === 'hoje') {
        // Last 24h in 2h buckets
        chart = Array.from({ length: 12 }, (_, i) => {
          const bucketStart = subHours(now, (11 - i) * 2 + 2);
          const bucketEnd   = subHours(now, (11 - i) * 2);
          const count = convs.filter(c => {
            const d = new Date(c.created_at);
            return d >= bucketStart && d < bucketEnd;
          }).length;
          return { label: format(bucketEnd, 'HH:mm'), leads: count };
        });
      } else if (period === 'ontem') {
        chart = Array.from({ length: 12 }, (_, i) => {
          const base = subDays(now, 1);
          const bucketStart = new Date(base.getFullYear(), base.getMonth(), base.getDate(), i * 2);
          const bucketEnd   = new Date(base.getFullYear(), base.getMonth(), base.getDate(), i * 2 + 2);
          const count = convs.filter(c => {
            const d = new Date(c.created_at);
            return d >= bucketStart && d < bucketEnd;
          }).length;
          return { label: `${String(i * 2).padStart(2, '0')}h`, leads: count };
        });
      } else {
        const days = period === '7d' ? 7 : period === 'mes' ? 30 : 30;
        chart = Array.from({ length: Math.min(days, 30) }, (_, i) => {
          const day = subDays(now, days - 1 - i);
          const dayStart = startOfDay(day).toISOString();
          const dayEnd   = endOfDay(day).toISOString();
          const count = convs.filter(c => c.created_at >= dayStart && c.created_at <= dayEnd).length;
          return {
            label: format(day, days <= 7 ? 'EEE dd' : 'dd/MM', { locale: ptBR }),
            leads: count,
          };
        });
      }

      // ── By agent ──
      const agentMap: Record<string, number> = {};
      for (const c of convs) {
        const name: string = (c.profiles as any)?.full_name ?? 'Sem atendente';
        agentMap[name] = (agentMap[name] ?? 0) + 1;
      }
      const byAgent: AgentLead[] = Object.entries(agentMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // ── By connection ──
      const connMap: Record<string, { count: number; connectionId: string }> = {};
      for (const c of convs) {
        const cfg = c.connection_configs as any;
        const connId: string = cfg?.connection_id ?? c.connection_config_id ?? 'desconhecida';
        const label: string = cfg?.config?.label ?? cfg?.config?.name ?? cfg?.connection_id ?? 'Conexão sem nome';
        if (!connMap[label]) connMap[label] = { count: 0, connectionId: connId };
        connMap[label].count += 1;
      }
      const byConnection: ConnectionLead[] = Object.entries(connMap)
        .map(([name, v]) => ({ name, count: v.count, connectionId: v.connectionId }))
        .sort((a, b) => b.count - a.count);

      return {
        total,
        hoje: todayRes.count ?? 0,
        ativos: activeRes.count ?? 0,
        resolvidos: resolvedRes.count ?? 0,
        chart,
        byAgent,
        byConnection,
      };
    },
    staleTime: 1000 * 60 * 2,
  });
}
