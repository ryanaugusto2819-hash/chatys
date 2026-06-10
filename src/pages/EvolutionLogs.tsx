import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Loader2, Radio, Send, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EvolutionEvent {
  id: string;
  event: string | null;
  instance_name: string | null;
  remote_jid: string | null;
  push_name: string | null;
  message_text: string | null;
  raw_payload: any;
  created_at: string;
}

const WEBHOOK_URL = `https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/evolution-webhook`;

export default function EvolutionLogs() {
  const [events, setEvents] = useState<EvolutionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EvolutionEvent | null>(null);
  const [testing, setTesting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [phoneFilter, setPhoneFilter] = useState('');

  const normalizedFilter = phoneFilter.replace(/\D/g, '');
  const filteredEvents = events;

  const load = async (filter?: string) => {
    setLoading(true);
    const digits = (filter ?? phoneFilter).replace(/\D/g, '');
    let query = supabase
      .from('evolution_webhook_events' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(digits ? 500 : 100);
    if (digits) {
      query = query.ilike('remote_jid', `%${digits}%`);
    }
    const { data, error } = await query;
    if (error) setLastError(error.message);
    else setEvents((data as any) ?? []);
    setLoading(false);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('evolution_webhook_events' as any)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString());
    setTodayCount(count ?? 0);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('evolution-webhook-events')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'evolution_webhook_events' },
        (payload) => {
          setEvents((prev) => [payload.new as EvolutionEvent, ...prev].slice(0, 100));
          setTodayCount((c) => c + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const testWebhook = async () => {
    setTesting(true);
    setLastError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test.event',
          instance: 'test-instance',
          data: {
            key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
            pushName: 'Teste Manual',
            message: { conversation: 'Mensagem de teste enviada em ' + new Date().toLocaleString() },
          },
        }),
      });
      const body = await res.json();
      if (!res.ok || body.success === false) {
        const msg = body.error || `HTTP ${res.status}`;
        setLastError(msg);
        toast.error('Falha no teste: ' + msg);
      } else {
        toast.success('Webhook testado com sucesso');
      }
    } catch (e: any) {
      setLastError(e.message);
      toast.error('Erro: ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  const lastEvent = events[0];
  const lastEventAt = lastEvent ? new Date(lastEvent.created_at) : null;
  const isOnline = lastEventAt && Date.now() - lastEventAt.getTime() < 1000 * 60 * 60 * 24;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Logs Evolution</h1>
          <p className="text-sm text-muted-foreground">Eventos recebidos da Evolution API em tempo real</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button onClick={testWebhook} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Testar Webhook
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-muted'}`} />
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-semibold">{isOnline ? 'Webhook online' : 'Sem eventos recentes'}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Radio className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Último webhook</p>
            <p className="font-semibold text-sm">{lastEventAt ? lastEventAt.toLocaleString('pt-BR') : '—'}</p>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Eventos hoje</p>
          <p className="text-2xl font-bold">{todayCount}</p>
        </Card>
      </div>

      {lastError && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">Erro</p>
            <p className="text-muted-foreground break-all">{lastError}</p>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={phoneFilter}
          onChange={(e) => setPhoneFilter(e.target.value)}
          placeholder="Filtrar por número (ex: 5511999999999)"
          className="flex-1 min-w-[240px] max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {phoneFilter && (
          <Button variant="ghost" size="sm" onClick={() => setPhoneFilter('')}>Limpar</Button>
        )}
        <p className="text-xs text-muted-foreground ml-auto">{filteredEvents.length} de {events.length}</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Evento</th>
                <th className="px-3 py-2 font-medium">Instância</th>
                <th className="px-3 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Mensagem</th>
                <th className="px-3 py-2 font-medium">Payload</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
              )}
              {!loading && filteredEvents.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{normalizedFilter ? 'Nenhum evento para esse número' : 'Nenhum webhook recebido ainda'}</td></tr>
              )}
              {filteredEvents.map((e) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{new Date(e.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2"><span className="inline-block px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono">{e.event}</span></td>
                  <td className="px-3 py-2 text-xs">{e.instance_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs font-mono">{e.remote_jid ?? '—'}</td>
                  <td className="px-3 py-2">{e.push_name ?? '—'}</td>
                  <td className="px-3 py-2 max-w-xs truncate">{e.message_text ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(e)}>Ver</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Payload completo</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted/50 p-4 rounded overflow-auto">
            {selected ? JSON.stringify(selected.raw_payload, null, 2) : ''}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
