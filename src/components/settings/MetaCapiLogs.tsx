import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Loader2, ScrollText, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface CapiEvent {
  id: string;
  pixel_id: string;
  event_name: string;
  event_id: string;
  event_time: string;
  value: number | null;
  currency: string | null;
  ctwa_clid: string | null;
  conversation_id: string | null;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  error: string | null;
  request_payload: any;
  created_at: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export default function MetaCapiLogs() {
  const { currentWorkspace } = useWorkspace();
  const [events, setEvents] = useState<CapiEvent[]>([]);
  const [pixels, setPixels] = useState<{ id: string; name: string; pixel_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pixelFilter, setPixelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'error'>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const [{ data: evs }, { data: pxs }] = await Promise.all([
      supabase
        .from('meta_capi_events' as any)
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('meta_capi_pixels' as any)
        .select('id, name, pixel_id')
        .eq('workspace_id', currentWorkspace.id),
    ]);
    setEvents((evs as any) ?? []);
    setPixels((pxs as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentWorkspace?.id]);

  const pixelName = (pid: string) => pixels.find(p => p.pixel_id === pid)?.name ?? pid;

  const filtered = useMemo(() => events.filter(e =>
    (!pixelFilter || e.pixel_id === pixelFilter) &&
    (!statusFilter || (statusFilter === 'success' ? e.success : !e.success))
  ), [events, pixelFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: filtered.length,
    ok: filtered.filter(e => e.success).length,
    fail: filtered.filter(e => !e.success).length,
  }), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Meta Conversions API — Logs de eventos</h2>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={pixelFilter} onChange={e => setPixelFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs">
          <option value="">Todos os Pixels</option>
          {pixels.map(p => <option key={p.id} value={p.pixel_id}>{p.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs">
          <option value="">Todos os status</option>
          <option value="success">Somente sucesso</option>
          <option value="error">Somente falhas</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {stats.total} eventos · <span className="text-emerald-500">{stats.ok} ok</span> · <span className="text-destructive">{stats.fail} falhas</span>
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          Nenhum evento registrado
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="rounded-lg border border-border bg-card">
              <button
                onClick={() => setExpanded(s => ({ ...s, [e.id]: !s[e.id] }))}
                className="w-full flex items-start gap-3 p-3 text-left"
              >
                {e.success
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  : <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{e.event_name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">{pixelName(e.pixel_id)}</span>
                    {e.response_status != null && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">HTTP {e.response_status}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmt(e.created_at)} · {e.value != null ? `${e.currency ?? ''} ${e.value}` : 'sem valor'}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                    ctwa_clid: {e.ctwa_clid || '—'}
                  </p>
                  {!e.success && e.error && (
                    <p className="text-xs text-destructive mt-1 break-words">{e.error}</p>
                  )}
                </div>
                {expanded[e.id]
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>

              {expanded[e.id] && (
                <div className="border-t border-border p-3 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">Payload enviado</p>
                    <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-60">
{JSON.stringify(e.request_payload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">Resposta da Meta</p>
                    <pre className="text-[10px] font-mono bg-muted/50 rounded p-2 overflow-x-auto max-h-60 whitespace-pre-wrap">
{e.response_body || '—'}
                    </pre>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-mono">event_id: {e.event_id}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
