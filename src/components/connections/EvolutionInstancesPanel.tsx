import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, RefreshCw, Trash2, QrCode, Zap, X, CheckCircle2, AlertCircle, Webhook } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

interface EvoInstance {
  name?: string;
  instanceName?: string;
  instance?: { instanceName?: string; state?: string; profileName?: string; owner?: string };
  connectionStatus?: string;
  status?: string;
  state?: string;
  ownerJid?: string;
  owner?: string;
  profileName?: string;
  number?: string;
}

interface Props {
  workspaceId?: string;
}

export default function EvolutionInstancesPanel({ workspaceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrInstance, setQrInstance] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-manager', {
        body: { action: 'list' },
      });
      if (error) throw error;
      const list = Array.isArray(data?.instances) ? data.instances : [];
      setInstances(list);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao listar instâncias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error('Informe um nome'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { toast.error('Use apenas letras, números, _ e -'); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-manager', {
        body: { action: 'create', instanceName: name, workspaceId },
      });
      if (error) throw error;
      toast.success('Instância criada!');
      setCreateOpen(false);
      setNewName('');
      // Open QR right away
      const qr = data?.qrcode;
      if (qr) {
        setQrImage(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr.replace(/^data:image\/png;base64,/, '')}`);
        setQrInstance(name);
        setQrOpen(true);
      } else {
        await openQr(name);
      }
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar');
    } finally {
      setCreating(false);
    }
  };

  const openQr = async (name: string) => {
    setQrInstance(name);
    setQrImage(null);
    setQrOpen(true);
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-manager', {
        body: { action: 'qr', instanceName: name },
      });
      if (error) throw error;
      const qr = data?.qrcode;
      if (qr) {
        setQrImage(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr.replace(/^data:image\/png;base64,/, '')}`);
      } else {
        toast.info('QR não disponível (talvez já conectado)');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao obter QR');
    } finally {
      setQrLoading(false);
    }
  };

  const checkStatus = async (name: string) => {
    setBusy(b => ({ ...b, [name]: true }));
    try {
      const { data, error } = await supabase.functions.invoke('evolution-manager', {
        body: { action: 'status', instanceName: name },
      });
      if (error) throw error;
      toast.success(`Status: ${data?.state || 'desconhecido'}`);
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao verificar');
    } finally {
      setBusy(b => ({ ...b, [name]: false }));
    }
  };

  const removeInstance = async (name: string) => {
    if (!confirm(`Excluir instância "${name}"? Esta ação não pode ser desfeita.`)) return;
    setBusy(b => ({ ...b, [name]: true }));
    try {
      const { error } = await supabase.functions.invoke('evolution-manager', {
        body: { action: 'delete', instanceName: name },
      });
      if (error) throw error;
      toast.success('Instância excluída');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir');
    } finally {
      setBusy(b => ({ ...b, [name]: false }));
    }
  };

  const getName = (i: EvoInstance) =>
    i.name || i.instanceName || i.instance?.instanceName || '';
  const getState = (i: EvoInstance) =>
    i.connectionStatus || i.status || i.state || i.instance?.state || 'unknown';
  const getPhone = (i: EvoInstance) => {
    const owner = i.ownerJid || i.owner || i.instance?.owner || i.number || '';
    return owner.replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '') || '—';
  };
  const getProfile = (i: EvoInstance) =>
    i.profileName || i.instance?.profileName || '';

  const stateBadge = (state: string) => {
    const s = state.toLowerCase();
    if (s === 'open' || s === 'connected') {
      return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"><CheckCircle2 className="h-3 w-3" />Conectado</span>;
    }
    if (s === 'connecting' || s === 'qr_required') {
      return <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"><QrCode className="h-3 w-3" />Aguardando QR</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 text-red-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"><AlertCircle className="h-3 w-3" />{state}</span>;
  };

  return (
    <div className="mt-8 rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Evolution API</h3>
            <p className="text-xs text-muted-foreground">
              {instances.length} {instances.length === 1 ? 'instância' : 'instâncias'} no servidor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-input px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar instância
          </button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhuma instância no servidor. Clique em "Criar instância" para começar.
          </div>
        ) : (
          <div className="space-y-2">
            {instances.map((i, idx) => {
              const name = getName(i);
              const state = getState(i);
              const phone = getPhone(i);
              const profile = getProfile(i);
              const isBusy = busy[name];
              return (
                <div key={`${name}-${idx}`} className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground truncate">{name || '—'}</p>
                      {stateBadge(state)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {profile && <span className="mr-2">{profile}</span>}
                      <span className="font-mono">{phone}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openQr(name)}
                      disabled={isBusy}
                      title="Gerar QR Code"
                      className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <QrCode className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => checkStatus(name)}
                      disabled={isBusy}
                      title="Verificar status"
                      className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => removeInstance(name)}
                      disabled={isBusy}
                      title="Excluir instância"
                      className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setNewName(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar nova instância</DialogTitle>
            <DialogDescription>
              O webhook será configurado automaticamente. Após criar, escaneie o QR Code para conectar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome da instância</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="ex: vendas01"
                className="w-full rounded-xl border border-input bg-background py-2.5 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
              />
              <p className="text-xs text-muted-foreground">Apenas letras, números, _ e -</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="flex-1 rounded-xl border border-input px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? 'Criando...' : 'Criar'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code — {qrInstance}</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrLoading ? (
              <div className="h-64 w-64 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : qrImage ? (
              <img src={qrImage} alt="QR Code" className="h-64 w-64 rounded-xl bg-white p-2" />
            ) : (
              <div className="h-64 w-64 flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                QR não disponível. Verifique o status.
              </div>
            )}
            <div className="flex gap-2 w-full">
              <button
                onClick={() => qrInstance && openQr(qrInstance)}
                disabled={qrLoading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-input px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar QR
              </button>
              <button
                onClick={() => qrInstance && checkStatus(qrInstance)}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Verificar status
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
