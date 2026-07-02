import { useState } from 'react';
import ZApiQrCodePanel from './ZApiQrCodePanel';
import {
  AlertCircle,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
  QrCode,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { SECTORS } from '@/lib/sectors';

interface ConnectionData {
  id: string;
  connection_id: string;
  label: string;
  config: Record<string, string>;
  is_connected: boolean;
  status: string;
  last_checked_at: string | null;
  status_since?: string | null;
  sector?: string | null;
}

interface ConnectionCardProps {
  connection: ConnectionData;
  onDeleted: () => void;
  onUpdated: () => void;
}

interface CheckStatusResponse {
  status?: string;
  details?: Record<string, unknown>;
}

const WEBHOOK_URLS: Record<string, string> = {
  whatsapp: `https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/whatsapp-webhook`,
  zapi: `https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/zapi-webhook`,
  evolution: `https://glceihfavfvebaaxgsnq.supabase.co/functions/v1/evolution-webhook`,
};

const PROVIDER_CONFIG: Record<string, {
  name: string;
  color: string;
  docsUrl: string;
  fields: { key: string; label: string; placeholder: string; sensitive: boolean }[];
}> = {
  whatsapp: {
    name: 'WhatsApp Cloud API',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '123456789012345', sensitive: false },
      { key: 'waba_id', label: 'WABA ID', placeholder: '123456789012345', sensitive: false },
      { key: 'access_token', label: 'Access Token', placeholder: 'EAAxxxxxxx...', sensitive: true },
      { key: 'verify_token', label: 'Verify Token (Webhook)', placeholder: 'meu_token_secreto', sensitive: false },
    ],
  },
  zapi: {
    name: 'Z-API (QR Code)',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    docsUrl: 'https://developer.z-api.io',
    fields: [
      { key: 'instance_id', label: 'Instance ID', placeholder: '3C2A7F8B9D1E...', sensitive: false },
      { key: 'token', label: 'Token', placeholder: 'A1B2C3D4E5F6...', sensitive: true },
      { key: 'client_token', label: 'Client-Token', placeholder: 'F1a2b3c4d5e6...', sensitive: true },
    ],
  },
  evolution: {
    name: 'Evolution API',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    docsUrl: 'https://doc.evolution-api.com',
    fields: [
      { key: 'server_url', label: 'Server URL', placeholder: 'https://evolution.seudominio.com', sensitive: false },
      { key: 'instance_name', label: 'Instance Name', placeholder: 'teste03', sensitive: false },
      { key: 'api_key', label: 'API Key (apikey)', placeholder: 'B6D711FCDE...', sensitive: true },
    ],
  },
};

