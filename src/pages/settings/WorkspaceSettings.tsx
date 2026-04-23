import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { Building2, Globe, Clock, Save, Loader2, ImagePlus } from 'lucide-react';

const TIMEZONES = [
  'America/Sao_Paulo', 'America/Fortaleza', 'America/Manaus', 'America/Belem',
  'America/Montevideo', 'America/Buenos_Aires', 'America/Santiago',
  'America/Bogota', 'America/Mexico_City', 'America/New_York', 'UTC',
];

const LANGUAGES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'es',    label: 'Español' },
  { value: 'en',    label: 'English' },
];

export default function WorkspaceSettings() {
  const { currentWorkspace, refetchWorkspaces } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [language, setLanguage] = useState('pt-BR');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (!currentWorkspace) return;
    setName(currentWorkspace.name);
    loadSettings();
  }, [currentWorkspace?.id]);

  const loadSettings = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('workspace_settings' as any)
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();
      if (data) {
        setTimezone((data as any).timezone || 'America/Sao_Paulo');
        setLanguage((data as any).language || 'pt-BR');
        setNotificationEmail((data as any).notification_email || '');
        setWebhookUrl((data as any).webhook_url || '');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      // Atualizar nome do workspace
      const { error: wErr } = await supabase
        .from('workspaces' as any)
        .update({ name })
        .eq('id', currentWorkspace.id);
      if (wErr) throw wErr;

      // Upsert configurações
      const { error: sErr } = await supabase
        .from('workspace_settings' as any)
        .upsert({
          workspace_id: currentWorkspace.id,
          timezone,
          language,
          notification_email: notificationEmail || null,
          webhook_url: webhookUrl || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id' });
      if (sErr) throw sErr;

      await refetchWorkspaces();
      toast.success('Configurações salvas!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Configurações do Workspace</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie as informações do seu ambiente</p>
      </div>

      {/* Identidade */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Identidade</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Nome do workspace</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Slug (URL)</label>
          <div className="flex items-center rounded-lg border border-input bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">chatys.app/</span>
            <span className="text-sm text-foreground ml-1">{currentWorkspace?.slug}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">O slug não pode ser alterado após criação</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
            <ImagePlus className="h-3.5 w-3.5" /> Logo (URL)
          </label>
          <input
            type="url"
            placeholder="https://exemplo.com/logo.png"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Regional */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Regional</h2>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Idioma</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Fuso horário
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Integrações */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Notificações e Webhooks</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email de notificação</label>
          <input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="notificacoes@empresa.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Webhook URL</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://seu-sistema.com/webhook"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar alterações
      </button>
    </div>
  );
}
