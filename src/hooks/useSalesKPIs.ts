import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SalesKPIs {
  receitaTotal: number;
  receitaTotalPrev: number;
  vendasAgendadas: number;
  vendasAgendadasPrev: number;
  comissao: number;
  comissaoPrev: number;
  ticketMedio: number;
  ticketMedioPrev: number;
  taxaConversao: number;
  taxaConversaoPrev: number;
  leadsFacebook: number;
  leadsFacebookPrev: number;
  metaDia: number;
  metaMes: number;
  commissionRate: number;
}

function pctChange(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 1000) / 10;
}

function getPrevRange(from: string | null, to: string | null): { from: string | null; to: string | null } {
  if (!from) return { from: null, to: null };

  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  const diffMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diffMs);

  return {
    from: prevStart.toISOString(),
    to: prevEnd.toISOString(),
  };
}

async function fetchSalesData(from: string | null, to: string | null, pais: string | null) {
  let query = supabase.from('sales_orders' as any).select('valor, quantidade, pais');
  if (from) query = (query as any).gte('created_at', from);
  if (to)   query = (query as any).lte('created_at', to);
  if (pais) query = (query as any).eq('pais', pais);

  const { data } = await query;
  const rows = (data as any[]) ?? [];

  const totalValor = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const count = rows.length;
  const brCount = rows.filter(r => String(r.pais).toLowerCase() === 'brasil').length;
  const uyCount = rows.filter(r => String(r.pais).toLowerCase() === 'uruguay').length;

  return { totalValor, count, brCount, uyCount };
}

async function fetchConversationsData(from: string | null, to: string | null) {
  let totalQ = supabase.from('conversations' as any).select('id', { count: 'exact', head: true });
  let resolvedQ = supabase.from('conversations' as any).select('id', { count: 'exact', head: true }).eq('status', 'resolved');

  if (from) {
    totalQ   = (totalQ   as any).gte('created_at', from);
    resolvedQ = (resolvedQ as any).gte('created_at', from);
  }
  if (to) {
    totalQ   = (totalQ   as any).lte('created_at', to);
    resolvedQ = (resolvedQ as any).lte('created_at', to);
  }

  const [totalRes, resolvedRes] = await Promise.all([totalQ, resolvedQ]);

  const total    = (totalRes as any).count ?? 0;
  const resolved = (resolvedRes as any).count ?? 0;
  const taxaConversao = total > 0 ? Math.round((resolved / total) * 1000) / 10 : 0;

  return { total, resolved, taxaConversao };
}

export function useSalesKPIs(
  from: string | null,
  to: string | null,
  metaDia: number,
  metaMes: number,
  pais: string | null = null,
) {
  return useQuery<SalesKPIs>({
    queryKey: ['sales-kpis', from, to, metaDia, metaMes, pais],
    queryFn: async () => {
      const prev = getPrevRange(from, to);

      const [current, previous, convCurrent, convPrevious] = await Promise.all([
        fetchSalesData(from, to, pais),
        fetchSalesData(prev.from, prev.to, pais),
        fetchConversationsData(from, to),
        fetchConversationsData(prev.from, prev.to),
      ]);

      const receitaTotal     = current.totalValor;
      const receitaTotalPrev = previous.totalValor;
      const vendas           = current.count;
      const vendasPrev       = previous.count;
      const comissao         = current.brCount * 2 + current.uyCount * 3;
      const comissaoPrev     = previous.brCount * 2 + previous.uyCount * 3;
      const ticketMedio      = vendas > 0 ? receitaTotal / vendas : 0;
      const ticketMedioPrev  = vendasPrev > 0 ? receitaTotalPrev / vendasPrev : 0;

      return {
        receitaTotal,
        receitaTotalPrev,
        vendasAgendadas: vendas,
        vendasAgendadasPrev: vendasPrev,
        comissao,
        comissaoPrev,
        ticketMedio,
        ticketMedioPrev,
        taxaConversao: convCurrent.taxaConversao,
        taxaConversaoPrev: convPrevious.taxaConversao,
        leadsFacebook: convCurrent.total,
        leadsFacebookPrev: convPrevious.total,
        metaDia,
        metaMes,
        commissionRate: 0,
      };
    },
    staleTime: 1000 * 60 * 2,
    refetchInterval: 1000 * 60 * 5,
  });
}

export { pctChange };
