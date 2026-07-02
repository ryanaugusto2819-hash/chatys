import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { GitBranch, Plus, Play, Pause, Trash2, Loader2, BarChart3, Copy, Tag, Pencil, FolderOpen, Pin, PinOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FlowRow {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  category: string | null;
  is_pinned_sidebar?: boolean;
}

const UNCATEGORIZED = '__sem_categoria__';

export default function Automation() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState('');
  const { currentWorkspace } = useWorkspace();

  const fetchFlows = async () => {
    let query = supabase
      .from('automation_flows')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentWorkspace) {
      query = (query as any).eq('workspace_id', currentWorkspace.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching flows:', error);
    } else {
      setFlows((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFlows();

    const channel = supabase
      .channel('automation-flows-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_flows' }, () => {
        fetchFlows();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentWorkspace?.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    flows.forEach((f) => { if (f.category && f.category.trim()) set.add(f.category.trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [flows]);

  const filteredFlows = useMemo(() => {
    if (filter === 'all') return flows;
    if (filter === UNCATEGORIZED) return flows.filter((f) => !f.category || !f.category.trim());
    return flows.filter((f) => f.category === filter);
  }, [flows, filter]);

  const groupedFlows = useMemo(() => {
    const groups: Record<string, FlowRow[]> = {};
    filteredFlows.forEach((f) => {
      const key = (f.category && f.category.trim()) || UNCATEGORIZED;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    // Sort: named categories alphabetically, uncategorized at the end
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
    return sortedKeys.map((k) => ({ key: k, label: k === UNCATEGORIZED ? 'Sem categoria' : k, items: groups[k] }));
  }, [filteredFlows]);

  const createFlow = async () => {
    const { data, error } = await supabase
      .from('automation_flows')
      .insert({
        name: 'Novo Fluxo',
        description: '',
        ...(currentWorkspace?.id ? { workspace_id: currentWorkspace.id } : {}),
        ...(filter !== 'all' && filter !== UNCATEGORIZED ? { category: filter } : {}),
      } as any)
      .select('id')
      .single();

    if (error) {
      toast.error('Erro ao criar fluxo');
      return;
    }
    navigate(`/automation/${data.id}`);
  };

  const toggleFlow = async (flow: FlowRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from('automation_flows')
      .update({ is_active: !flow.is_active })
      .eq('id', flow.id);

    if (error) toast.error('Erro ao atualizar fluxo');
  };

  const saveCategory = async (flowId: string) => {
    const value = categoryInput.trim();
    const { error } = await supabase
      .from('automation_flows')
      .update({ category: value || null } as any)
      .eq('id', flowId);
    if (error) toast.error('Erro ao salvar categoria');
    else toast.success(value ? `Categoria definida: ${value}` : 'Categoria removida');
    setEditingCategoryFor(null);
    setCategoryInput('');
  };

  const duplicateFlow = async (flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data: original, error: flowErr } = await supabase
        .from('automation_flows')
        .select('*')
        .eq('id', flowId)
        .single();
      if (flowErr || !original) throw flowErr;

      const { data: newFlow, error: insertErr } = await supabase
        .from('automation_flows')
        .insert({
          name: `${original.name} (cópia)`,
          description: original.description,
          is_active: false,
          manual_only: original.manual_only,
          niche_id: original.niche_id,
          category: (original as any).category ?? null,
        } as any)
        .select('id')
        .single();
      if (insertErr || !newFlow) throw insertErr;

      const { data: origNodes } = await supabase
        .from('automation_nodes')
        .select('*')
        .eq('flow_id', flowId)
        .order('sort_order');

      const nodeIdMap: Record<string, string> = {};

      if (origNodes && origNodes.length > 0) {
        const nodeInserts = origNodes.map((n: any) => {
          const newId = crypto.randomUUID();
          nodeIdMap[n.id] = newId;
          return {
            id: newId,
            flow_id: newFlow.id,
            node_type: n.node_type,
            label: n.label,
            config: n.config,
            position_x: n.position_x,
            position_y: n.position_y,
            sort_order: n.sort_order,
          };
        });
        await supabase.from('automation_nodes').insert(nodeInserts);
      }

      const { data: origEdges } = await supabase
        .from('automation_edges')
        .select('*')
        .eq('flow_id', flowId);

      if (origEdges && origEdges.length > 0) {
        const edgeInserts = origEdges
          .filter((e: any) => nodeIdMap[e.source_node_id] && nodeIdMap[e.target_node_id])
          .map((e: any) => ({
            flow_id: newFlow.id,
            source_node_id: nodeIdMap[e.source_node_id],
            target_node_id: nodeIdMap[e.target_node_id],
          }));
        if (edgeInserts.length > 0) {
          await supabase.from('automation_edges').insert(edgeInserts);
        }
      }

      toast.success('Fluxo duplicado com sucesso');
    } catch (err) {
      console.error('Duplicate error:', err);
      toast.error('Erro ao duplicar fluxo');
    }
  };

  const deleteFlow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from('automation_flows')
      .delete()
      .eq('id', id);

    if (error) toast.error('Erro ao excluir fluxo');
    else toast.success('Fluxo excluído');
  };

  return (
    <div>
      <TopBar title="Automação" subtitle={`${flows.length} fluxos · ${categories.length} categorias`} />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="h-3 w-3" />
              Todas ({flows.length})
            </button>
            {categories.map((cat) => {
              const count = flows.filter((f) => f.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Tag className="h-3 w-3" />
                  {cat} ({count})
                </button>
              );
            })}
            {flows.some((f) => !f.category || !f.category.trim()) && (
              <button
                onClick={() => setFilter(UNCATEGORIZED)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === UNCATEGORIZED ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                Sem categoria ({flows.filter((f) => !f.category || !f.category.trim()).length})
              </button>
            )}
          </div>
          <button
            onClick={createFlow}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo Fluxo
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <GitBranch className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum fluxo criado</p>
            <p className="text-xs text-muted-foreground mt-1">Crie seu primeiro fluxo de automação</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedFlows.map((group) => (
              <div key={group.key} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border/50 pb-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">({group.items.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {group.items.map((flow, i) => (
                    <motion.div
                      key={flow.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      onClick={() => navigate(`/automation/${flow.id}`)}
                      className="rounded-xl border border-border bg-card p-5 shadow-elevated cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                            <GitBranch className="h-5 w-5 text-accent-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-card-foreground">{flow.name}</p>
                            <p className="text-xs text-muted-foreground">{flow.description || 'Sem descrição'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/automation/${flow.id}/metrics`); }}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Métricas do Funil"
                          >
                            <BarChart3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => duplicateFlow(flow.id, e)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Duplicar Fluxo"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => deleteFlow(flow.id, e)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Category row */}
                      <div onClick={(e) => e.stopPropagation()} className="mb-3">
                        {editingCategoryFor === flow.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              type="text"
                              list={`cats-${flow.id}`}
                              value={categoryInput}
                              onChange={(e) => setCategoryInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCategory(flow.id);
                                if (e.key === 'Escape') { setEditingCategoryFor(null); setCategoryInput(''); }
                              }}
                              placeholder="Nome do nicho/categoria"
                              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                            />
                            <datalist id={`cats-${flow.id}`}>
                              {categories.map((c) => <option key={c} value={c} />)}
                            </datalist>
                            <button
                              onClick={() => saveCategory(flow.id)}
                              className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => { setEditingCategoryFor(null); setCategoryInput(''); }}
                              className="text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingCategoryFor(flow.id); setCategoryInput(flow.category || ''); }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                          >
                            {flow.category ? (
                              <>
                                <Tag className="h-3 w-3" />
                                <span className="font-medium text-foreground">{flow.category}</span>
                                <Pencil className="h-2.5 w-2.5 opacity-60" />
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" />
                                Adicionar categoria
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{flow.trigger_count} disparos</span>
                          <span>{formatDistanceToNow(new Date(flow.updated_at), { addSuffix: true, locale: ptBR })}</span>
                        </div>
                        <button
                          onClick={(e) => toggleFlow(flow, e)}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                            flow.is_active ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {flow.is_active ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                          {flow.is_active ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
