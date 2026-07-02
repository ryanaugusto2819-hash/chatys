import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FunnelStage {
  stage: number;
  tagName: string;
  count: number;
  uniqueContacts: number;
}

export interface FunnelGroup {
  key: string;         // e.g. "BR-EMA"
  country: string;     // BR | UY
  niche: string;       // EMA, PROSTA, ADULTO
  stages: FunnelStage[];
  total: number;       // total contacts that entered the funnel (stage 1 count)
}

// Parse tag like "ETAPA 1 (BR-EMA)" -> { stage: 1, country: 'BR', niche: 'EMA' }
const ETAPA_RE = /^ETAPA\s+(\d+)\s*\(([A-Z]{2})-([A-Z]+)\)\s*$/i;

function parseEtapa(name: string) {
  const m = name.match(ETAPA_RE);
  if (!m) return null;
  return {
    stage: parseInt(m[1], 10),
    country: m[2].toUpperCase(),
    niche: m[3].toUpperCase(),
  };
}

async function fetchFunnel(): Promise<FunnelGroup[]> {
  const { data: tags, error } = await supabase
    .from('tags')
    .select('id, name')
    .ilike('name', 'ETAPA%');
  if (error) throw error;

  const tagList = (tags ?? [])
    .map(t => ({ ...t, parsed: parseEtapa(t.name) }))
    .filter(t => t.parsed);

  const groups = new Map<string, FunnelGroup>();

  await Promise.all(
    tagList.map(async (t) => {
      const key = `${t.parsed!.country}-${t.parsed!.niche}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          country: t.parsed!.country,
          niche: t.parsed!.niche,
          stages: [],
          total: 0,
        });
      }

      // total assignments
      const { count: total } = await supabase
        .from('contact_tags')
        .select('id', { count: 'exact', head: true })
        .eq('tag_id', t.id);

      // unique contacts (fetch distinct phones)
      const { data: rows } = await supabase
        .from('contact_tags')
        .select('contact_phone')
        .eq('tag_id', t.id);
      const uniq = new Set((rows ?? []).map(r => r.contact_phone)).size;

      groups.get(key)!.stages.push({
        stage: t.parsed!.stage,
        tagName: t.name,
        count: total ?? 0,
        uniqueContacts: uniq,
      });
    })
  );

  const list = Array.from(groups.values()).map(g => {
    g.stages.sort((a, b) => a.stage - b.stage);
    g.total = g.stages[0]?.uniqueContacts ?? 0;
    return g;
  });

  list.sort((a, b) => a.key.localeCompare(b.key));
  return list;
}

export function useFunnelReport() {
  const q = useQuery({
    queryKey: ['funnel-report'],
    queryFn: fetchFunnel,
    staleTime: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel('funnel-report-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_tags' }, () => q.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [q]);

  return q;
}
