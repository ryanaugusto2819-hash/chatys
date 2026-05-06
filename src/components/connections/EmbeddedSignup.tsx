import { useState, useEffect, useCallback } from 'react';
import { Loader2, Facebook, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface EmbeddedSignupProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface PhoneInfo {
  id: string;
  display: string;
  verified_name: string;
  waba_id: string;
}

export default function EmbeddedSignup({ onSuccess, onCancel }: EmbeddedSignupProps) {
  const [sdkReady, setSdkReady] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'loading_sdk' | 'ready' | 'signing_up' | 'exchanging' | 'success' | 'error'
  >('idle');
  const [label, setLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resultInfo, setResultInfo] = useState<{
    phone_display?: string;
    verified_name?: string;
    waba_id?: string;
    webhook_status?: string;
  } | null>(null);

  const { currentWorkspace } = useWorkspace();

  // Fetch app config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('meta-embedded-signup', {
          body: { action: 'get_app_id' },
        });
        if (error) throw error;
        setAppId(data.app_id);
        // config_id comes from edge function env
        setConfigId(data.config_id || null);
      } catch {
        setErrorMsg('Erro ao carregar configuração do Facebook.');
        setStatus('error');
      }
    };
    fetchConfig();
  }, []);

  // Load Facebook SDK
  useEffect(() => {
    if (!appId) return;
    setStatus('loading_sdk');

    const initFB = () => {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version: 'v24.0',
      });
      setSdkReady(true);
      setStatus('ready');
    };

    if (window.FB) {
      initFB();
      return;
    }

    window.fbAsyncInit = initFB;

    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [appId]);

  // Exchange authorization code on backend
  const handleCodeExchange = async (code: string) => {
    setStatus('exchanging');
    try {
      const { data, error } = await supabase.functions.invoke('exchange-meta-code', {
        body: {
          code,
          workspaceId: currentWorkspace?.id,
          label: label.trim() || undefined,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha desconhecida');

      setResultInfo({
        phone_display: data.phone_display,
        verified_name: data.verified_name,
        waba_id: data.waba_id,
        webhook_status: data.webhook_status,
      });
      setStatus('success');
      toast.success(`WhatsApp conectado: ${data.phone_display || data.verified_name}`);
      setTimeout(() => onSuccess(), 1500);
    } catch (err: any) {
      console.error('Code exchange error:', err);
      setErrorMsg(err.message || 'Erro ao processar conexão.');
      setStatus('error');
      toast.error('Erro ao conectar WhatsApp.');
    }
  };

  // Launch Facebook Login with Embedded Signup
  const launchLogin = useCallback(() => {
    const loginParams: Record<string, any> = {
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        feature: 'whatsapp_embedded_signup',
        sessionInfoVersion: '3',
        setup: {},
      },
    };

    // Use config_id if available (recommended by Meta)
    if (configId) {
      loginParams.config_id = configId;
    } else {
      loginParams.scope =
        'whatsapp_business_management,whatsapp_business_messaging,business_management';
    }

    console.log('[EmbeddedSignup] FB.login params:', loginParams);

    window.FB.login(
      (response: any) => {
        console.log('[EmbeddedSignup] FB.login response:', response);

        if (response.authResponse?.code) {
          console.log('[EmbeddedSignup] Authorization code received');
          handleCodeExchange(response.authResponse.code);
          return;
        }

        setStatus('ready');
        if (response.status === 'not_authorized') {
          toast.error('Você não autorizou o app.');
        } else {
          toast.info('Login cancelado.');
        }
      },
      loginParams
    );
  }, [configId, handleCodeExchange]);

  const handleEmbeddedSignup = useCallback(() => {
    if (!window.FB || !sdkReady) {
      toast.error('Facebook SDK ainda não carregou. Aguarde...');
      return;
    }

    setStatus('signing_up');
    setErrorMsg('');
    setResultInfo(null);

    // Clear any existing FB session to avoid "JSSDK Unknown Host domain"
    window.FB.getLoginStatus((statusResponse: any) => {
      console.log('[EmbeddedSignup] Current FB status:', statusResponse);

      if (statusResponse.status === 'connected' || statusResponse.status === 'not_authorized') {
        console.log('[EmbeddedSignup] Clearing existing FB session before login');
        window.FB.logout(() => {
          console.log('[EmbeddedSignup] FB session cleared, launching login');
          launchLogin();
        });
      } else {
        launchLogin();
      }
    }, true); // true = force roundtrip, don't use cached status
  }, [sdkReady, launchLogin]);

  const statusLabel: Record<string, string> = {
    loading_sdk: 'Carregando SDK...',
    ready: 'Conectar WhatsApp Oficial',
    idle: 'Conectar WhatsApp Oficial',
    signing_up: 'Autorizando na Meta...',
    exchanging: 'Configurando conexão...',
    success: 'Conectado!',
    error: 'Tentar Novamente',
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Label input */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Nome da conexão (opcional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex: Número Principal, Vendas..."
          className="w-full rounded-xl border border-input bg-background py-2.5 px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Instructions */}
      <div className="rounded-xl bg-secondary/50 p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-medium text-card-foreground text-sm">Como funciona:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Clique no botão abaixo para login com Facebook/Meta</li>
          <li>Escolha ou crie sua conta WhatsApp Business</li>
          <li>Selecione o número que deseja conectar</li>
          <li>Tudo será configurado automaticamente</li>
        </ol>
        <p className="text-[11px] mt-2 text-muted-foreground/70">
          Token, webhook e permissões são configurados sem intervenção manual.
        </p>
      </div>

      {/* Error */}
      {status === 'error' && errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Success */}
      {status === 'success' && resultInfo && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Conexão criada com sucesso!
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            {resultInfo.phone_display && (
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" />
                <span>{resultInfo.phone_display}</span>
              </div>
            )}
            {resultInfo.verified_name && (
              <div>
                <span className="text-muted-foreground/60">Nome: </span>
                {resultInfo.verified_name}
              </div>
            )}
            {resultInfo.waba_id && (
              <div>
                <span className="text-muted-foreground/60">WABA: </span>
                {resultInfo.waba_id}
              </div>
            )}
            {resultInfo.webhook_status && (
              <div>
                <span className="text-muted-foreground/60">Webhook: </span>
                <span
                  className={
                    resultInfo.webhook_status === 'active'
                      ? 'text-emerald-500'
                      : 'text-amber-500'
                  }
                >
                  {resultInfo.webhook_status === 'active' ? 'Ativo' : 'Pendente'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-input px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={handleEmbeddedSignup}
          disabled={
            !sdkReady || status === 'signing_up' || status === 'exchanging' || status === 'success'
          }
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166FE5] transition-colors disabled:opacity-50 active:scale-[0.97]"
        >
          {status === 'signing_up' || status === 'exchanging' || status === 'loading_sdk' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Facebook className="h-4 w-4" />
          )}
          {statusLabel[status] || 'Conectar WhatsApp Oficial'}
        </button>
      </div>
    </div>
  );
}
