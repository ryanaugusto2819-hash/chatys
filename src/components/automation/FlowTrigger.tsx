import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { executeFlow } from '@/lib/automation';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { GitBranch, Loader2, X, Search } from 'lucide-react';
import { toast } from 'sonner';

interface FlowOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface FlowTriggerProps {
  conversationId: string;
  nicheId: string | null;
}

export default function FlowTrigger({ conversationId, nicheId }: FlowTriggerProps) {
  const [open, setOpen] = useState(false);
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [executing, setExecuting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return flows;
    const q = search.toLowerCase();
    return flows.filter(f => f.name.toLowerCase().includes(q));
  }, [flows, search]);

  useEffect(() => {
    if (open) {
      supabase
        .from('automation_flows')
        .select('id, name, is_active')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .then(({ data }) => setFlows(data || []));
    }
  }, [open]);

  const trigger = async (flowId: string) => {
    setExecuting(flowId);
    try {
      const { data, error } = await supabase.functions.invoke("execute-flow", {
        body: { flowId, conversationId, senderLabel: "humano" },
      });

      if (error) {
        console.error('Flow execution error:', error);
        toast.error('Erro ao disparar fluxo: ' + (error.message || 'Erro desconhecido'));
        return;
      }

      if (data?.success === false) {
        toast.error('Falha ao executar fluxo: ' + (data?.error || 'Erro desconhecido'));
        return;
      }

      toast.success('Fluxo disparado com sucesso');
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao disparar fluxo');
    } finally {
      setExecuting(null);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Disparar automação"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
      >
        <GitBranch className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="absolute bottom-16 left-4 right-4 rounded-xl border border-border bg-card shadow-lg p-3 z-50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-card-foreground">Disparar Automação</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar fluxo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{flows.length === 0 ? 'Nenhum fluxo criado' : 'Nenhum resultado'}</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => trigger(f.id)}
              disabled={!!executing}
              className="flex items-center justify-between gap-2 w-full rounded-lg px-3 py-2 text-left text-sm text-card-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                {executing === f.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                )}
                <span className="truncate">{f.name}</span>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${f.is_active ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                {f.is_active ? 'Ativo' : 'Inativo'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