const STATUS_MAP: Record<string, { icon: React.ReactNode; label: string; classes: string }> = {
  active: { icon: <Wifi className="h-3.5 w-3.5" />, label: 'Ativo', classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  blocked: { icon: <WifiOff className="h-3.5 w-3.5" />, label: 'Bloqueado', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
  warning: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Qualidade Baixa', classes: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  pending_setup: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Pendente', classes: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  error: { icon: <WifiOff className="h-3.5 w-3.5" />, label: 'Inativo', classes: 'bg-destructive/10 text-destructive border-destructive/20' },
  unknown: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: 'Não verificado', classes: 'bg-muted text-muted-foreground border-border' },
};

export default function ConnectionCard({ connection, onDeleted, onUpdated }: ConnectionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showQrPanel, setShowQrPanel] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(connection.config || {});
  const [label, setLabel] = useState(connection.label || '');
  const [sector, setSector] = useState<string>(connection.sector || '');
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [restarting, setRestarting] = useState(false);

  const handleRestartEvolution = async () => {
    const instanceName = connection.config?.instance_name;
    if (!instanceName) { toast.error('instance_name não configurado'); return; }
    setRestarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-manager', {
        body: { action: 'restart', instanceName },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success('Instância reiniciada. Aguarde alguns segundos e verifique o status.');
      setTimeout(() => onUpdated(), 3000);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao reiniciar a instância.');
    } finally {
      setRestarting(false);
    }
  };

  const provider = PROVIDER_CONFIG[connection.connection_id];

  // Avisos de problema (bloqueado, qualidade baixa, erro, pendente) expiram após 48h no mesmo status.
  // Usamos status_since (registra desde quando o status atual está ativo) para evitar acúmulo de avisos antigos.
  const STALE_WARNING_MS = 48 * 60 * 60 * 1000;
  const isWarningStatus = ['blocked', 'warning', 'pending_setup', 'error'].includes(connection.status);
  const statusSinceMs = connection.status_since ? new Date(connection.status_since).getTime() : 0;
  const isStale = isWarningStatus && statusSinceMs > 0 && (Date.now() - statusSinceMs) > STALE_WARNING_MS;
  const effectiveStatus = isStale ? 'unknown' : connection.status;

  const statusInfo = STATUS_MAP[effectiveStatus] || STATUS_MAP.unknown;
  const webhookUrl = WEBHOOK_URLS[connection.connection_id];

  const formatDiagnosticValue = (value: unknown) => {
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  };

  const handleSave = async () => {
    if (!provider) return;
    const missing = provider.fields.filter(f => !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Preencha: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-connection', {
        body: { action: 'update', id: connection.id, config: values, label },
      });
      if (error) throw error;
      setDiagnostics((data as { diagnostics?: Record<string, unknown> })?.diagnostics || null);
      toast.success('Conexão atualizada!');
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-connection', {
        body: { action: 'delete', id: connection.id },
      });
      if (error) throw error;
      const resp = data as { error?: string; success?: boolean; deletedConversations?: number };
      if (resp?.error) throw new Error(resp.error);
      toast.success(`Conexão excluída! (${resp?.deletedConversations ?? 0} conversas removidas)`);
      onDeleted();
    } catch (err: any) {
      console.error('[delete connection]', err);
      toast.error(err?.message || 'Erro ao excluir.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-connection-status', {
        body: { configId: connection.id },
      });
      if (error) throw error;

      const response = data as CheckStatusResponse;
      setDiagnostics(response.details || null);

      if (response.status === 'active') {
        toast.success('Conexão validada com sucesso!');
      } else if (response.status === 'blocked') {
        toast.error(`⚠️ Número BLOQUEADO! ${response.details?.phone_status || ''} — Verifique no Meta Business.`);
      } else if (response.status === 'warning') {
        toast.warning('Qualidade do número está baixa (RED). Risco de bloqueio.');
      } else if (response.status === 'pending_setup') {
        toast.warning('Conexão criada, mas ainda pendente de webhook/app.');
      } else {
        toast.error(`API com problema: ${response.details?.error || 'Erro desconhecido'}`);
      }
      onUpdated();
    } catch {
      toast.error('Erro ao verificar status.');
    } finally {
      setChecking(false);
    }
  };

  const copyWebhook = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      toast.success('URL copiada!');
    }
  };

  if (!provider) return null;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${provider.color}`}>
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-card-foreground truncate">
                {connection.label || provider.name}
              </h3>
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusInfo.classes}`}>
                {statusInfo.icon} {statusInfo.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{provider.name}</p>
            {connection.last_checked_at && (
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Verificado {formatDistanceToNow(new Date(connection.last_checked_at), { addSuffix: true, locale: ptBR })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {connection.connection_id === 'zapi' && (
              <button
                onClick={() => setShowQrPanel(!showQrPanel)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors ${showQrPanel ? 'bg-primary/10 text-primary border-primary/30' : ''}`}
                title="Conectar via QR Code"
              >
                <QrCode className="h-3.5 w-3.5" />
              </button>
            )}
            {connection.connection_id === 'evolution' && (
              <button
                onClick={handleRestartEvolution}
                disabled={restarting}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                title="Reiniciar instância (resolve conexão zumbi)"
              >
                {restarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
              title="Verificar status"
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* QR Code Panel for Z-API */}
      {showQrPanel && connection.connection_id === 'zapi' && (
        <div className="border-t border-border px-5 py-4">
          <ZApiQrCodePanel
            configId={connection.id}
            onConnected={() => {
              onUpdated();
            }}
          />
        </div>
      )}

      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome da conexão</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ex: Número Principal, Suporte, Vendas..."
              className="w-full rounded-xl border border-input bg-background py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {webhookUrl && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Webhook URL esperada</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-input bg-secondary/50 px-3 py-2 text-xs text-foreground font-mono truncate">
                  {webhookUrl}
                </div>
                <button
                  onClick={copyWebhook}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  title="Copiar"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {provider.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-sm font-medium text-card-foreground">{field.label}</label>
              <div className="relative">
                <input
                  type={field.sensitive && !showSecrets[field.key] ? 'password' : 'text'}
                  value={values[field.key] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full rounded-xl border border-input bg-background py-2.5 px-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                {field.sensitive && (
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
              </div>
            ))}


          {connection.connection_id === 'whatsapp' && (
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diagnóstico</p>
              <div className="grid gap-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Webhook configurado</span>
                  <span className="text-right font-medium">{formatDiagnosticValue(diagnostics?.configured_webhook_url)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Webhook bate com o esperado</span>
                  <span className="text-right font-medium">{formatDiagnosticValue(diagnostics?.webhook_url_matches)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">App inscrito</span>
                  <span className="text-right font-medium">{formatDiagnosticValue(diagnostics?.app_subscribed)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">WABA ID</span>
                  <span className="text-right font-medium break-all">{formatDiagnosticValue(diagnostics?.waba_id || values.waba_id)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Número</span>
                  <span className="text-right font-medium">{formatDiagnosticValue(diagnostics?.phone || values.phone_display)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Status do Número</span>
                  <span className={`text-right font-medium ${
                    ['FLAGGED', 'RESTRICTED', 'RATE_LIMITED', 'BANNED', 'BLOCKED', 'DISABLED'].includes(String(diagnostics?.phone_status || '').toUpperCase()) 
                      ? 'text-destructive' : ''
                  }`}>{formatDiagnosticValue(diagnostics?.phone_status)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Qualidade</span>
                  <span className={`text-right font-medium ${
                    String(diagnostics?.quality_rating || '').toUpperCase() === 'RED' ? 'text-destructive' 
                    : String(diagnostics?.quality_rating || '').toUpperCase() === 'YELLOW' ? 'text-amber-600' : ''
                  }`}>{formatDiagnosticValue(diagnostics?.quality_rating)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Limite de Mensagens</span>
                  <span className="text-right font-medium">{formatDiagnosticValue(diagnostics?.messaging_limit)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Status da WABA</span>
                  <span className={`text-right font-medium ${
                    ['REJECTED', 'DISABLED', 'FLAGGED', 'RESTRICTED'].includes(String(diagnostics?.waba_status || '').toUpperCase())
                      ? 'text-destructive' : ''
                  }`}>{formatDiagnosticValue(diagnostics?.waba_status)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">Erro</span>
                  <span className="text-right font-medium text-destructive">{formatDiagnosticValue(diagnostics?.error)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Documentação
            </a>
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={deleting}
                    className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Excluir
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir conexão</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir <strong>{connection.label || provider.name}</strong>? As credenciais serão removidas permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
