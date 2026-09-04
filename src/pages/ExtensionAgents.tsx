import { useCallback, useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import {
  Loader2, Plus, Copy, Trash2, RefreshCw, Chrome, Download, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

interface Device {
  id: string;
  name: string;
  phone_number: string | null;
  token: string;
  status: string;
  last_seen_at: string | null;
  created_at: string;
}

interface Command {
  id: string;
  command_type: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  payload: Record<string, unknown> | null;
  device_id: string;
}

const isOnline = (d: Device) =>
  !!d.last_seen_at && Date.now() - new Date(d.last_seen_at).getTime() < 60_000;

const statusIcon = (status: string) => {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
};

const commandLabels: Record<string, string> = {
  send_text: 'Enviar texto',
  send_media: 'Enviar mídia',
  mark_read: 'Marcar como lido',
  typing: 'Simular digitação',
};

export default function ExtensionAgents() {
  const { currentWorkspace } = useWorkspace();
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const devQuery = supabase
        .from('extension_devices')
        .select('*')
        .order('created_at', { ascending: false });
      if (currentWorkspace) devQuery.eq('workspace_id', currentWorkspace.id);

      const cmdQuery = supabase
        .from('extension_commands')
        .select('id, command_type, status, error, created_at, completed_at, payload, device_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (currentWorkspace) cmdQuery.eq('workspace_id', currentWorkspace.id);

      const [dev, cmd] = await Promise.all([devQuery, cmdQuery]);
      if (dev.error) throw dev.error;
      setDevices((dev.data || []) as Device[]);
      setCommands((cmd.data || []) as Command[]);
    } catch {
      toast.error('Erro ao carregar os computadores da extensão.');
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const createDevice = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabase.from('extension_devices').insert({
        name: newName.trim(),
        token,
        workspace_id: currentWorkspace?.id ?? null,
      });
      if (error) throw error;
      toast.success('Computador criado! Copie a chave e cole na extensão.');
      setNewName('');
      setOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message || 'Erro ao criar.');
    } finally {
      setCreating(false);
    }
  };

  const removeDevice = async (id: string) => {
    const { error } = await supabase.from('extension_devices').delete().eq('id', id);
    if (error) return toast.error('Não foi possível remover.');
    toast.success('Removido.');
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Chave copiada!');
  };

  const downloadExtension = () => {
    fetch(`/chatys-extension.zip?v=1.1.1-${Date.now()}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Falha no download: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'chatys-extension.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => toast.error(err.message));
  };

  const deviceName = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.id, d.name])),
    [devices],
  );

  return (
    <div>
      <TopBar title="Extensão WhatsApp" subtitle="Envie mensagens pelo WhatsApp Web dos seus computadores" />
      <div className="p-6 space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="text-sm text-muted-foreground">
            {devices.length} {devices.length === 1 ? 'computador vinculado' : 'computadores vinculados'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExtension}>
              <Download className="h-4 w-4 mr-2" /> Baixar extensão
            </Button>
            <Button variant="outline" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Novo computador</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo computador</DialogTitle>
                  <DialogDescription>
                    Dê um nome para identificar a máquina (ex.: "PC Vendas 1"). Depois copie a chave e cole na extensão.
                  </DialogDescription>
                </DialogHeader>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="PC Vendas 1" />
                <DialogFooter>
                  <Button onClick={createDevice} disabled={creating || !newName.trim()}>
                    {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && devices.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
            <Chrome className="h-8 w-8 mx-auto mb-3" />
            Nenhum computador vinculado ainda. Crie um e instale a extensão no Chrome.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {devices.map((d) => (
            <div key={d.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.phone_number ? `Número: ${d.phone_number}` : 'Número ainda não identificado'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    isOnline(d)
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isOnline(d) ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-muted px-2 py-1.5 text-xs">
                  {d.token.slice(0, 12)}••••••
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(d.token)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => removeDevice(d.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Último sinal:{' '}
                {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('pt-BR') : 'nunca'}
              </p>
            </div>
          ))}
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-3">Últimos comandos</h2>
          <div className="rounded-xl border divide-y">
            {commands.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum comando enviado ainda.</p>
            )}
            {commands.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 text-sm">
                {statusIcon(c.status)}
                <div className="flex-1 min-w-0">
                  <p className="truncate">
                    {commandLabels[c.command_type] || c.command_type}
                    {(c.payload as any)?.phone ? ` → ${(c.payload as any).phone}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {deviceName[c.device_id] || 'Aparelho removido'} ·{' '}
                    {new Date(c.created_at).toLocaleString('pt-BR')}
                    {c.error ? ` · ${c.error}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{c.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Como instalar no Chrome</p>
          <p>1. Baixe a extensão e descompacte a pasta.</p>
          <p>2. Abra chrome://extensions e ative o "Modo do desenvolvedor".</p>
          <p>3. Clique em "Carregar sem compactação" e selecione a pasta.</p>
          <p>4. Clique no ícone da extensão, cole a chave do computador e salve.</p>
          <p>5. Deixe o WhatsApp Web aberto nessa máquina.</p>
        </div>
      </div>
    </div>
  );
}
