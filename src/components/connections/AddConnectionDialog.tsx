import { useState } from 'react';
import { MessageSquare, Plus, Loader2, Eye, EyeOff, Zap } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import EmbeddedSignup from './EmbeddedSignup';

const PROVIDERS = [
  {
    id: 'embedded_signup',
    name: 'WhatsApp Cloud API (Automático)',
    description: 'Conecte com um clique via Facebook. Recomendado.',
    fields: [],
    isEmbedded: true,
  },
  {
    id: 'zapi',
    name: 'Z-API (WhatsApp via QR Code)',
    description: 'Conecte via QR Code. Sem necessidade de conta Meta Business.',
    fields: [
      { key: 'instance_id', label: 'Instance ID', placeholder: '3C2A7F8B9D1E...', sensitive: false },
      { key: 'token', label: 'Token', placeholder: 'A1B2C3D4E5F6...', sensitive: true },
      { key: 'client_token', label: 'Client-Token', placeholder: 'F1a2b3c4d5e6...', sensitive: true },
    ],
    isEmbedded: false,
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
    isEmbedded: false,
  },
];

interface AddConnectionDialogProps {
  onCreated: () => void;
  workspaceId?: string;
}

export default function AddConnectionDialog({ onCreated, workspaceId }: AddConnectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'form' | 'embedded'>('select');
  const [selectedProvider, setSelectedProvider] = useState<typeof PROVIDERS[0] | null>(null);
  const [label, setLabel] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep('select');
    setSelectedProvider(null);
    setLabel('');
    setValues({});
    setShowSecrets({});
  };

  const handleSelectProvider = (p: typeof PROVIDERS[0]) => {
    setSelectedProvider(p);
    if (p.isEmbedded) {
      setStep('embedded');
    } else {
      setStep('form');
    }
  };

  const handleCreate = async () => {
    if (!selectedProvider) return;
    const missing = selectedProvider.fields.filter(f => !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Preencha: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    if (!label.trim()) {
      toast.error('Dê um nome para esta conexão.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-connection', {
        body: { connectionId: selectedProvider.id, config: values, label: label.trim() },
      });
      if (error) throw error;

      // Assign workspace_id to the newly created connection(s) without workspace
      if (workspaceId) {
        await (supabase
          .from('connection_configs') as any)
          .update({ workspace_id: workspaceId })
          .is('workspace_id', null);
      }

      if ((data as { status?: string })?.status === 'pending_setup') {
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
        <button className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors active:scale-[0.97]">
          <Plus className="h-4 w-4" />
          Nova Conexão
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'select' && 'Escolha o provedor'}
            {step === 'form' && `Configurar ${selectedProvider?.name}`}
            {step === 'embedded' && 'Conectar WhatsApp via Facebook'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Selecione o tipo de conexão WhatsApp que deseja adicionar.'}
            {step === 'form' && 'Preencha as credenciais para conectar este número.'}
            {step === 'embedded' && 'Faça login com o Facebook para conectar automaticamente.'}
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
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  p.isEmbedded ? 'bg-[#1877F2]/10 text-[#1877F2]' : 'bg-primary/10 text-primary'
                }`}>
                  {p.isEmbedded ? <Zap className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-card-foreground">{p.name}</p>
                    {p.isEmbedded && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#1877F2]/10 text-[#1877F2] px-1.5 py-0.5 rounded">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                </div>
              </button>
            ))}
          </div>
        ) : step === 'embedded' ? (
          <EmbeddedSignup
            onSuccess={() => {
              setOpen(false);
              reset();
              onCreated();
            }}
            onCancel={() => {
              setStep('select');
            }}
          />
        ) : selectedProvider ? (
          <div className="space-y-4 pt-2">
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
            {selectedProvider.fields.map(field => (
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
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setStep('select'); setValues({}); setLabel(''); }}
                className="flex-1 rounded-xl border border-input px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? 'Criando...' : 'Criar Conexão'}
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
