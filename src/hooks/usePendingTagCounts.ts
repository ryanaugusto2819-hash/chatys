import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CountryFilter = 'all' | 'brasil' | 'uruguay';

interface PendingCounts {
  enderecoBrasil: number;
  enderecoUruguay: number;
  confirmacaoBrasil: number;
  confirmacaoUruguay: number;
  loading: boolean;
}

/**
 * Real-time counts of contacts with "endereço pendente" and "confirmação pendente"
 * tags, split by country. Names are matched by pattern so the counters keep working
 * even if tag IDs change; matches only tags whose name contains BOTH the topic and
 * the country marker plus "PENDENTE"/"PEDENTE".
 */
export function usePendingTagCounts(country: CountryFilter = 'all'): PendingCounts {
  const [counts, setCounts] = useState<PendingCounts>({
    enderecoBrasil: 0,
    enderecoUruguay: 0,
    confirmacaoBrasil: 0,
    confirmacaoUruguay: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const classify = (rawName: string): keyof Omit<PendingCounts, 'loading'> | null => {
      const n = rawName.toUpperCase();
      const isPending = n.includes('PENDENTE') || n.includes('PEDENTE');
      if (!isPending) return null;
      const isEndereco = n.includes('ENDERE');
      const isConfirmacao = n.includes('CONFIRMA');
      const isBrasil = n.includes('BRASIL') || n.includes('BRAZIL') || / BR([^A-Z]|$)/.test(n);
      const isUruguay = n.includes('URUGUAY') || n.includes('URUGUAI') || n.includes('UY');
      if (isEndereco && isBrasil) return 'enderecoBrasil';
      if (isEndereco && isUruguay) return 'enderecoUruguay';
      if (isConfirmacao && isBrasil) return 'confirmacaoBrasil';
      if (isConfirmacao && isUruguay) return 'confirmacaoUruguay';
      return null;
    };

    const fetchAll = async () => {
      // 1. Get all matching tag IDs grouped by bucket
      const { data: tagRows } = await supabase.from('tags').select('id, name');
      const buckets: Record<keyof Omit<PendingCounts, 'loading'>, string[]> = {
        enderecoBrasil: [],
        enderecoUruguay: [],
        confirmacaoBrasil: [],
        confirmacaoUruguay: [],
      };
      for (const t of tagRows || []) {
        const bucket = classify(t.name || '');
        if (bucket) buckets[bucket].push(t.id);
      }

      // 2. Count contact_tags per bucket in parallel
      const countBucket = async (ids: string[]) => {
        if (ids.length === 0) return 0;
        const { count } = await supabase
          .from('contact_tags')
          .select('id', { count: 'exact', head: true })
          .in('tag_id', ids);
        return count || 0;
      };

      const [eBr, eUy, cBr, cUy] = await Promise.all([
        countBucket(buckets.enderecoBrasil),
        countBucket(buckets.enderecoUruguay),
        countBucket(buckets.confirmacaoBrasil),
        countBucket(buckets.confirmacaoUruguay),
      ]);

      if (cancelled) return;
      setCounts({
        enderecoBrasil: eBr,
        enderecoUruguay: eUy,
        confirmacaoBrasil: cBr,
        confirmacaoUruguay: cUy,
        loading: false,
      });
    };

    fetchAll();

    // 3. Realtime: refresh whenever any contact_tag row changes
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

  // Country filter is applied at render time — counts are always computed for both.
  void country;
  return counts;
}
