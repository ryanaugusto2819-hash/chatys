import { useState, useEffect, useCallback } from 'react';
import TopBar from '@/components/layout/TopBar';
import ConnectionCard from '@/components/connections/ConnectionCard';
import AddConnectionDialog from '@/components/connections/AddConnectionDialog';
import EvolutionInstancesPanel from '@/components/connections/EvolutionInstancesPanel';
import { Plug, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface ConnectionData {
  id: string;
  connection_id: string;
  label: string;
  config: Record<string, string>;
  is_connected: boolean;
  status: string;
  last_checked_at: string | null;
  status_since: string | null;
  workspace_id: string | null;
}

export default function Connections() {
  const [connections, setConnections] = useState<ConnectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const { currentWorkspace } = useWorkspace();

  const loadConnections = useCallback(async () => {
    try {
      let query = supabase
        .from('connection_configs')
        .select('*')
        .order('created_at', { ascending: true });

      if (currentWorkspace) {
        query = (query as any).eq('workspace_id', currentWorkspace.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      setConnections(
        (data || []).map((d: any) => ({
          id: d.id,
          connection_id: d.connection_id,
          label: d.label || '',
          config: (d.config as Record<string, string>) || {},
          is_connected: d.is_connected,
          status: d.status || 'unknown',
          last_checked_at: d.last_checked_at,
          status_since: d.status_since ?? null,
          workspace_id: d.workspace_id,
        }))
      );
    } catch {
      toast.error('Erro ao carregar conexões.');
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleCheckAll = async () => {
    if (connections.length === 0) return;
    setCheckingAll(true);
    try {
      await Promise.all(
        connections.map(c =>
          supabase.functions.invoke('check-connection-status', { body: { configId: c.id } })
        )
      );
      await loadConnections();
      toast.success('Status de todas as conexões atualizado!');
    } catch {
      toast.error('Erro ao verificar status.');
    } finally {
      setCheckingAll(false);
    }
  };

  return (
    <div>
      <TopBar title="Conexões" subtitle="Gerencie seus canais de WhatsApp" />
      <div className="p-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {connections.length} {connections.length === 1 ? 'conexão configurada' : 'conexões configuradas'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connections.length > 0 && (
              <button
                onClick={handleCheckAll}
                disabled={checkingAll}
                className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
              >
                {checkingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Verificar Todos
              </button>
            )}
            <AddConnectionDialog onCreated={loadConnections} workspaceId={currentWorkspace?.id} />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Connection Cards */}
        {!loading && connections.length > 0 && (
          <div className="space-y-4">
            {connections.map(conn => (
              <ConnectionCard
                key={conn.id}
                connection={conn}
                onDeleted={loadConnections}
                onUpdated={loadConnections}
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && connections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <Plug className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-card-foreground mb-1">Nenhuma conexão configurada</p>
            <p className="text-xs text-muted-foreground mb-4">
              Adicione uma conexão WhatsApp para começar a receber mensagens.
            </p>
            <AddConnectionDialog onCreated={loadConnections} workspaceId={currentWorkspace?.id} />
          </div>
        )}

        {/* Coming Soon */}
        <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
          <Plug className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Mais integrações em breve — Instagram, Telegram, Email e mais.
          </p>
        </div>
      </div>
    </div>
  );
}
