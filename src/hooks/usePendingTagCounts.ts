import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CountryFilter = 'all' | 'brasil' | 'uruguay';

interface PendingCounts {
  enderecoBrasil: number;
  enderecoUruguay: number;
  confirmacaoBrasil: number;
  confirmacaoUruguay: number;
  fazerAgendamentoBrasil: number;
  fazerAgendamentoUruguay: number;
  pedidoAgendadoBrasil: number;
  pedidoAgendadoUruguay: number;
  loading: boolean;
}

type Bucket = keyof Omit<PendingCounts, 'loading'>;

/**
 * Real-time counts of contacts across the ordering funnel tags, split by country.
 * Names are matched by pattern so the counters keep working even if tag IDs change.
 */
export function usePendingTagCounts(country: CountryFilter = 'all'): PendingCounts {
  const [counts, setCounts] = useState<PendingCounts>({
    enderecoBrasil: 0,
    enderecoUruguay: 0,
    confirmacaoBrasil: 0,
    confirmacaoUruguay: 0,
    fazerAgendamentoBrasil: 0,
    fazerAgendamentoUruguay: 0,
    pedidoAgendadoBrasil: 0,
    pedidoAgendadoUruguay: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const classify = (rawName: string): Bucket | null => {
      const n = rawName.toUpperCase();
      const isBrasil = n.includes('BRASIL') || n.includes('BRAZIL') || / BR([^A-Z]|$)/.test(n);
      const isUruguay = n.includes('URUGUAY') || n.includes('URUGUAI') || n.includes('UY');
      if (!isBrasil && !isUruguay) return null;

      const isPending = n.includes('PENDENTE') || n.includes('PEDENTE');
      const isEndereco = n.includes('ENDERE');
      const isConfirmacao = n.includes('CONFIRMA');
      const isFazerAg = n.includes('FAZER AGEND');
      const isPedidoAg = n.includes('PEDIDO AGEND');

      if (isEndereco && isPending && isBrasil) return 'enderecoBrasil';
      if (isEndereco && isPending && isUruguay) return 'enderecoUruguay';
      if (isConfirmacao && isPending && !isFazerAg && !isPedidoAg && isBrasil) return 'confirmacaoBrasil';
      if (isConfirmacao && isPending && !isFazerAg && !isPedidoAg && isUruguay) return 'confirmacaoUruguay';
      if (isFazerAg && isBrasil) return 'fazerAgendamentoBrasil';
      if (isFazerAg && isUruguay) return 'fazerAgendamentoUruguay';
      if (isPedidoAg && isBrasil) return 'pedidoAgendadoBrasil';
      if (isPedidoAg && isUruguay) return 'pedidoAgendadoUruguay';
      return null;
    };

    const fetchAll = async () => {
      const { data: tagRows } = await supabase.from('tags').select('id, name');
      const buckets: Record<Bucket, string[]> = {
        enderecoBrasil: [],
        enderecoUruguay: [],
        confirmacaoBrasil: [],
        confirmacaoUruguay: [],
        fazerAgendamentoBrasil: [],
        fazerAgendamentoUruguay: [],
        pedidoAgendadoBrasil: [],
        pedidoAgendadoUruguay: [],
      };
      for (const t of tagRows || []) {
        const bucket = classify(t.name || '');
        if (bucket) buckets[bucket].push(t.id);
      }

      const countBucket = async (ids: string[]) => {
        if (ids.length === 0) return 0;
        const { count } = await supabase
          .from('contact_tags')
          .select('id', { count: 'exact', head: true })
          .in('tag_id', ids);
        return count || 0;
      };

      const keys = Object.keys(buckets) as Bucket[];
      const results = await Promise.all(keys.map(k => countBucket(buckets[k])));

      if (cancelled) return;
      const next = { loading: false } as PendingCounts;
      keys.forEach((k, i) => { (next as any)[k] = results[i]; });
      setCounts(next);
    };

    fetchAll();

    const channel = supabase
      .channel('pending-tag-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_tags' },
        () => { fetchAll(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  void country;
  return counts;
}
