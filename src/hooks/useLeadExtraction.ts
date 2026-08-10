import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { parseAdOrigin, originKey, type AdOrigin } from '@/lib/adNiche';

export interface LeadRow {
  id: string;
  contact_name: string;
  contact_phone: string;
  ad_title: string | null;
  created_at: string;
  origin: AdOrigin;
  key: string;
}

const PAGE = 1000;
const MAX_ROWS = 60000;

async function fetchLeads(workspaceId: string | null, from: string | null, to: string | null): Promise<LeadRow[]> {
  const rows: LeadRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase
      .from('conversations')
      .select('id, contact_name, contact_phone, ad_title, created_at')
      .not('contact_phone', 'like', '%-group')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (workspaceId) q = q.eq('workspace_id', workspaceId);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const c of data) {
      const origin = parseAdOrigin(c.ad_title);
      rows.push({
        id: c.id,
        contact_name: c.contact_name,
        contact_phone: c.contact_phone,
        ad_title: c.ad_title,
        created_at: c.created_at,
        origin,
        key: originKey(origin),
      });
    }
    if (data.length < PAGE) break;
  }
  return rows;
}

export function useLeadExtraction(from: string | null, to: string | null) {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id ?? null;

  return useQuery({
    queryKey: ['lead-extraction', wsId, from, to],
    queryFn: () => fetchLeads(wsId, from, to),
    enabled: !!wsId,
    staleTime: 1000 * 60 * 2,
  });
}
