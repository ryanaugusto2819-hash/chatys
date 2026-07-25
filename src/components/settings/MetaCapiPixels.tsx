import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Target, Eye, EyeOff, Pencil } from 'lucide-react';

interface Pixel {
  id: string;
  name: string;
  pixel_id: string;
  access_token: string;
  page_id: string | null;
  whatsapp_business_account_id: string | null;
  test_event_code: string | null;
  is_active: boolean;
  is_default: boolean;
}

export default function MetaCapiPixels() {
  const { currentWorkspace } = useWorkspace();
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPixel, setEditingPixel] = useState<Pixel | null>(null);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const emptyForm = { name: '', pixel_id: '', access_token: '', test_event_code: '', page_id: '', whatsapp_business_account_id: '' };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data } = await supabase
      .from('meta_capi_pixels' as any)
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('created_at', { ascending: false });
    setPixels((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentWorkspace?.id]);

  const handleSave = async () => {
    if (!currentWorkspace) return;
    if (!form.name.trim() || !form.pixel_id.trim() || !form.access_token.trim() || !form.whatsapp_business_account_id.trim()) {
      toast.error('Nome, Pixel ID, Access Token e WABA ID são obrigatórios');
      return;
    }
    setSaving(true);
    const payload = {
      workspace_id: currentWorkspace.id,
      name: form.name.trim(),
      pixel_id: form.pixel_id.trim(),
      access_token: form.access_token.trim(),
      test_event_code: form.test_event_code.trim() || null,
      page_id: form.page_id.trim() || null,
      whatsapp_business_account_id: form.whatsapp_business_account_id.trim(),
    } as any;
    const { error } = editingPixel
      ? await supabase.from('meta_capi_pixels' as any).update(payload).eq('id', editingPixel.id)
      : await supabase.from('meta_capi_pixels' as any).insert(payload);
    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(editingPixel ? 'Pixel atualizado' : 'Pixel adicionado');
    setForm(emptyForm);
    setEditingPixel(null);
    setShowForm(false);
    load();
  };

  const handleEdit = (p: Pixel) => {
    setEditingPixel(p);
    setForm({
      name: p.name || '',
      pixel_id: p.pixel_id || '',
      access_token: p.access_token || '',
      test_event_code: p.test_event_code || '',
      page_id: p.page_id || '',
      whatsapp_business_account_id: p.whatsapp_business_account_id || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingPixel(null);
    setForm(emptyForm);
  };

  const handleToggle = async (p: Pixel) => {
    await supabase.from('meta_capi_pixels' as any).update({ is_active: !p.is_active }).eq('id', p.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este Pixel? Os logs de eventos serão mantidos.')) return;
    const { error } = await supabase.from('meta_capi_pixels' as any).delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Pixel removido');
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Meta Conversions API — Pixels</h2>
        </div>
        <button
          onClick={() => showForm ? closeForm() : setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar Pixel
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Cadastre os Pixels da Meta para disparar eventos <b>Purchase</b> via servidor quando registrar uma venda. Ao registrar a venda no chat, você escolhe qual Pixel disparar.
      </p>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3 bg-card">
          <p className="text-sm font-semibold">{editingPixel ? 'Editar Pixel' : 'Adicionar Pixel'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Nome interno *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Pixel Fígado BR"
                className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Pixel ID / Dataset ID *</label>
              <input value={form.pixel_id} onChange={e => setForm(f => ({ ...f, pixel_id: e.target.value }))}
                placeholder="123456789012345"
                className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Access Token (CAPI) *</label>
            <textarea value={form.access_token} onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
              placeholder="EAAG..."
              rows={2}
              className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">WABA ID (Conta WhatsApp Business) *</label>
              <input value={form.whatsapp_business_account_id} onChange={e => setForm(f => ({ ...f, whatsapp_business_account_id: e.target.value }))}
                placeholder="123456789012345"
                className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
              <p className="text-[11px] text-muted-foreground mt-1">Campo oficial exigido pela Meta para Click-to-WhatsApp.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Page ID (opcional)</label>
              <input value={form.page_id} onChange={e => setForm(f => ({ ...f, page_id: e.target.value }))}
                placeholder="123456789012345"
                className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
              <p className="text-[11px] text-muted-foreground mt-1">Use junto se a Meta pedir validação da Página.</p>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Test Event Code (opcional)</label>
            <input value={form.test_event_code} onChange={e => setForm(f => ({ ...f, test_event_code: e.target.value }))}
              placeholder="TEST12345"
              className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
            <p className="text-[11px] text-muted-foreground mt-1">Use para validar na aba "Testar eventos" do Gerenciador de Eventos. Remova quando estiver em produção.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={closeForm} className="flex-1 rounded-lg border border-border py-2 text-xs">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : editingPixel ? 'Atualizar Pixel' : 'Salvar Pixel'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : pixels.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          Nenhum Pixel cadastrado ainda
        </div>
      ) : (
        <div className="space-y-2">
          {pixels.map(p => (
            <div key={p.id} className="rounded-lg border border-border p-3 bg-card flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${p.is_active ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                    {p.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  {p.test_event_code && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">TEST</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">Pixel: {p.pixel_id}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">WABA: {p.whatsapp_business_account_id || 'não informado'}</p>
                {p.page_id && <p className="text-xs text-muted-foreground font-mono mt-0.5">Página: {p.page_id}</p>}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[11px] text-muted-foreground">Token:</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate max-w-md">
                    {showToken[p.id] ? p.access_token : '••••••••••••••••••••'}
                  </span>
                  <button onClick={() => setShowToken(s => ({ ...s, [p.id]: !s[p.id] }))} className="text-muted-foreground hover:text-foreground">
                    {showToken[p.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggle(p)} className="text-xs px-2 py-1 rounded hover:bg-muted">
                  {p.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button onClick={() => handleEdit(p)} className="p-1.5 text-muted-foreground hover:bg-muted rounded" aria-label="Editar Pixel">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-destructive hover:bg-destructive/10 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
