import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '@/components/layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { GitBranch, Plus, Play, Pause, Trash2, Loader2, BarChart3, Copy } from 'lucide-react';
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
}

export default function Automation() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
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
      setFlows(data || []);
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

  const createFlow = async () => {
    const { data, error } = await supabase
      .from('automation_flows')
      .insert({
        name: 'Novo Fluxo',
        description: '',
        ...(currentWorkspace?.id ? { workspace_id: currentWorkspace.id } : {}),
      })
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

  const duplicateFlow = async (flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // 1. Get original flow
      const { data: original, error: flowErr } = await supabase
        .from('automation_flows')
        .select('*')
        .eq('id', flowId)
        .single();
      if (flowErr || !original) throw flowErr;

      // 2. Create copy
      const { data: newFlow, error: insertErr } = await supabase
        .from('automation_flows')
        .insert({
          name: `${original.name} (cópia)`,
          description: original.description,
          is_active: false,
          manual_only: original.manual_only,
          niche_id: original.niche_id,
        })
        .select('id')
        .single();
      if (insertErr || !newFlow) throw insertErr;

      // 3. Copy nodes
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

      // 4. Copy edges with mapped node IDs
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
      <TopBar title="Automação" subtitle={`${flows.length} fluxos criados`} />
      <div className="p-6 space-y-4">
        <div className="flex justify-end">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {flows.map((flow, i) => (
              <motion.div
                key={flow.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
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
        )}
      </div>
    </div>
  );
}
