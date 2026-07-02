import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { GitBranch, Loader2, Pin, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface PinnedFlow {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
}

interface Props {
  conversationId: string;
  preferredCategory?: string | null;
}

const UNCATEGORIZED = 'Sem categoria';
const LS_KEY = 'pinnedFlows.activeCategory';

export default function PinnedFlowShortcuts({ conversationId, preferredCategory }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [flows, setFlows] = useState<PinnedFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  });
  const [executing, setExecuting] = useState<string | null>(null);

  const selectCategory = (label: string) => {
    setActiveCategory(label);
    try { localStorage.setItem(LS_KEY, label); } catch {}
  };

  const fetchFlows = async () => {
    setLoading(true);
    let query: any = supabase
      .from('automation_flows')
      .select('id, name, category, is_active')
      .eq('is_pinned_sidebar', true)
      .order('name');

    if (currentWorkspace) {
      query = query.eq('workspace_id', currentWorkspace.id);
    }

    const { data } = await query;
    setFlows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFlows();
    const channel = supabase
      .channel('pinned-flows-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_flows' }, () => {
        fetchFlows();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const grouped = useMemo(() => {
    const map: Record<string, PinnedFlow[]> = {};
    flows.forEach((f) => {
      const key = (f.category && f.category.trim()) || UNCATEGORIZED;
      if (!map[key]) map[key] = [];
      map[key].push(f);
    });
    return Object.entries(map)
      .sort(([a], [b]) => {
        if (a === UNCATEGORIZED) return 1;
        if (b === UNCATEGORIZED) return -1;
        return a.localeCompare(b);
      })
      .map(([label, items]) => ({ label, items }));
  }, [flows]);

  useEffect(() => {
    if (grouped.length === 0) return;
    if (!activeCategory || !grouped.some(g => g.label === activeCategory)) {
      selectCategory(grouped[0].label);
    }
  }, [grouped, activeCategory]);

  const runFlow = async (flow: PinnedFlow) => {
    if (executing) return;
    setExecuting(flow.id);
    try {
      const { data, error } = await supabase.functions.invoke('execute-flow', {
        body: { flowId: flow.id, conversationId, senderLabel: 'humano' },
      });
      if (error) {
        toast.error('Erro ao disparar fluxo: ' + (error.message || 'desconhecido'));
        return;
      }
      if (data?.success === false) {
        toast.error('Falha: ' + (data?.error || 'desconhecido'));
        return;
      }
      toast.success(`▶ ${flow.name}`);
    } catch (err: any) {
      toast.error('Erro ao disparar fluxo');
    } finally {
      setExecuting(null);
    }
  };

  const activeItems = grouped.find(g => g.label === activeCategory)?.items || [];

  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Zap className="h-3 w-3" /> Atalhos de Automação
      </p>

      {loading ? (
        <div className="rounded-lg border border-border bg-background/50 p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : flows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-center">
          <Pin className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Nenhum fluxo fixado. Vá em <span className="font-medium text-foreground">Automação</span> e clique no
            <Pin className="inline h-2.5 w-2.5 mx-1" />
            para fixar aqui por categoria.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background/50 p-2 space-y-2">
          {/* Category tabs */}
          {grouped.length > 1 && (
            <div className="flex flex-wrap gap-1 px-1 pt-1">
              {grouped.map(g => (
                <button
                  key={g.label}
                  onClick={() => selectCategory(g.label)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    activeCategory === g.label
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g.label}
                  <span className="ml-1 opacity-60">{g.items.length}</span>
                </button>
              ))}
            </div>
          )}

          {/* Flow chips */}
          <div className="grid grid-cols-1 gap-1.5 p-1">
            {activeItems.map((f) => {
              const busy = executing === f.id;
              return (
                <motion.button
                  key={f.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => runFlow(f)}
                  disabled={!!executing}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  title={f.is_active ? 'Clique para disparar' : 'Fluxo inativo — ainda pode ser disparado manualmente'}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3" />}
                  </div>
                  <span className="text-[11px] font-medium text-card-foreground truncate flex-1">{f.name}</span>
                  {!f.is_active && (
                    <span className="text-[9px] text-muted-foreground shrink-0">inativo</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
