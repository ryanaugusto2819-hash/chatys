import { useState } from 'react';
import { MessageSquare, Plus, Loader2, Eye, EyeOff } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';


const PROVIDERS = [
  {
    id: 'zapi',
    name: 'Z-API (WhatsApp via QR Code)',
    description: 'Conecte via QR Code. Sem necessidade de conta Meta Business.',
    fields: [
      { key: 'instance_id', label: 'Instance ID', placeholder: '3C2A7F8B9D1E...', sensitive: false },
      { key: 'token', label: 'Token', placeholder: 'A1B2C3D4E5F6...', sensitive: true },
      { key: 'client_token', label: 'Client-Token', placeholder: 'F1a2b3c4d5e6...', sensitive: true },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Cloud API (Manual)',
    description: 'Configure manualmente com suas credenciais da Meta.',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '123456789012345', sensitive: false },
      { key: 'waba_id', label: 'WABA ID (WhatsApp Business Account)', placeholder: '123456789012345', sensitive: false },
      { key: 'access_token', label: 'Access Token', placeholder: 'EAAxxxxxxx...', sensitive: true },
      { key: 'verify_token', label: 'Verify Token', placeholder: 'meu_token_secreto', sensitive: false },
    ],
  },
  {
    id: 'evolution',
    name: 'Evolution API (WhatsApp)',
    description: 'Conecte uma instância da Evolution API self-hosted.',
    fields: [
      { key: 'server_url', label: 'Server URL', placeholder: 'https://evolution.seudominio.com', sensitive: false },
      { key: 'instance_name', label: 'Instance Name', placeholder: 'teste03', sensitive: false },
      { key: 'api_key', label: 'API Key (apikey)', placeholder: 'B6D711FCDE...', sensitive: true },
    ],
  },
  {
    id: 'uazapigo',
    name: 'uazapiGO (WhatsApp)',
    description: 'Crie uma instância ou conecte uma existente com URL e token.',
    fields: [
      { key: 'instance_name', label: 'Nome da instância', placeholder: 'Ex: numero-vendas', sensitive: false },
    ],
  },
];

interface AddConnectionDialogProps {
  onCreated: () => void;
  workspaceId?: string;
}

export default function AddConnectionDialog({ onCreated, workspaceId }: AddConnectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [selectedProvider, setSelectedProvider] = useState<typeof PROVIDERS[0] | null>(null);
  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [uazapiMode, setUazapiMode] = useState<'create' | 'existing'>('create');

  const reset = () => {
    setStep('select');
    setSelectedProvider(null);
    setLabel('');
    setValues({});
    setShowSecrets({});
    setUazapiMode('create');
  };

  const handleSelectProvider = (p: typeof PROVIDERS[0]) => {
    setSelectedProvider(p);
    setStep('form');
  };

  const handleCreate = async () => {
    if (!selectedProvider) return;
    const fields = selectedProvider.id === 'uazapigo' && uazapiMode === 'existing'
      ? [
          { key: 'server_url', label: 'URL do servidor' },
          { key: 'token', label: 'Token da instância' },
        ]
      : selectedProvider.fields;
    const missing = fields.filter(f => !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Preencha: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    if (!label.trim()) {
      toast.error('Dê um nome para esta conexão.');
      return;
    }
    if (selectedProvider.id === 'uazapigo' && uazapiMode === 'existing') {
      try {
        const url = new URL(values.server_url.trim());
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) throw new Error();
      } catch {
        toast.error('Informe uma URL HTTPS válida do servidor, sem usuário, parâmetros ou fragmento.');
        return;
      }
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-connection', {
        body: { connectionId: selectedProvider.id, config: selectedProvider.id === 'uazapigo' && uazapiMode === 'existing'
          ? { server_url: values.server_url.trim(), token: values.token.trim() }
          : values, label: label.trim() },
      });
      if (error) {
        const response = (error as { context?: Response }).context;
        const details = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
        throw new Error(details?.error || error.message);
      }
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));

      // Assign workspace_id to the newly created connection(s) without workspace
      if (workspaceId) {
        await (supabase
          .from('connection_configs') as any)
          .update({ workspace_id: workspaceId })
          .is('workspace_id', null);
      }

      if (selectedProvider.id === 'uazapigo' && data?.diagnostics?.webhook_configured === false) {
        toast.warning(`Conexão criada, mas o webhook não foi configurado: ${data.diagnostics.webhook_error || 'verifique no cartão da conexão.'}`);
      } else if ((data as { status?: string })?.status === 'pending_setup') {
        toast.warning('Conexão criada, mas ainda pendente de webhook/app na Meta.');
      } else {
        toast.success('Conexão criada!');
      }
      setOpen(false);
      reset();
      onCreated();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar conexão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Conexão
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'select' && 'Escolha o provedor'}
            {step === 'form' && `Configurar ${selectedProvider?.name}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Selecione o tipo de conexão WhatsApp que deseja adicionar.'}
            {step === 'form' && 'Preencha as credenciais para conectar este número.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' ? (
          <div className="grid gap-3 pt-2">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelectProvider(p)}
                className="flex items-center gap-3 rounded-xl border border-border p-4 text-left hover:bg-secondary/50 transition-colors active:scale-[0.98] relative"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-card-foreground">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : selectedProvider ? (
          <div className="space-y-4 pt-2">
            {selectedProvider.id === 'uazapigo' && (
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted p-1" role="group" aria-label="Forma de conexão uazapiGO">
                <Button type="button" variant={uazapiMode === 'create' ? 'secondary' : 'ghost'} onClick={() => { setUazapiMode('create'); setValues({}); }} aria-pressed={uazapiMode === 'create'}>Criar instância</Button>
                <Button type="button" variant={uazapiMode === 'existing' ? 'secondary' : 'ghost'} onClick={() => { setUazapiMode('existing'); setValues({}); }} aria-pressed={uazapiMode === 'existing'}>URL e token</Button>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome da conexão</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Ex: Número Vendas, Suporte Principal..."
                className="w-full rounded-xl border border-input bg-background py-2.5 px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {(selectedProvider.id === 'uazapigo' && uazapiMode === 'existing' ? [
              { key: 'server_url', label: 'URL do servidor', placeholder: 'https://seu-servidor.uazapi.com', sensitive: false },
              { key: 'token', label: 'Token da instância', placeholder: 'Token fornecido pela uazapiGO', sensitive: true },
            ] : selectedProvider.fields).map(field => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-medium">{field.label}</label>
                <div className="relative">
                  <input
                    type={field.sensitive && !showSecrets[field.key] ? 'password' : 'text'}
                    value={values[field.key] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-input bg-background py-2.5 px-4 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                  />
                  {field.sensitive && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={showSecrets[field.key] ? 'Ocultar token' : 'Mostrar token'}
                      onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline"
                onClick={() => { setStep('select'); setValues({}); setLabel(''); }}
                className="flex-1 rounded-xl border border-input px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
              >
                Voltar
              </Button>
              <Button type="button"
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? 'Criando...' : 'Criar Conexão'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
