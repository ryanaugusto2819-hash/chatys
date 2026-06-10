import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { Loader2, Search, Megaphone, DollarSign, RefreshCw, ExternalLink, X } from 'lucide-react';

interface AdConversation {
  id: string;
  contact_name: string;
  contact_phone: string;
  ctwa_clid: string | null;
  source_id: string | null;
  ad_title: string | null;
  created_at: string;
  sale_registered_at: string | null;
}

interface WorkspaceSettings {
  ads_order_webhook_url: string | null;
}

export default function AdsConversions() {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<AdConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneFilter, setPhoneFilter] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [orderTarget, setOrderTarget] = useState<AdConversation | null>(null);
  const [orderAmount, setOrderAmount] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [sending, setSending] = useState(false);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);

  const campaignFromTitle = (t: string | null) => {
    if (!t) return null;
    return t.split('›')[0].trim();
  };

  const bulkResolve = async () => {
    const targets = items.filter(i => i.source_id && !i.ad_title);
    if (targets.length === 0) {
      toast.info('Nada para reprocessar');
      return;
    }
    setBulkResolving(true);
    let ok = 0, fail = 0;
    for (const conv of targets) {
      try {
        const { data, error } = await supabase.functions.invoke('meta-ad-lookup', {
          body: { sourceId: conv.source_id, conversationId: conv.id },
        });
        if (!error && (data as any)?.success) {
          ok++;
          setItems(prev => prev.map(p => p.id === conv.id ? { ...p, ad_title: (data as any).adTitle } : p));
        } else fail++;
      } catch { fail++; }
    }
    setBulkResolving(false);
    toast.success(`Reprocessado: ${ok} ok, ${fail} falhas`);
  };

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations' as any)
      .select('id, contact_name, contact_phone, ctwa_clid, source_id, ad_title, created_at, sale_registered_at')
      .eq('workspace_id', currentWorkspace.id)
      .or('source_type.eq.ads,ctwa_clid.not.is.null,source_id.not.is.null')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems((data as any) || []);

    const { data: settingsData } = await supabase
      .from('workspace_settings' as any)
      .select('ads_order_webhook_url')
      .eq('workspace_id', currentWorkspace.id)
      .maybeSingle();
    setSettings((settingsData as any) || null);

    setLoading(false);
  };

  useEffect(() => { load(); }, [currentWorkspace?.id]);

  const filtered = useMemo(() => {
    const q = phoneFilter.replace(/\D/g, '');
    if (!q) return items;
    return items.filter(i => (i.contact_phone || '').replace(/\D/g, '').includes(q));
  }, [items, phoneFilter]);

  const resolveAd = async (conv: AdConversation) => {
    if (!conv.source_id) return;
    setResolving(conv.id);
    try {
      const { data, error } = await supabase.functions.invoke('meta-ad-lookup', {
        body: { sourceId: conv.source_id, conversationId: conv.id },
      });
      if (error) throw error;
      if ((data as any)?.success) {
        toast.success('Anúncio resolvido');
        setItems(prev => prev.map(p => p.id === conv.id ? { ...p, ad_title: (data as any).adTitle } : p));
      } else {
        toast.error((data as any)?.error || 'Não foi possível resolver');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao resolver anúncio');
    } finally {
      setResolving(null);
    }
  };

  const submitOrder = async () => {
    if (!orderTarget) return;
    const amount = parseFloat(orderAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      toast.error('Informe um valor válido');
      return;
    }
    if (!settings?.ads_order_webhook_url?.trim()) {
      toast.error('Configure o Webhook de pedidos em Configurações → Workspace antes de enviar.');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-ad-order-webhook', {
        body: { conversationId: orderTarget.id, amount, currency: 'BRL', note: orderNote || null },
      });
      if (error) throw error;
      if ((data as any)?.success) {
        toast.success('Pedido enviado ao webhook');
        setOrderTarget(null);
        setOrderAmount('');
        setOrderNote('');
        load();
      } else {
        toast.error((data as any)?.error || 'Falha ao enviar');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar pedido');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Conversões de Anúncios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversas vindas de anúncios (Click-to-WhatsApp). Registre o valor do pedido para enviar ao seu sistema externo.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={bulkResolve}
            disabled={bulkResolving}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
          >
            {bulkResolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Reprocessar anúncios
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" />Atualizar
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filtrar por telefone..."
          value={phoneFilter}
          onChange={(e) => setPhoneFilter(e.target.value)}
          className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Nenhuma conversa de anúncio encontrada.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Contato</th>
                <th className="text-left px-4 py-3 font-medium">Telefone</th>
                <th className="text-left px-4 py-3 font-medium">Campanha</th>
                <th className="text-left px-4 py-3 font-medium">CTWA / Source</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-right px-4 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.contact_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.contact_phone}</td>
                  <td className="px-4 py-3 max-w-xs truncate" title={c.ad_title || ''}>
                    {campaignFromTitle(c.ad_title) || <span className="text-muted-foreground italic">não resolvido</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div className="truncate max-w-[180px]" title={c.ctwa_clid || ''}>CTWA: {c.ctwa_clid ? `${c.ctwa_clid.slice(0, 14)}…` : '—'}</div>
                    <div>Source: {c.source_id || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {!c.ad_title && c.source_id && (
                        <button
                          onClick={() => resolveAd(c)}
                          disabled={resolving === c.id}
                          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                        >
                          {resolving === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                          Resolver
                        </button>
                      )}
                      <button
                        onClick={() => { setOrderTarget(c); setOrderAmount(''); setOrderNote(''); }}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
                      >
                        <DollarSign className="h-3 w-3" />
                        {c.sale_registered_at ? 'Novo pedido' : 'Registrar pedido'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {orderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !sending && setOrderTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">Registrar valor do pedido</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {orderTarget.contact_name} · {orderTarget.contact_phone}
                </p>
                {orderTarget.ad_title && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">📣 {orderTarget.ad_title}</p>
                )}
              </div>
              <button onClick={() => setOrderTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Observação (opcional)</label>
              <textarea
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOrderTarget(null)}
                disabled={sending}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={submitOrder}
                disabled={sending}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                Enviar para webhook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
