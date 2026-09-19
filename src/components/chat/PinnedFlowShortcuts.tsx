import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { GitBranch, Loader2, Pin, Search, Settings2, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface PinnedFlow {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
  pinned_sectors: string[] | null;
}

interface Props {
  conversationId: string;
  sector?: string | null;
}

const UNCATEGORIZED = 'Sem categoria';
const LS_KEY_PREFIX = 'pinnedFlows.activeCategory.';

export default function PinnedFlowShortcuts({ conversationId, sector }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [flows, setFlows] = useState<PinnedFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const activeSector = sector || 'comercial';
  const lsKey = LS_KEY_PREFIX + activeSector;
  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    try { return localStorage.getItem(lsKey); } catch { return null; }
  });
  const [executing, setExecuting] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [flowSearch, setFlowSearch] = useState('');
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const selectCategory = (label: string) => {
    setActiveCategory(label);
    try { localStorage.setItem(lsKey, label); } catch {}
  };

  const fetchFlows = async () => {
    setLoading(true);
    let query: any = supabase
      .from('automation_flows')
      .select('id, name, category, is_active, pinned_sectors')
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

  // Reload preferred category when sector changes
  useEffect(() => {
    try { setActiveCategory(localStorage.getItem(lsKey)); } catch {}
  }, [lsKey]);

  const sectorFlows = useMemo(() => {
    return flows.filter((f) => {
      const sectors = f.pinned_sectors || [];
      // Backward compat: no sectors set → treat as comercial
      if (sectors.length === 0) return activeSector === 'comercial';
      return sectors.includes(activeSector);
    });
  }, [flows, activeSector]);

  const searchedFlows = useMemo(() => {
    const term = flowSearch.trim().toLocaleLowerCase('pt-BR');
    if (!term) return flows;
    return flows.filter((flow) =>
      `${flow.name} ${flow.category || ''}`.toLocaleLowerCase('pt-BR').includes(term),
    );
  }, [flowSearch, flows]);

  const togglePinnedFlow = async (flow: PinnedFlow) => {
    if (savingIds.includes(flow.id)) return;

    const currentSectors = flow.pinned_sectors || [];
    const isPinned = currentSectors.includes(activeSector);
    const nextSectors = isPinned
      ? currentSectors.filter((item) => item !== activeSector)
      : [...currentSectors, activeSector];

    setSavingIds((current) => [...current, flow.id]);
    const { error } = await supabase
      .from('automation_flows')
      .update({
        pinned_sectors: nextSectors,
        is_pinned_sidebar: nextSectors.length > 0,
      } as any)
      .eq('id', flow.id);

    if (error) {
      toast.error('Não foi possível atualizar o atalho');
    } else {
      setFlows((current) => current.map((item) => (
        item.id === flow.id ? { ...item, pinned_sectors: nextSectors } : item
      )));
      toast.success(isPinned ? 'Fluxo removido dos atalhos' : 'Fluxo anexado aos atalhos');
    }
    setSavingIds((current) => current.filter((id) => id !== flow.id));
  };

  const grouped = useMemo(() => {
    const map: Record<string, PinnedFlow[]> = {};
    sectorFlows.forEach((f) => {
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
  }, [sectorFlows]);

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
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3 w-3" /> Atalhos de Automação
        </p>
        {!loading && flows.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => setManageOpen(true)}
            title="Escolher fluxos"
            aria-label="Escolher fluxos"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-background/50 p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : sectorFlows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-center">
          <Pin className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">Nenhum fluxo anexado neste setor.</p>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => setManageOpen(true)}>
            <Pin className="h-3.5 w-3.5" /> Escolher fluxos
          </Button>
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

      <Dialog open={manageOpen} onOpenChange={(open) => {
        setManageOpen(open);
        if (!open) setFlowSearch('');
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-3 p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-base">Escolher fluxos</DialogTitle>
            <DialogDescription className="text-xs">
              Selecione os atalhos que aparecerão em {activeSector === 'cobranca' ? 'Cobrança' : activeSector === 'pos_venda' ? 'Pós-Venda' : 'Comercial'}.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={flowSearch}
              onChange={(event) => setFlowSearch(event.target.value)}
              placeholder="Buscar fluxo ou categoria..."
              className="h-9 pl-9 text-sm"
              autoFocus
            />
          </div>

          <div className="max-h-[min(420px,55vh)] space-y-1 overflow-y-auto pr-1">
            {searchedFlows.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {flows.length === 0 ? 'Nenhum fluxo criado.' : 'Nenhum fluxo encontrado.'}
              </div>
            ) : searchedFlows.map((flow) => {
              const checked = (flow.pinned_sectors || []).includes(activeSector);
              const saving = savingIds.includes(flow.id);
              return (
                <label
                  key={flow.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-secondary/60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Checkbox checked={checked} onCheckedChange={() => togglePinnedFlow(flow)} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{flow.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {flow.category?.trim() || 'Sem categoria'}{flow.is_active ? '' : ' · Inativo'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
