import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { Loader2, Search, Megaphone, DollarSign, RefreshCw, ExternalLink, X, Link2, Copy, Settings, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';

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

interface LinkTemplate {
  id: string;
  workspace_id: string;
  name: string;
  url_template: string;
}

interface AdLookupResponse {
  success?: boolean;
  adTitle?: string;
  error?: string;
}

interface OrderWebhookResponse {
  success?: boolean;
  error?: string;
}

const errorMessage = (err: unknown, fallback: string) => err instanceof Error ? err.message : fallback;

const substituteTemplate = (template: string, conv: Pick<AdConversation, 'contact_phone' | 'ctwa_clid'>) => {
  const phone = (conv.contact_phone || '').replace(/\D/g, '');
  const ctwa = conv.ctwa_clid || '';
  let result = template
    // Placeholders com chaves
    .replace(/\{\{\s*TELEFONE\s*\}\}/gi, phone)
    .replace(/\{\{\s*PHONE\s*\}\}/gi, phone)
    .replace(/\{\{\s*CTWA_ID\s*\}\}/gi, ctwa)
    .replace(/\{\{\s*CTWA\s*\}\}/gi, ctwa)
    // Placeholders literais (compatibilidade com templates antigos)
    .replace(/COLE_O_CTWA_CLID_AQUI/gi, ctwa)
    .replace(/COLE_CTWA_CLID_AQUI/gi, ctwa)
    .replace(/CTWA_CLID_AQUI/gi, ctwa)
    .replace(/5511999998888/g, phone)
    .replace(/COLE_O_TELEFONE_AQUI/gi, phone)
    .replace(/COLE_TELEFONE_AQUI/gi, phone)
    .replace(/TELEFONE_AQUI/gi, phone);

  // Se não houver CTWA, remove o parâmetro vazio da URL para não deixar lixo
  if (!ctwa) {
    try {
      const urlObj = new URL(result);
      const params = new URLSearchParams(urlObj.search);
      ['ctwa', 'ctwa_id', 'ctwa_clid'].forEach((k) => params.delete(k));
      urlObj.search = params.toString();
      result = urlObj.toString();
    } catch {
      // Se a URL não for válida (ex: template incompleto), mantém o resultado original
    }
  }

  return result;
};

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

  // Link generator
  const [templates, setTemplates] = useState<LinkTemplate[]>([]);
  const [linkTarget, setLinkTarget] = useState<AdConversation | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [shortening, setShortening] = useState(false);
  const [shortUrl, setShortUrl] = useState<string>('');
  const [copied, setCopied] = useState<'full' | 'short' | null>(null);

  // Template manager
  const [managerOpen, setManagerOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplUrl, setTplUrl] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  const campaignFromTitle = (t: string | null) => t ? t.split('›')[0].trim() : null;

  const bulkResolve = async () => {
    const targets = items.filter(i => i.source_id && !i.ad_title);
    if (targets.length === 0) { toast.info('Nada para reprocessar'); return; }
    setBulkResolving(true);
    let ok = 0, fail = 0;
    for (const conv of targets) {
      try {
        const { data, error } = await supabase.functions.invoke<AdLookupResponse>('meta-ad-lookup', {
          body: { sourceId: conv.source_id, conversationId: conv.id },
        });
        if (!error && data?.success) {
          ok++;
          setItems(prev => prev.map(p => p.id === conv.id ? { ...p, ad_title: data.adTitle || p.ad_title } : p));
        } else fail++;
      } catch { fail++; }
    }
    setBulkResolving(false);
    toast.success(`Reprocessado: ${ok} ok, ${fail} falhas`);
  };

  const loadTemplates = useCallback(async () => {
    if (!currentWorkspace) return;
    const { data, error } = await supabase
      .from('ads_link_templates')
      .select('id, workspace_id, name, url_template')
      .eq('workspace_id', currentWorkspace.id)
      .order('created_at', { ascending: true });
    if (error) { toast.error(error.message); return; }
    setTemplates(data || []);
  }, [currentWorkspace]);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const phoneQ = phoneFilter.replace(/\D/g, '');
    let query = supabase
      .from('conversations')
      .select('id, contact_name, contact_phone, ctwa_clid, source_id, ad_title, created_at, sale_registered_at')
      .or('source_type.eq.ads,ctwa_clid.not.is.null,source_id.not.is.null')
      .order('created_at', { ascending: false });
    if (phoneQ) query = query.ilike('contact_phone', `%${phoneQ}%`).limit(100);
    else query = query.limit(200);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setItems(data || []);

    const { data: settingsData } = await supabase
      .from('workspace_settings')
      .select('ads_order_webhook_url')
      .eq('workspace_id', currentWorkspace.id)
      .maybeSingle();
    setSettings(settingsData || null);

    setLoading(false);
  }, [currentWorkspace, phoneFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const filtered = useMemo(() => {
    const q = phoneFilter.replace(/\D/g, '');
    if (!q) return items;
    return items.filter(i => (i.contact_phone || '').replace(/\D/g, '').includes(q));
  }, [items, phoneFilter]);

  const resolveAd = async (conv: AdConversation) => {
    if (!conv.source_id) return;
    setResolving(conv.id);
    try {
      const { data, error } = await supabase.functions.invoke<AdLookupResponse>('meta-ad-lookup', {
        body: { sourceId: conv.source_id, conversationId: conv.id },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success('Anúncio resolvido');
        setItems(prev => prev.map(p => p.id === conv.id ? { ...p, ad_title: data.adTitle || p.ad_title } : p));
      } else toast.error(data?.error || 'Não foi possível resolver');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao resolver anúncio'));
    } finally { setResolving(null); }
  };

  const submitOrder = async () => {
    if (!orderTarget) return;
    const amount = parseFloat(orderAmount.replace(',', '.'));
    if (!amount || amount <= 0) { toast.error('Informe um valor válido'); return; }
    if (!settings?.ads_order_webhook_url?.trim()) {
      toast.error('Configure o Webhook de pedidos em Configurações → Workspace antes de enviar.');
      return;
    }
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
      const ANON = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let data: OrderWebhookResponse | null = null;
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-ad-order-webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ conversationId: orderTarget.id, amount, currency: 'BRL', note: orderNote || null }),
        });
        data = await res.json().catch(() => null);
      } catch (fetchErr) {
        const { data: conv } = await supabase
          .from('conversations').select('sale_registered_at').eq('id', orderTarget.id).maybeSingle();
        if (conv?.sale_registered_at) data = { success: true };
        else throw fetchErr;
      }
      if (data?.success) {
        toast.success('Pedido enviado ao webhook');
        setOrderTarget(null); setOrderAmount(''); setOrderNote('');
        load();
      } else toast.error(data?.error || 'Falha ao enviar');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Erro ao enviar pedido'));
    } finally { setSending(false); }
  };

  const openLinkModal = (conv: AdConversation) => {
    setLinkTarget(conv);
    setShortUrl('');
    setCopied(null);
    setSelectedTemplateId(templates[0]?.id || '');
  };

  const generatedFullUrl = useMemo(() => {
    if (!linkTarget) return '';
    const tpl = templates.find(t => t.id === selectedTemplateId);
    if (!tpl) return '';
    return substituteTemplate(tpl.url_template, linkTarget);
  }, [linkTarget, selectedTemplateId, templates]);

  const shorten = async () => {
    if (!generatedFullUrl) return;
    setShortening(true);
    setShortUrl('');
    try {
      const { data, error } = await supabase.functions.invoke<{ shortUrl?: string; error?: string }>('shorten-url', {
        body: { url: generatedFullUrl },
      });
      if (error) throw error;
      if (data?.shortUrl) setShortUrl(data.shortUrl);
      else toast.error(data?.error || 'Falha ao encurtar');
    } catch (err) {
      toast.error(errorMessage(err, 'Erro ao encurtar'));
    } finally { setShortening(false); }
  };

  const copyToClipboard = async (text: string, which: 'full' | 'short') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      toast.success('Copiado!');
      setTimeout(() => setCopied(null), 1500);
    } catch { toast.error('Não foi possível copiar'); }
  };

  const saveTemplate = async () => {
    if (!currentWorkspace) return;
    if (!tplName.trim() || !tplUrl.trim()) { toast.error('Preencha nome e URL'); return; }
    if (!/^https?:\/\//i.test(tplUrl.trim())) { toast.error('URL deve começar com http(s)://'); return; }
    setSavingTpl(true);
    const { error } = await supabase.from('ads_link_templates').insert({
      workspace_id: currentWorkspace.id,
      name: tplName.trim(),
      url_template: tplUrl.trim(),
    });
    setSavingTpl(false);
    if (error) { toast.error(error.message); return; }
    setTplName(''); setTplUrl('');
    toast.success('Template salvo');
    loadTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    const { error } = await supabase.from('ads_link_templates').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Template removido');
    loadTemplates();
    if (selectedTemplateId === id) setSelectedTemplateId('');
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
            onClick={() => setManagerOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
            Templates de link
          </button>
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
                        onClick={() => openLinkModal(c)}
                        className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 text-primary px-2.5 py-1.5 text-xs font-semibold hover:bg-primary/20"
                        title="Gerar link com variáveis"
                      >
                        <Link2 className="h-3 w-3" />
                        Gerar link
                      </button>
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

      {/* Order modal */}
      {orderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !sending && setOrderTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">Registrar valor do pedido</h3>
                <p className="text-xs text-muted-foreground mt-1">{orderTarget.contact_name} · {orderTarget.contact_phone}</p>
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
              <input type="text" inputMode="decimal" autoFocus value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)} placeholder="0,00"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Observação (opcional)</label>
              <textarea value={orderNote} onChange={(e) => setOrderNote(e.target.value)} rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setOrderTarget(null)} disabled={sending}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
              <button onClick={submitOrder} disabled={sending}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                Enviar para webhook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link generator modal */}
      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !shortening && setLinkTarget(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" /> Gerador de link
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {linkTarget.contact_name} · {linkTarget.contact_phone}
                </p>
              </div>
              <button onClick={() => setLinkTarget(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhum template cadastrado.
                <button onClick={() => { setLinkTarget(null); setManagerOpen(true); }}
                  className="ml-2 text-primary hover:underline">Criar agora</button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Template</label>
                  <select value={selectedTemplateId} onChange={(e) => { setSelectedTemplateId(e.target.value); setShortUrl(''); }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">Selecione um template...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {!linkTarget.ctwa_clid && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong>CTWA ID não encontrado.</strong> O link será gerado apenas com o telefone do lead.
                    </div>
                  </div>
                )}

                {generatedFullUrl && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Link completo</label>
                    <div className="flex gap-2">
                      <input readOnly value={generatedFullUrl}
                        className="flex-1 rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs font-mono" />
                      <button onClick={() => copyToClipboard(generatedFullUrl, 'full')}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-accent">
                        {copied === 'full' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button onClick={shorten} disabled={!generatedFullUrl || shortening}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}>
                    {shortening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Encurtar com TinyURL
                  </button>
                </div>

                {shortUrl && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Link encurtado</label>
                    <div className="flex gap-2">
                      <input readOnly value={shortUrl}
                        className="flex-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-mono text-primary" />
                      <button onClick={() => copyToClipboard(shortUrl, 'short')}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}>
                        {copied === 'short' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copiar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Template manager modal */}
      {managerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setManagerOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-primary" /> Templates de link
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Use as variáveis <code className="rounded bg-muted px-1">{'{{TELEFONE}}'}</code> e{' '}
                  <code className="rounded bg-muted px-1">{'{{CTWA_ID}}'}</code> na URL.
                </p>
              </div>
              <button onClick={() => setManagerOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nome (ex: Megafit)"
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                <input value={tplUrl} onChange={(e) => setTplUrl(e.target.value)}
                  placeholder="https://exemplo.com/?offer=x&phone={{TELEFONE}}&ctwa={{CTWA_ID}}"
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                <button onClick={saveTemplate} disabled={savingTpl}
                  className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}>
                  {savingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border max-h-[50vh] overflow-auto">
              {templates.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nenhum template ainda.</div>
              ) : templates.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate" title={t.url_template}>{t.url_template}</div>
                  </div>
                  <button onClick={() => deleteTemplate(t.id)}
                    className="rounded-md border border-border bg-background p-2 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
