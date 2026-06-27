import { useState, useEffect, useCallback } from 'react';
import TopBar from '@/components/layout/TopBar';
import ConnectionCard from '@/components/connections/ConnectionCard';
import AddConnectionDialog from '@/components/connections/AddConnectionDialog';
import EvolutionInstancesPanel from '@/components/connections/EvolutionInstancesPanel';
import { Plug, Loader2, RefreshCw, Trash2, X, CheckSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === connections.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(connections.map(c => c.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let ok = 0;
    let fail = 0;
    let totalConvos = 0;
    try {
      const results = await Promise.allSettled(
        ids.map(id =>
          supabase.functions.invoke('save-connection', {
            body: { action: 'delete', id },
          })
        )
      );
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          const resp = (r.value as any)?.data as { error?: string; deletedConversations?: number } | undefined;
          if (resp?.error || (r.value as any)?.error) {
            fail++;
          } else {
            ok++;
            totalConvos += resp?.deletedConversations ?? 0;
          }
        } else {
          fail++;
        }
      });
      if (ok > 0) toast.success(`${ok} ${ok === 1 ? 'conexão excluída' : 'conexões excluídas'} (${totalConvos} conversas removidas)`);
      if (fail > 0) toast.error(`${fail} ${fail === 1 ? 'conexão falhou' : 'conexões falharam'} ao excluir`);
      exitSelectionMode();
      await loadConnections();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir conexões.');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div>
      <TopBar title="Conexões" subtitle="Gerencie seus canais de WhatsApp" />
      <div className="p-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">
              {selectionMode
                ? `${selectedIds.size} ${selectedIds.size === 1 ? 'selecionada' : 'selecionadas'} de ${connections.length}`
                : `${connections.length} ${connections.length === 1 ? 'conexão configurada' : 'conexões configuradas'}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectionMode ? (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <CheckSquare className="h-4 w-4" />
                  {selectedIds.size === connections.length ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={selectedIds.size === 0 || bulkDeleting}
                      className="flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
                    >
                      {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Excluir ({selectedIds.size})
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir {selectedIds.size} {selectedIds.size === 1 ? 'conexão' : 'conexões'}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Todas as conversas, mensagens e dados vinculados a estas conexões serão removidos permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  onClick={exitSelectionMode}
                  className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              </>
            ) : (
              <>
                {connections.length > 0 && (
                  <>
                    <button
                      onClick={() => setSelectionMode(true)}
                      className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <CheckSquare className="h-4 w-4" />
                      Selecionar
                    </button>
                    <button
                      onClick={handleCheckAll}
                      disabled={checkingAll}
                      className="flex items-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {checkingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Verificar Todos
                    </button>
                  </>
                )}
                <AddConnectionDialog onCreated={loadConnections} workspaceId={currentWorkspace?.id} />
              </>
            )}
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
            {connections.map(conn => {
              const isSelected = selectedIds.has(conn.id);
              return (
                <div key={conn.id} className="flex items-start gap-3">
                  {selectionMode && (
                    <button
                      onClick={() => toggleSelect(conn.id)}
                      className={`mt-5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-input bg-background hover:border-primary'
                      }`}
                      aria-label={isSelected ? 'Desmarcar' : 'Selecionar'}
                    >
                      {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <div
                    className={`flex-1 min-w-0 ${selectionMode ? 'cursor-pointer' : ''} ${
                      isSelected ? 'ring-2 ring-primary rounded-2xl' : ''
                    }`}
                    onClick={selectionMode ? () => toggleSelect(conn.id) : undefined}
                  >
                    <div className={selectionMode ? 'pointer-events-none' : ''}>
                      <ConnectionCard
                        connection={conn}
                        onDeleted={loadConnections}
                        onUpdated={loadConnections}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
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

        {/* Evolution API Instances */}
        <EvolutionInstancesPanel workspaceId={currentWorkspace?.id} />

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
