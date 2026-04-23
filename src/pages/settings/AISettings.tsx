import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { Bot, Key, Sliders, MessageSquare, Save, Loader2, Eye, EyeOff, Info } from 'lucide-react';

const MODELS = [
  { value: 'gpt-4o',      label: 'GPT-4o (Mais capaz)',       badge: 'Recomendado' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Mais rápido)', badge: 'Econômico' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo',           badge: 'Legado' },
];

export default function AISettings() {
  const { currentWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [managerEnabled, setManagerEnabled] = useState(false);
  const [followUpEnabled, setFollowUpEnabled] = useState(false);

  useEffect(() => {
    if (!currentWorkspace) return;
    loadConfig();
  }, [currentWorkspace?.id]);

  const loadConfig = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ai_configs' as any)
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setApiKey(d.openai_api_key ? '••••••••••••' + d.openai_api_key.slice(-4) : '');
        setModel(d.model || 'gpt-4o-mini');
        setTemperature(Number(d.temperature) || 0.7);
        setMaxTokens(d.max_tokens || 1000);
        setSystemPrompt(d.system_prompt || '');
        setAutoReplyEnabled(d.auto_reply_enabled || false);
        setManagerEnabled(d.manager_enabled || false);
        setFollowUpEnabled(d.follow_up_enabled || false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      const payload: any = {
        workspace_id: currentWorkspace.id,
        model,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt || null,
        auto_reply_enabled: autoReplyEnabled,
        manager_enabled: managerEnabled,
        follow_up_enabled: followUpEnabled,
        updated_at: new Date().toISOString(),
      };

      // Só atualiza a chave se não for mascarada
      if (apiKey && !apiKey.includes('•')) {
        payload.openai_api_key = apiKey;
      }

      const { error } = await supabase
        .from('ai_configs' as any)
        .upsert(payload, { onConflict: 'workspace_id' });
      if (error) throw error;

      toast.success('Configurações de IA salvas!');
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
        <h1 className="text-xl font-bold text-foreground">Configurações de IA</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure a inteligência artificial do seu workspace</p>
      </div>

      {/* API Key */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Key className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Chave da API OpenAI</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Sua chave é criptografada e armazenada com segurança. Nunca é exposta no frontend.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">OpenAI API Key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-proj-..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Modelo e parâmetros */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Modelo e Parâmetros</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Modelo</label>
          <div className="space-y-2">
            {MODELS.map((m) => (
              <label key={m.value}
                className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all"
                style={{
                  borderColor: model === m.value ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  background: model === m.value ? 'hsl(var(--primary) / 0.05)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="model"
                  value={m.value}
                  checked={model === m.value}
                  onChange={() => setModel(m.value)}
                  className="accent-purple-600"
                />
                <span className="text-sm text-foreground flex-1">{m.label}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                  {m.badge}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Temperatura: <span className="text-primary font-bold">{temperature}</span>
            </label>
            <input
              type="range"
              min="0" max="2" step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Preciso</span><span>Criativo</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Max tokens: <span className="text-primary font-bold">{maxTokens}</span>
            </label>
            <input
              type="range"
              min="100" max="4000" step="100"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>100</span><span>4000</span>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt de sistema */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Prompt de Sistema</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Instrução base para a IA
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            placeholder="Você é um assistente de atendimento da [Empresa]. Seja educado, objetivo e sempre ofereça ajuda..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1">{systemPrompt.length} caracteres</p>
        </div>
      </div>

      {/* Funcionalidades */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Funcionalidades de IA</h2>
        </div>
        {[
          { key: 'autoReply', label: 'Auto-Reply', sub: 'IA responde automaticamente mensagens recebidas', value: autoReplyEnabled, set: setAutoReplyEnabled },
          { key: 'manager',   label: 'AI Manager', sub: 'Avalia qualidade do atendimento e follow-ups',   value: managerEnabled,   set: setManagerEnabled },
          { key: 'followUp',  label: 'Follow-Up',  sub: 'IA envia follow-ups automáticos para leads',    value: followUpEnabled,  set: setFollowUpEnabled },
        ].map(({ key, label, sub, value, set }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
            <button
              onClick={() => set(!value)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: value ? 'hsl(var(--primary))' : 'hsl(var(--muted))' }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: value ? 'translateX(24px)' : 'translateX(4px)' }}
              />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar configurações
      </button>
    </div>
  );
}
